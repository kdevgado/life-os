import React, { useEffect, useMemo, useState } from "react";

type Option = {
  label: string;
  value: string;
};

const DEFAULTS: Option[] = [
  { label: "Duna Sky (image)", value: "/images/duna-sky.jpg" },
  { label: "Nebula Space (image)", value: "/images/nebula-space.jpg" },
  { label: "Sunset (video)", value: "/videos/sunset.mp4" },
  { label: "Rainy Cafe in Japan (video)", value: "/videos/rainy-cafe-japan.mp4" },
];

export default function WallpaperPicker() {
  const [value, setValue] = useState<string>("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lifeos_wallpaper");
      setValue(saved || DEFAULTS[0].value);
    } catch {
      setValue(DEFAULTS[0].value);
    }
  }, []);

  const isVideo = useMemo(() => /\.(mp4|webm|ogg)$/i.test(value), [value]);

  const save = (next: string) => {
    setValue(next);
    try {
      localStorage.setItem("lifeos_wallpaper", next);
      window.dispatchEvent(new Event("lifeos:wallpaper"));
    } catch {}
  };

  const reset = () => {
    const next = DEFAULTS[0].value;
    try {
      localStorage.setItem("lifeos_wallpaper", next);
      window.dispatchEvent(new Event("lifeos:wallpaper"));
    } catch {}
    setValue(next);
  };

  return (
    <div className="iw-widget wallpaper-picker">
      <div className="iw-widget-title">Wallpaper</div>
      <div className="iw-subtle">Choose your background (independent from theme).</div>

      <div className="wallpaper-picker__stack">
        <select
          className="lo-spaces__section"
          value={value}
          onChange={(e) => save(e.target.value)}
        >
          {DEFAULTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="wallpaper-picker__preview" aria-label="Wallpaper preview">
          {!isVideo && (
            <div
              className="wallpaper-picker__image"
              style={{ backgroundImage: `url(${value})` }}
            />
          )}

          {isVideo && (
            <video
              className="wallpaper-picker__video"
              src={value}
              autoPlay
              muted
              loop
              playsInline
            />
          )}
        </div>

        <button
          type="button"
          className="lo-btn wallpaper-picker__reset"
          onClick={reset}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}