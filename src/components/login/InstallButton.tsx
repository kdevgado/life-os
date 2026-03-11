import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    setIsInstalled(Boolean(standalone));

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      console.log("beforeinstallprompt fired");
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert("Install is not available yet. Check service worker, manifest, and icons.");
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
  };

  return (
    <button
      type="button"
      className="lo-install-btn"
      onClick={handleInstall}
      disabled={!deferredPrompt}
      title={!deferredPrompt ? "Install not available yet" : "Install LifeOS"}
    >
      {!deferredPrompt ? "Install unavailable" : "Install LifeOS"}
    </button>
  );
}