import React, { useEffect, useMemo, useState } from "react";

type Option = {
  label: string;
  value: string; // path under /public
};

const DEFAULTS: Option[] = [
  { label: "Duna Sky (image)", value: "/images/duna-sky.jpg" },
  { label: "Nebula Space (image)", value: "/images/nebula-space.jpg" },
  { label: "Sunset (video)", value: "/videos/sunset.mp4" },
  { label: "Rainy Cafe (video)", value: "/videos/rainy-cafe.mp4" },
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
      // optional: force refresh so background updates even if component isn't on screen
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
    <div className="iw-widget">
      <div className="iw-widget-title">Wallpaper</div>
      <div className="iw-subtle">Choose your background (independent from theme).</div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <select
          value={value}
          onChange={(e) => save(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(255,255,255,.12)",
            color: "inherit",
            outline: "none",
          }}
        >
          {DEFAULTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div
          style={{
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(0,0,0,.12)",
            height: 160,
          }}
          aria-label="Wallpaper preview"
        >
          {!isVideo && (
            <div
              style={{
                width: "100%",
                height: "100%",
                backgroundImage: `url(${value})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          )}

          {isVideo && (
            <video
              src={value}
              autoPlay
              muted
              loop
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>

        <button
          onClick={reset}
          style={{
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(255,255,255,.10)",
            color: "inherit",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}