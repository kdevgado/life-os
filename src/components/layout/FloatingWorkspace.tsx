import React, { useMemo, useState } from "react";
import TasksApp from "../tasks/TasksApp";
import PlannerApp from "../planner/PlannerApp";
import WallpaperPicker from "../dashboard/WallpaperPicker";
import AuthButton from "../login/AuthButton";

type PanelKey = "tasks" | "planner" | "timeline" | "spaces" | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

  function defaultSizeFor(key: Exclude<PanelKey, null>) {
    switch (key) {
        case "tasks":
        return { w: 420, h: 560 };
        case "planner":
        return { w: 720, h: 620 };
        case "timeline":
        return { w: 520, h: 420 };
        case "spaces":
        return { w: 460, h: 520 };
    }
    }

    function minSizeFor(key: Exclude<PanelKey, null>) {
        switch (key) {
            case "tasks":
            return { w: 340, h: 360 };
            case "planner":
            return { w: 520, h: 420 };
            case "timeline":
            return { w: 380, h: 280 };
            case "spaces":
            return { w: 360, h: 360 };
        }
    }

function WindowShell({
  title,
  panelKey,
  x,
  y,
  z,
  w,
  h,
  onFocus,
  onMove,
  onResize,
  onClose,
  children,
}: {
  title: string;
  panelKey: Exclude<PanelKey, null>;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragging: boolean;
  } | null>(null);

  const resizeRef = React.useRef<{
    startX: number;
    startY: number;
    originW: number;
    originH: number;
    resizing: boolean;
  } | null>(null);

  const onPointerDownBar = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onFocus();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: x,
      originY: y,
      dragging: true,
    };
  };

  const onPointerMoveBar = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.dragging) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    const nx = clamp(d.originX + dx, 70, window.innerWidth - 180);
    const ny = clamp(d.originY + dy, 14, window.innerHeight - 80);

    onMove(nx, ny);
  };

  const onPointerUpBar = () => {
    const d = dragRef.current;
    if (!d?.dragging) return;
    dragRef.current = { ...d, dragging: false };
  };

  const onPointerDownResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onFocus();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originW: w,
      originH: h,
      resizing: true,
    };
  };

  const onPointerMoveResize = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r?.resizing) return;

    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;

    const min = minSizeFor(panelKey);
    const maxW = window.innerWidth - x - 24;
    const maxH = window.innerHeight - y - 24;

    const nextW = clamp(r.originW + dx, min.w, maxW);
    const nextH = clamp(r.originH + dy, min.h, maxH);

    onResize(nextW, nextH);
  };

  const onPointerUpResize = () => {
    const r = resizeRef.current;
    if (!r?.resizing) return;
    resizeRef.current = { ...r, resizing: false };
  };

  return (
    <section
      className="lo-window"
      role="dialog"
      aria-label={title}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        right: "auto",
        transform: "none",
        zIndex: z,
      }}
      onPointerDown={() => onFocus()}
    >
      <header
        className="lo-window__bar lo-window__bar--draggable"
        onPointerDown={onPointerDownBar}
        onPointerMove={onPointerMoveBar}
        onPointerUp={onPointerUpBar}
      >
        <div className="lo-window__title">{title}</div>

        <div className="lo-window__actions">
          <button
            className="lo-window__close"
            aria-label="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            type="button"
          >
            –
          </button>
        </div>
      </header>

      <div className="lo-window__body">{children}</div>

      <div
        className="lo-window__resize"
        onPointerDown={onPointerDownResize}
        onPointerMove={onPointerMoveResize}
        onPointerUp={onPointerUpResize}
      />
    </section>
  );
}

function SpacesPanel() {
  return (
    <div className="lo-spaces">
      <div className="lo-spaces__section">
        <div className="lo-spaces__label">
          <strong>Theme</strong>
          <span>Duna / Nebula</span>
        </div>

        <select
          className="lo-spaces__select"
          defaultValue={
            (localStorage.getItem("lifeos_theme") || "duna").toLowerCase() ===
            "nebula"
              ? "nebula"
              : "duna"
          }
          onChange={(e) => {
            const v = e.target.value === "nebula" ? "nebula" : "duna";
            localStorage.setItem("lifeos_theme", v);
            document.documentElement.setAttribute("data-theme", v);
          }}
        >
          <option value="duna">Duna</option>
          <option value="nebula">Nebula</option>
        </select>
      </div>

      <WallpaperPicker />
    </div>
  );
}

function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function findNonOverlappingPos(args: {
  preferred: { x: number; y: number };
  size: { w: number; h: number };
  existing: { x: number; y: number; w: number; h: number }[];
}) {
  const { preferred, size, existing } = args;

  // Reserve left space for dock + padding
  const leftSafe = 92;
  const topSafe = 80;
  const pad = 18;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const maxX = vw - size.w - 24;
  const maxY = vh - size.h - 24;

  // Candidate positions: a grid starting near preferred
  const stepX = Math.max(40, Math.round(size.w * 0.4));
  const stepY = Math.max(40, Math.round(size.h * 0.35));

  const startX = clamp(preferred.x, leftSafe, maxX);
  const startY = clamp(preferred.y, topSafe, maxY);

  const candidates: { x: number; y: number }[] = [];

  // 1) try preferred first
  candidates.push({ x: startX, y: startY });

  // 2) scan a grid to the right/down then wrap
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 10; col++) {
      const x = clamp(startX + col * stepX, leftSafe, maxX);
      const y = clamp(startY + row * stepY, topSafe, maxY);
      candidates.push({ x, y });
    }
  }

  // 3) full-screen grid fallback (top-left to bottom-right)
  for (let y = topSafe; y <= maxY; y += stepY) {
    for (let x = leftSafe; x <= maxX; x += stepX) {
      candidates.push({ x, y });
    }
  }

  // Choose first candidate that doesn't overlap any existing window (with padding)
  for (const c of candidates) {
    const rect = { x: c.x - pad, y: c.y - pad, w: size.w + pad * 2, h: size.h + pad * 2 };
    const ok = existing.every((ex) => !intersects(rect, ex));
    if (ok) return c;
  }

  // Final fallback: cascade a bit
  const n = existing.length;
  return {
    x: clamp(leftSafe + 40 + (n * 24) % 240, leftSafe, maxX),
    y: clamp(topSafe + 30 + (n * 20) % 220, topSafe, maxY),
  };
}

export default function FloatingWorkspace() {
  type Win = {
    key: Exclude<PanelKey, null>;
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    };

  const [wins, setWins] = useState<Win[]>(() => {
    try {
        const raw = localStorage.getItem("lifeos_windows_v2");
        return raw ? (JSON.parse(raw) as Win[]) : [];
    } catch {
        return [];
    }
    });

  const [zTop, setZTop] = useState<number>(() => {
    const z = wins.reduce((m, w) => Math.max(m, w.z), 50);
    return z || 50;
  });

  React.useEffect(() => {
    try {
        localStorage.setItem("lifeos_windows_v2", JSON.stringify(wins));
    } catch {}
    }, [wins]);

  const items = useMemo(
    () => [
      { key: "tasks" as const, icon: "✅", label: "Tasks" },
      { key: "planner" as const, icon: "💰", label: "Planner" },
      { key: "timeline" as const, icon: "📅", label: "Timeline" },
      { key: "spaces" as const, icon: "🪐", label: "Spaces" },
    ],
    [],
  );

  function titleFor(k: Win["key"]) {
    switch (k) {
      case "tasks":
        return "Tasks";
      case "planner":
        return "Planner";
      case "timeline":
        return "Timeline";
      case "spaces":
        return "Spaces";
    }
  }

  function focusWindow(key: Win["key"]) {
    setZTop((z) => {
      const nextZ = z + 1;
      setWins((prev) =>
        prev.map((w) => (w.key === key ? { ...w, z: nextZ } : w)),
      );
      return nextZ;
    });
  }

  function closeWindow(key: Win["key"]) {
    setWins((prev) => prev.filter((w) => w.key !== key));
  }

  function moveWindow(key: Win["key"], x: number, y: number) {
    setWins((prev) => prev.map((w) => (w.key === key ? { ...w, x, y } : w)));
  }

    function resizeWindow(key: Win["key"], w: number, h: number) {
    setWins((prev) => prev.map((win) => (win.key === key ? { ...win, w, h } : win)));
    }

  return (
    <>
      {/* Top-right login */}
      <div className="lo-auth">
        <AuthButton />
      </div>

      {/* Left floating dock */}
      <nav className="lo-dock" aria-label="Dock">
        {items.map((it) => {
          const active = wins.some((w) => w.key === it.key);
          return (
            <button
              key={it.key}
              className={"lo-dock__btn " + (active ? "is-active" : "")}
              onClick={(e) => {
                const key = it.key as Exclude<PanelKey, null>;
                const btn = e.currentTarget as HTMLButtonElement;
                const r = btn.getBoundingClientRect();

                const x = Math.round(r.right + 18);
                const y = Math.round(r.top - 10);

                setWins((prev) => {
                const existing = prev.find((w) => w.key === key);

                // Toggle close if already open
                if (existing) return prev.filter((w) => w.key !== key);

                const size = defaultSizeFor(key);
                const nextZ = zTop + 1;
                setZTop(nextZ);

                const placed = findNonOverlappingPos({
                    preferred: { x, y },
                    size,
                    existing: prev.map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h })),
                    });

                    return [...prev, { key, x: placed.x, y: placed.y, z: nextZ, w: size.w, h: size.h }];
                });
                }}
              aria-label={it.label}
              title={it.label}
              type="button"
            >
              <span className="lo-dock__icon" aria-hidden="true">
                {it.icon}
              </span>
              <span className="lo-dock__label">{it.label}</span>
            </button>
          );
        })}
      </nav>

      {wins.map((w) => (
        <WindowShell
            key={w.key}
            title={titleFor(w.key)}
            panelKey={w.key}
            x={w.x}
            y={w.y}
            z={w.z}
            w={w.w}
            h={w.h}
            onFocus={() => focusWindow(w.key)}
            onMove={(x, y) => moveWindow(w.key, x, y)}
            onResize={(nw, nh) => resizeWindow(w.key, nw, nh)}
            onClose={() => closeWindow(w.key)}
        >
            {w.key === "tasks" && <TasksApp />}
            {w.key === "planner" && <PlannerApp />}
            {w.key === "timeline" && (
            <div className="lo-placeholder">
                <h3>Timeline</h3>
                <p>Coming soon.</p>
            </div>
            )}
            {w.key === "spaces" && <SpacesPanel />}
        </WindowShell>
        ))}
    </>
  );
}

