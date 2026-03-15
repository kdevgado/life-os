import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [theme, setTheme] = useState<"duna" | "nebula">("duna");

  useEffect(() => {
    const readTheme = () => {
      const current =
        document.documentElement.getAttribute("data-theme") === "nebula"
          ? "nebula"
          : "duna";
      setTheme(current);
    };

    readTheme();

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

    const observer = new MutationObserver(() => {
      readTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      observer.disconnect();
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const iconSrc =
    theme === "nebula" ? "/icons/black/app.png" : "/icons/white/app.png";

  if (installed) {
    return (
      <button className="install-btn installed" type="button" disabled>
        <img src={iconSrc} alt="" className="install-btn__icon" />
        <span>App already installed</span>
      </button>
    );
  }

  return (
    <button
      className="install-btn"
      type="button"
      onClick={handleInstall}
      disabled={!deferredPrompt}
    >
      <img src={iconSrc} alt="" className="install-btn__icon" />
      <span>Download app</span>
    </button>
  );
}