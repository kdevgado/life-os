import React, { useMemo, useState } from "react";
import TasksApp from "../tasks/TasksApp";
import PlannerApp from "../planner/PlannerApp";
import WallpaperPicker from "../dashboard/WallpaperPicker";
import AuthButton from "../login/AuthButton";

type PanelKey = "tasks" | "planner" | "timeline" | "spaces" | null;

function storageKey(panel: string) {
  return `lifeos_window_pos_${panel}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function WindowShell({
  title,
  panelKey,
  x,
  y,
  z,
  onFocus,
  onMove,
  onClose,
  children,
}: {
  title: string;
  panelKey: string;
  x: number;
  y: number;
  z: number;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
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

    const minX = 70;
    const minY = 14;
    const maxX = window.innerWidth - 320;
    const maxY = window.innerHeight - 120;

    const nx = clamp(d.originX + dx, minX, maxX);
    const ny = clamp(d.originY + dy, minY, maxY);

    onMove(nx, ny);
  };

  const onPointerUpBar = () => {
    const d = dragRef.current;
    if (!d?.dragging) return;
    dragRef.current = { ...d, dragging: false };
  };

  return (
    <section
      className="lo-window"
      role="dialog"
      aria-label={title}
      style={{
        left: x,
        top: y,
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
          {/* Minimise-style close */}
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

export default function FloatingWorkspace() {
  type Win = { key: Exclude<PanelKey, null>; x: number; y: number; z: number };

  const [wins, setWins] = useState<Win[]>(() => {
    try {
      const raw = localStorage.getItem("lifeos_windows_v1");
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
      localStorage.setItem("lifeos_windows_v1", JSON.stringify(wins));
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
                  if (existing) {
                    // already open -> focus it
                    const nextZ = zTop + 1;
                    setZTop(nextZ);
                    return prev.map((w) =>
                      w.key === key ? { ...w, z: nextZ } : w,
                    );
                  }

                  // open new
                  const nextZ = zTop + 1;
                  setZTop(nextZ);
                  return [...prev, { key, x, y, z: nextZ }];
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
            onFocus={() => focusWindow(w.key)}
            onMove={(x, y) => moveWindow(w.key, x, y)}
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
