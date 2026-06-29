import { useEffect, useMemo, useRef, useState } from "react";

type User = {
  email?: string;
  user_metadata?: { full_name?: string; favourite_verse?: string };
} | null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const APP_INSTALLED_KEY = "lifeos_app_installed";

declare global {
  interface Window {
    __lifeosDeferredPrompt: BeforeInstallPromptEvent | null;
  }
}

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"duna" | "nebula">("duna");

  const [identity, setIdentity] = useState<any>(null);
  const [user, setUser] = useState<User>(null);

  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [profileName, setProfileName] = useState("");
  const [favouriteVerse, setFavouriteVerse] = useState("");

  const menuRef = useRef<HTMLDivElement | null>(null);

  const iconSrc = useMemo(() => {
    return theme === "nebula"
      ? "/icons/white/account.png"
      : "/icons/black/account.png";
  }, [theme]);

  const menuIconBase = theme === "nebula" ? "/icons/white" : "/icons/black";

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
        setProfileName(current?.user_metadata?.full_name || "");
        setFavouriteVerse(current?.user_metadata?.favourite_verse || "");
      }

      netlifyIdentity.on("login", (u: any) => {
        setUser(u || null);
        setProfileName(u?.user_metadata?.full_name || "");
        setFavouriteVerse(u?.user_metadata?.favourite_verse || "");
        netlifyIdentity.close();
      });

      netlifyIdentity.on("logout", () => {
        setUser(null);
        setProfileName("");
        setFavouriteVerse("");
      });
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{
        name?: string;
        favouriteVerse?: string;
      }>).detail;

      if (detail?.name !== undefined) setProfileName(detail.name);
      if (detail?.favouriteVerse !== undefined) {
        setFavouriteVerse(detail.favouriteVerse);
      }
    };

    window.addEventListener("lifeos:profile-updated", handleProfileUpdate);
    return () => {
      window.removeEventListener("lifeos:profile-updated", handleProfileUpdate);
    };
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const savedInstalled =
      window.localStorage.getItem(APP_INSTALLED_KEY) === "true";

    setInstalled(standalone || savedInstalled);

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
      window.localStorage.setItem(APP_INSTALLED_KEY, "true");
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

  const displayName =
    profileName ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    (user ? "Welcome back" : "Guest");

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
          {user ? `Hello, ${displayName}` : "Sign in"}
        </span>
        <span className="lo-account-menu__caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="lo-account-menu__panel" role="menu">
          <div className="lo-account-menu__profile">
            <span className="lo-account-menu__avatar" aria-hidden="true">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span className="lo-account-menu__profile-copy">
              <strong>{displayName}</strong>
              <small>{favouriteVerse || "Add your favourite verse"}</small>
            </span>
          </div>

          <button
            type="button"
            className="lo-account-menu__item"
            onClick={() => {
              if (user) {
                window.dispatchEvent(
                  new CustomEvent("lifeos:open-account-settings"),
                );
              } else {
                identity?.open?.("login");
              }
              setOpen(false);
            }}
          >
            <img src={`${menuIconBase}/account.png`} alt="" />
            <span>My accounts</span>
          </button>

          <div className="lo-account-menu__divider" />

          <button
            type="button"
            className="lo-account-menu__item"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("lifeos:open-appearance-settings"),
              );
              setOpen(false);
            }}
          >
            <img src={`${menuIconBase}/setting.png`} alt="" />
            <span>Appearance</span>
          </button>

          <button
            type="button"
            className="lo-account-menu__item"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("lifeos:open-tips"));
              setOpen(false);
            }}
          >
            <img src={`${menuIconBase}/calendar.png`} alt="" />
            <span>Tips & Tricks</span>
          </button>

          <section className="lo-account-menu__section">
            <div className="lo-account-menu__heading">App</div>

            <button
              type="button"
              className="lo-account-menu__item"
              onClick={handleFullscreen}
            >
              <img src={`${menuIconBase}/fullscreen.png`} alt="" />
              <span>Toggle fullscreen</span>
            </button>

            <button
              type="button"
              className="lo-account-menu__item"
              onClick={handleInstall}
              disabled={installed || !deferredPrompt}
              aria-label={installed ? "App already installed" : "Install app"}
              title={installed ? "App already installed" : "Install app"}
            >
              <img src={`${menuIconBase}/app.png`} alt="" />
              <span>{installed ? "Installed" : "Install"}</span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
