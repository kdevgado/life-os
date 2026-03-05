import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = { src?: string };

function isVideo(path: string) {
  return /\.(mp4|webm|ogg)$/i.test(path);
}

export default function ImmersiveBackground({ src }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [picked, setPicked] = useState<string>("");

  // read saved wallpaper once on client
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lifeos_wallpaper") || "";
      if (saved) setPicked(saved);
    } catch {}
  }, []);

  const wallpaper = useMemo(() => {
        if (src) return src;
        if (picked) return picked;

        // fallback if nothing chosen yet (keep your default image)
        return "/images/duna-sky.jpg";
    }, [src, picked]);

    useEffect(() => {
    const handler = () => {
        try {
        const saved = localStorage.getItem("lifeos_wallpaper") || "";
        if (saved) setPicked(saved);
        } catch {}
    };
    window.addEventListener("lifeos:wallpaper", handler);
    return () => window.removeEventListener("lifeos:wallpaper", handler);
    }, []);

  // OPTIONAL: expose to CSS / other components
  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-wallpaper", wallpaper);
    } catch {}
  }, [wallpaper]);

  // --- your existing particle canvas effect ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const resize = () => {
      const { innerWidth: w, innerHeight: h } = window;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 70 }).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.6 + Math.random() * 1.8,
      vx: -0.08 + Math.random() * 0.16,
      vy: -0.05 + Math.random() * 0.10,
      a: 0.05 + Math.random() * 0.18,
    }));

    const loop = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const g = ctx.createRadialGradient(w * 0.3, h * 0.25, 50, w * 0.5, h * 0.6, Math.max(w, h));
      g.addColorStop(0, "rgba(255,255,255,0.06)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(255,255,255,0.65)";
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const video = isVideo(wallpaper);

  return (
    <div className="iw-bg" aria-hidden="true">
      {!video && <div className="iw-wallpaper" style={{ backgroundImage: `url(${wallpaper})` }} />}

      {video && (
        <video
          className="iw-wallpaper-video"
          src={wallpaper}
          autoPlay
          muted
          loop
          playsInline
        />
      )}

      <canvas ref={canvasRef} className="iw-canvas" />
      <div className="iw-vignette" />
    </div>
  );
}