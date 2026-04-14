import { useEffect, useMemo, useRef, useState } from "react";

type User = { email?: string; user_metadata?: { full_name?: string } } | null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __lifeosDeferredPrompt: BeforeInstallPromptEvent | null;
  }
}

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"duna" | "nebula">("duna");
  const [focusMode, setFocusMode] = useState(false);
  const [hideAfterSeconds, setHideAfterSeconds] = useState(8);

  const [identity, setIdentity] = useState<any>(null);
  const [user, setUser] = useState<User>(null);

  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");

  const menuRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const iconSrc = useMemo(() => {
    return theme === "nebula"
      ? "/icons/white/account.png"
      : "/icons/black/account.png";
  }, [theme]);

  useEffect(() => {
    const syncTheme = () => {
      const current =
        document.documentElement.getAttribute("data-theme") === "nebula"
          ? "nebula"
          : "duna";
      setTheme(current);
    };

    const root = document.documentElement;
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const savedFocus = localStorage.getItem("lifeos_focus_mode") === "true";
      const savedHideAfter = Number(
        localStorage.getItem("lifeos_focus_hide_after") || "8",
      );

      setFocusMode(savedFocus);
      setHideAfterSeconds(
        Number.isFinite(savedHideAfter) && savedHideAfter > 0
          ? savedHideAfter
          : 8,
      );

      document.documentElement.classList.toggle("is-focus-mode", savedFocus);
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const mod = await import("netlify-identity-widget");
      const netlifyIdentity = mod.default;

      const APIUrl =
        import.meta.env.PUBLIC_NETLIFY_IDENTITY_URL ||
        `${window.location.origin}/.netlify/identity`;

      netlifyIdentity.init({ APIUrl });

      const current = netlifyIdentity.currentUser() as User;

      if (mounted) {
        setIdentity(netlifyIdentity);
        setUser(current ? current : null);
        setProfileEmail(current?.email || "");
        setProfileName(current?.user_metadata?.full_name || "");
      }

      netlifyIdentity.on("login", (u: any) => {
        setUser(u || null);
        setProfileEmail(u?.email || "");
        setProfileName(u?.user_metadata?.full_name || "");
        netlifyIdentity.close();
      });

      netlifyIdentity.on("logout", () => {
        setUser(null);
        setProfileEmail("");
        setProfileName("");
      });
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;

    setInstalled(standalone);

    if (window.__lifeosDeferredPrompt) {
      console.log("[PWA] found saved deferred prompt");
      setDeferredPrompt(window.__lifeosDeferredPrompt);
    } else {
      setDeferredPrompt(null);
    }

    const onInstallAvailable = () => {
      console.log("[PWA] install available event received");
      setDeferredPrompt(window.__lifeosDeferredPrompt ?? null);
    };

    const onInstalled = () => {
      console.log("[PWA] installed event received");
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("lifeos:install-available", onInstallAvailable);
    window.addEventListener("lifeos:installed", onInstalled);

    return () => {
      window.removeEventListener(
        "lifeos:install-available",
        onInstallAvailable,
      );
      window.removeEventListener("lifeos:installed", onInstalled);
    };
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current) return;

      const target = event.target as Node;

      // if clicking outside menu → close
      if (!menuRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!focusMode) {
      document.documentElement.classList.remove("is-focus-mode-hidden");
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      return;
    }

    document.documentElement.classList.add("is-focus-mode");
    document.documentElement.classList.remove("is-focus-mode-hidden");

    const resetHideTimer = () => {
      document.documentElement.classList.remove("is-focus-mode-hidden");
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);

      hideTimerRef.current = window.setTimeout(() => {
        document.documentElement.classList.add("is-focus-mode-hidden");
      }, hideAfterSeconds * 1000);
    };

    resetHideTimer();

    const events = ["mousemove", "mousedown", "keydown", "touchstart"];
    events.forEach((name) => window.addEventListener(name, resetHideTimer));

    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      events.forEach((name) =>
        window.removeEventListener(name, resetHideTimer),
      );
    };
  }, [focusMode, hideAfterSeconds]);

  const toggleTheme = () => {
    const next = theme === "nebula" ? "duna" : "nebula";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("lifeos_theme", next);
    setTheme(next);
  };

  const toggleFocusMode = () => {
    const next = !focusMode;
    setFocusMode(next);
    localStorage.setItem("lifeos_focus_mode", String(next));
    document.documentElement.classList.toggle("is-focus-mode", next);
    if (!next) {
      document.documentElement.classList.remove("is-focus-mode-hidden");
    }
  };

  const updateHideAfter = (value: number) => {
    const next = Math.max(3, Math.min(120, value));
    setHideAfterSeconds(next);
    localStorage.setItem("lifeos_focus_hide_after", String(next));
  };

  const handleInstall = async () => {
    const promptEvent = deferredPrompt || window.__lifeosDeferredPrompt;

    if (!promptEvent || installed) return;

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    console.log("[PWA] userChoice =", choice);

    window.__lifeosDeferredPrompt = null;
    setDeferredPrompt(null);
  };

  const handleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen toggle failed:", error);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      const currentUser = identity?.currentUser?.();
      if (!currentUser) return;

      await currentUser.update({
        data: {
          full_name: profileName,
        },
      });

      if (profileEmail && profileEmail !== currentUser.email) {
        await currentUser.update({
          email: profileEmail,
        });
      }

      const refreshed = identity.currentUser();
      setUser(refreshed || null);
    } catch (error) {
      console.error("Profile update failed:", error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!identity?.currentUser?.()) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This cannot be undone.",
    );

    if (!confirmed) return;

    try {
      const currentUser = identity.currentUser();
      await currentUser?.delete?.();
      setUser(null);
      setProfileEmail("");
      setProfileName("");
    } catch (error) {
      console.error("Account delete failed:", error);
    }
  };

  return (
    <div className="lo-account-menu" ref={menuRef}>
      <button
        type="button"
        className="lo-account-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <img src={iconSrc} alt="" className="lo-account-menu__icon" />
        <span className="lo-account-menu__label">
          {user
            ? `Hello, ${
                profileName ||
                user.user_metadata?.full_name ||
                user.email?.split("@")[0] ||
                "there"
              }`
            : "Sign in"}
        </span>
        <span className="lo-account-menu__caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="lo-account-menu__panel" role="menu">
          <section className="lo-account-menu__section">
            <div className="lo-account-menu__heading">My account</div>

            {!user ? (
              <button
                type="button"
                className="lo-account-menu__item"
                onClick={() => identity?.open("login")}
              >
                Sign in
              </button>
            ) : (
              <button
                type="button"
                className="lo-account-menu__item"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("lifeos:open-account-settings"),
                  );
                  setOpen(false);
                }}
              >
                My account
              </button>
            )}
          </section>

          <section className="lo-account-menu__section">
            <div className="lo-account-menu__heading">Appearance</div>

            <button
              type="button"
              className="lo-account-menu__item"
              onClick={toggleTheme}
            >
              Theme: {theme === "nebula" ? "Nebula" : "Duna"}
            </button>
          </section>

          <section className="lo-account-menu__section">
            <div className="lo-account-menu__heading">Focus mode</div>

            <label className="lo-account-menu__check">
              <input
                type="checkbox"
                checked={focusMode}
                onChange={toggleFocusMode}
              />
              <span>Hide Elements</span>
            </label>

            <label className="lo-account-menu__field">
              <span>Hide after</span>

              <div className="lo-account-menu__range-wrap">
                <input
                  className="lo-account-menu__range"
                  type="range"
                  min={3}
                  max={80}
                  step={1}
                  value={hideAfterSeconds}
                  onChange={(e) => updateHideAfter(Number(e.target.value))}
                />
                <div className="lo-account-menu__range-meta">
                  <strong>{hideAfterSeconds}s</strong>
                </div>
              </div>
            </label>
          </section>

          <section className="lo-account-menu__section">
            <div className="lo-account-menu__heading">App</div>

            <button
              type="button"
              className="lo-account-menu__item"
              onClick={handleFullscreen}
            >
              Toggle fullscreen
            </button>

            <button
              type="button"
              className="lo-account-menu__item"
              onClick={handleInstall}
              disabled={installed || !deferredPrompt}
            >
              {installed
                ? "App already installed"
                : deferredPrompt
                  ? "Download app"
                  : "Install unavailable"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
