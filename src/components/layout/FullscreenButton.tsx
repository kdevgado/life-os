import { useEffect, useState } from "react";

export default function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [theme, setTheme] = useState<"black" | "white">("white");

  useEffect(() => {
    setSupported(Boolean(document.fullscreenEnabled));
    setIsFullscreen(Boolean(document.fullscreenElement));

    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const syncTheme = () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      setTheme(currentTheme === "nebula" ? "black" : "white");
    };

    syncTheme();

    document.addEventListener("fullscreenchange", syncFullscreen);

    const observer = new MutationObserver(() => {
      syncTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      observer.disconnect();
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen toggle failed:", error);
    }
  };

  if (!supported) return null;

  const iconSrc = `/icons/${theme}/fullscreen.png`;

  return (
    <button
      type="button"
      className="lo-icon-btn"
      onClick={toggleFullscreen}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      <img
        src={iconSrc}
        alt=""
        className="lo-icon-btn__img"
        draggable="false"
      />
    </button>
  );
}