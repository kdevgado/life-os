import React, { useMemo, useState } from "react";
import TasksApp from "../tasks/TasksApp";
import PlannerApp from "../planner/PlannerApp";
import WallpaperPicker from "../dashboard/WallpaperPicker";
import AuthButton from "../login/AuthButton";

type PanelKey = "tasks" | "planner" | "projects" | "timeline" | "spaces" | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function storageKey(panel: string) {
  return `lifeos_window_pos_${panel}`;
}

function readStoredPos(panel: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(panel));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.x === "number" && typeof obj?.y === "number") return obj;
  } catch {}
  return null;
}

function writeStoredPos(panel: string, pos: { x: number; y: number }) {
  try {
    localStorage.setItem(storageKey(panel), JSON.stringify(pos));
  } catch {}
}

function WindowShell({
  title,
  panelKey,
  initialPos,
  onClose,
  children,
}: {
  title: string;
  panelKey: string;
  initialPos?: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Default position if none provided
  const [pos, setPos] = React.useState<{ x: number; y: number }>(() => {
    // Priority: stored -> initialPos -> default
    const stored = readStoredPos(panelKey);
    return stored ?? initialPos ?? { x: 92, y: 90 };
  });

  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragging: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // Only left click / primary
    if (e.button !== 0) return;

    // Capture pointer to keep receiving events during drag
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      dragging: true,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.dragging) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    // Window bounds (rough, but works well)
    const W = 980; // max width we set in CSS
    const minX = 70; // don't cover dock
    const minY = 14;
    const maxX = window.innerWidth - 40; // clamp lightly; true clamp happens below
    const maxY = window.innerHeight - 60;

    // Use viewport clamping (keep title bar accessible)
    const x = clamp(d.originX + dx, minX, maxX);
    const y = clamp(d.originY + dy, minY, maxY);

    setPos({ x, y });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (!d?.dragging) return;
    dragRef.current = { ...d, dragging: false };
    writeStoredPos(panelKey, pos);
  };

  // Persist when pos changes (debounced-ish by pointer up, but also safe here)
  React.useEffect(() => {
    writeStoredPos(panelKey, pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y]);

  return (
    <section
      className="lo-window"
      role="dialog"
      aria-label={title}
      style={{
        left: pos.x,
        top: pos.y,
        right: "auto",
        transform: "none",
      }}
    >
      <header
        className="lo-window__bar lo-window__bar--draggable"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
          defaultValue={(localStorage.getItem("lifeos_theme") || "duna").toLowerCase() === "nebula" ? "nebula" : "duna"}
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
  const [open, setOpen] = useState<PanelKey>(null);
  const [initialPos, setInitialPos] = useState<{ x: number; y: number } | null>(null);

  const items = useMemo(
    () => [
      { key: "tasks" as const, icon: "✅", label: "Tasks" },
      { key: "planner" as const, icon: "💰", label: "Planner" },
      { key: "projects" as const, icon: "🧩", label: "Projects" },
      { key: "timeline" as const, icon: "📅", label: "Timeline" },
      { key: "spaces" as const, icon: "🪐", label: "Spaces" },
    ],
    []
  );

  const title =
    open === "tasks"
      ? "Tasks"
      : open === "planner"
      ? "Planner"
      : open === "projects"
      ? "Projects"
      : open === "timeline"
      ? "Timeline"
      : open === "spaces"
      ? "Spaces"
      : "";

  return (
    <>
      {/* Top-right login */}
      <div className="lo-auth">
        <AuthButton />
      </div>

      {/* Left floating dock */}
      <nav className="lo-dock" aria-label="Dock">
        {items.map((it) => {
          const active = open === it.key;
          return (
            <button
              key={it.key}
              className={"lo-dock__btn " + (active ? "is-active" : "")}
              onClick={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                const r = btn.getBoundingClientRect();

                // Place window slightly to the right of dock, aligned to the icon
                const x = Math.round(r.right + 18);
                const y = Math.round(r.top - 10);

                setInitialPos({ x, y });
                setOpen((cur) => (cur === it.key ? null : it.key));
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

      {open && (
        <WindowShell
            title={title}
            panelKey={open}
            initialPos={initialPos}
            onClose={() => setOpen(null)}
        >
            {open === "tasks" && <TasksApp />}
            {open === "planner" && <PlannerApp />}
            {open === "timeline" && (
            <div className="lo-placeholder">
                <h3>Timeline</h3>
                <p>Coming soon.</p>
            </div>
            )}
            {open === "spaces" && <SpacesPanel />}
        </WindowShell>
        )}
    </>
  );
}