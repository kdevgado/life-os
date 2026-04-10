import { useEffect, useMemo, useRef, useState } from "react";

type User = { email?: string; user_metadata?: { full_name?: string } } | null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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

  const [accountWindowOpen, setAccountWindowOpen] = useState(false);

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
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
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
    if (!deferredPrompt || installed) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
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
      setAccountWindowOpen(false);
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
                  setAccountWindowOpen(true);
                  setOpen(false);
                }}
              >
                Open account
              </button>
            )}
          </section>

          {accountWindowOpen && user && (
            <div
              className="lo-account-window__backdrop"
              onClick={() => setAccountWindowOpen(false)}
            >
              <div
                className="lo-account-window"
                role="dialog"
                aria-modal="true"
                aria-label="My account"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="lo-account-window__header">
                  <h2 className="lo-account-window__title">My account</h2>
                  <button
                    type="button"
                    className="lo-account-window__close"
                    onClick={() => setAccountWindowOpen(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="lo-account-window__body">
                  <label className="lo-account-menu__field">
                    <span>Name</span>
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                    />
                  </label>

                  <label className="lo-account-menu__field">
                    <span>Email</span>
                    <input
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>

                  <div className="lo-account-window__meta">
                    <div>
                      <strong>Signed in as:</strong>
                    </div>
                    <div>{user.email || "No email available"}</div>
                  </div>
                </div>

                <div className="lo-account-window__footer">
                  <button
                    type="button"
                    className="lo-account-menu__item"
                    onClick={handleSaveProfile}
                  >
                    Save changes
                  </button>

                  <button
                    type="button"
                    className="lo-account-menu__item"
                    onClick={() => {
                      identity?.logout();
                      setAccountWindowOpen(false);
                    }}
                  >
                    Sign out
                  </button>

                  <button
                    type="button"
                    className="lo-account-menu__item is-danger"
                    onClick={handleDeleteAccount}
                  >
                    Delete account
                  </button>
                </div>
              </div>
            </div>
          )}

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
