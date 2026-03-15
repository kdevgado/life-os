import React, { useMemo, useState } from "react";
import TasksApp from "../tasks/TasksApp";
import AuthButton from "../login/AuthButton";
import NotesPanel from "../dashboard/NotesPanel";
import DailyBibleVerse from "../dashboard/DailyBibleVerse";
import InstallButton from "../login/InstallButton";
import FullscreenButton from "./FullscreenButton";

type PanelKey =
  | "spaces"
  | "sounds"
  | "calendar"
  | "timer"
  | "tasks"
  | "notes"
  | "bible"
  | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function titleFor(k: Exclude<PanelKey, null>) {
  switch (k) {
    case "spaces":
      return "Spaces";
    case "sounds":
      return "Sounds";
    case "calendar":
      return "Calendar";
    case "timer":
      return "Timer";
    case "tasks":
      return "Tasks";
    case "notes":
      return "Notes";
    case "bible":
      return "Daily Bible Verse";
  }
}

function defaultSizeFor(key: Exclude<PanelKey, null>) {
  switch (key) {
    case "spaces":
      return { w: 375, h: 860 };
    case "sounds":
      return { w: 420, h: 460 };
    case "calendar":
      return { w: 760, h: 640 };
    case "timer":
      return { w: 360, h: 380 };
    case "tasks":
      return { w: 600, h: 640 };
    case "notes":
      return { w: 460, h: 450 };
    case "bible":
      return { w: 0, h: 0 };
  }
}

function minSizeFor(key: Exclude<PanelKey, null>) {
  switch (key) {
    case "spaces":
      return { w: 375, h: 360 };
    case "sounds":
      return { w: 320, h: 320 };
    case "calendar":
      return { w: 620, h: 520 };
    case "timer":
      return { w: 300, h: 260 };
    case "tasks":
      return { w: 560, h: 520 };
    case "notes":
      return { w: 460, h: 300 };
    case "bible":
      return { w: 0, h: 0 };
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
      className={`lo-window lo-window--${panelKey}`}
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

type SpaceWallpaper = {
  id: string;
  title: string;
  src: string;
  type: "image" | "video";
};

const SPACE_WALLPAPERS: SpaceWallpaper[] = [
  {
    id: "duna-sky",
    title: "Duna Sky",
    src: "/images/duna-sky.jpg",
    type: "image",
  },
  {
    id: "nebula-space",
    title: "Nebula Space",
    src: "/images/nebula-space.jpg",
    type: "image",
  },
  {
    id: "sunset",
    title: "Sunset",
    src: "/videos/sunset.mp4",
    type: "video",
  },
  {
    id: "rainy-cafe-japan",
    title: "Rainy Cafe in Japan",
    src: "/videos/rainy-cafe-japan.mp4",
    type: "video",
  },
  {
    id: "videogame",
    title: "Videogame",
    src: "/videos/videogame.mp4",
    type: "video",
  },
];

function SpacesPanel() {
  const [theme, setTheme] = React.useState<"duna" | "nebula">("duna");
  const [selected, setSelected] = React.useState<string>("");
  const [tab, setTab] = React.useState<"video" | "image" | "favourites">(
    "image",
  );
  const [favourites, setFavourites] = React.useState<string[]>([]);

  const [videoMuted, setVideoMuted] = React.useState(true);
  const [videoVolume, setVideoVolume] = React.useState(0.5);
  const selectedWallpaper = React.useMemo(
    () => SPACE_WALLPAPERS.find((item) => item.src === selected),
    [selected],
  );

  React.useEffect(() => {
    const savedMuted = localStorage.getItem("lifeos_wallpaper_muted");
    const savedVolume = localStorage.getItem("lifeos_wallpaper_volume");

    setVideoMuted(savedMuted === null ? true : savedMuted === "true");
    setVideoVolume(savedVolume ? Number(savedVolume) : 0.5);
    try {
      const savedTheme =
        (localStorage.getItem("lifeos_theme") || "duna").toLowerCase() ===
        "nebula"
          ? "nebula"
          : "duna";

      const savedWallpaper =
        localStorage.getItem("lifeos_wallpaper") || SPACE_WALLPAPERS[0].src;

      const savedFavourites = JSON.parse(
        localStorage.getItem("lifeos_wallpaper_favourites") || "[]",
      ) as string[];

      setTheme(savedTheme);
      setSelected(savedWallpaper);
      setFavourites(Array.isArray(savedFavourites) ? savedFavourites : []);
    } catch {
      setTheme("duna");
      setSelected(SPACE_WALLPAPERS[0].src);
      setFavourites([]);
    }
  }, []);

  const applyWallpaper = (src: string) => {
    setSelected(src);
    try {
      localStorage.setItem("lifeos_wallpaper", src);
      window.dispatchEvent(new Event("lifeos:wallpaper"));
    } catch {}
  };

  const toggleFavourite = (id: string) => {
    setFavourites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id];

      try {
        localStorage.setItem(
          "lifeos_wallpaper_favourites",
          JSON.stringify(next),
        );
      } catch {}

      return next;
    });
  };

  const filteredWallpapers = React.useMemo(() => {
    if (tab === "favourites") {
      return SPACE_WALLPAPERS.filter((item) => favourites.includes(item.id));
    }

    return SPACE_WALLPAPERS.filter((item) => item.type === tab);
  }, [tab, favourites]);

  const toggleVideoMuted = () => {
    setVideoMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("lifeos_wallpaper_muted", String(next));
        window.dispatchEvent(new Event("lifeos:wallpaper-audio"));
      } catch {}
      return next;
    });
  };

  const changeVideoVolume = (value: number) => {
    setVideoVolume(value);
    try {
      localStorage.setItem("lifeos_wallpaper_volume", String(value));
      window.dispatchEvent(new Event("lifeos:wallpaper-audio"));
    } catch {}
  };

  return (
    <div className="lo-spaces">
      <div className="lo-spaces__section">
        <div className="lo-spaces__label">
          <strong>Theme</strong>
          <span>Duna / Nebula</span>
        </div>

        <select
          className="lo-spaces__select"
          value={theme}
          onChange={(e) => {
            const v = e.target.value === "nebula" ? "nebula" : "duna";
            setTheme(v);
            localStorage.setItem("lifeos_theme", v);
            document.documentElement.setAttribute("data-theme", v);
          }}
        >
          <option value="duna">Duna</option>
          <option value="nebula">Nebula</option>
        </select>
      </div>

      <div
        className="lo-spaces__tabs"
        role="tablist"
        aria-label="Wallpaper categories"
      >
        <button
          type="button"
          className={`lo-spaces__tab ${tab === "video" ? "is-active" : ""}`}
          onClick={() => setTab("video")}
        >
          Videos
        </button>

        <button
          type="button"
          className={`lo-spaces__tab ${tab === "image" ? "is-active" : ""}`}
          onClick={() => setTab("image")}
        >
          Images
        </button>

        <button
          type="button"
          className={`lo-spaces__tab ${tab === "favourites" ? "is-active" : ""}`}
          onClick={() => setTab("favourites")}
        >
          Favourites
        </button>
      </div>

      <div className="lo-spaces__gallery">
        {filteredWallpapers.length === 0 ? (
          <div className="lo-spaces__empty">No wallpapers here yet.</div>
        ) : (
          filteredWallpapers.map((item) => {
            const isActive = selected === item.src;
            const isFav = favourites.includes(item.id);

            return (
              <button
                key={item.id}
                type="button"
                className={`lo-spaces__card ${isActive ? "is-selected" : ""}`}
                onClick={() => applyWallpaper(item.src)}
              >
                <div className="lo-spaces__preview">
                  {item.type === "image" ? (
                    <div
                      className="lo-spaces__preview-image"
                      style={{ backgroundImage: `url(${item.src})` }}
                    />
                  ) : (
                    <video
                      className="lo-spaces__preview-video"
                      src={item.src}
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  )}

                  <button
                    type="button"
                    className={`lo-spaces__fav ${isFav ? "is-fav" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavourite(item.id);
                    }}
                    aria-label={
                      isFav ? "Remove from favourites" : "Add to favourites"
                    }
                  >
                    {isFav ? "♥" : "♡"}
                  </button>
                </div>

                <div className="lo-spaces__meta">
                  <div className="lo-spaces__title">{item.title}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div className="lo-spaces__footer">
  <div className="lo-spaces__current">
    <div className="lo-spaces__current-label">Selected wallpaper</div>
    <div className="lo-spaces__current-title">
      {selectedWallpaper?.title || "No wallpaper selected"}
    </div>
  </div>

  {tab === "video" && selectedWallpaper?.type === "video" ? (
    <div className="lo-spaces__audio">
      <div className="lo-spaces__audio-row">
        <span className="lo-spaces__audio-label">Wallpaper sound</span>

        <button
          type="button"
          className={`lo-spaces__mute ${videoMuted ? "is-muted" : ""}`}
          onClick={toggleVideoMuted}
        >
          {videoMuted ? "Unmute" : "Mute"}
        </button>
      </div>

      <input
        className="lo-spaces__volume"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={videoVolume}
        onChange={(e) => changeVideoVolume(Number(e.target.value))}
      />
    </div>
  ) : null}
</div>
    </div>
  );
}
function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
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
    const rect = {
      x: c.x - pad,
      y: c.y - pad,
      w: size.w + pad * 2,
      h: size.h + pad * 2,
    };
    const ok = existing.every((ex) => !intersects(rect, ex));
    if (ok) return c;
  }

  // Final fallback: cascade a bit
  const n = existing.length;
  return {
    x: clamp(leftSafe + 40 + ((n * 24) % 240), leftSafe, maxX),
    y: clamp(topSafe + 30 + ((n * 20) % 220), topSafe, maxY),
  };
}

// Timer Panel
function TimerPanel() {
  const [seconds, setSeconds] = React.useState(25 * 60);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="lo-timer">
      <div className="lo-timer__time">
        {mm}:{ss}
      </div>
      <div className="lo-timer__row">
        <button className="lo-btn" onClick={() => setRunning((r) => !r)}>
          {running ? "Pause" : "Start"}
        </button>
        <button
          className="lo-btn"
          onClick={() => {
            setRunning(false);
            setSeconds(25 * 60);
          }}
        >
          Reset
        </button>
      </div>
      <div className="lo-timer__row">
        <button
          className="lo-chip"
          onClick={() => {
            setRunning(false);
            setSeconds(5 * 60);
          }}
        >
          5m
        </button>
        <button
          className="lo-chip"
          onClick={() => {
            setRunning(false);
            setSeconds(15 * 60);
          }}
        >
          15m
        </button>
        <button
          className="lo-chip"
          onClick={() => {
            setRunning(false);
            setSeconds(25 * 60);
          }}
        >
          25m
        </button>
        <button
          className="lo-chip"
          onClick={() => {
            setRunning(false);
            setSeconds(50 * 60);
          }}
        >
          50m
        </button>
      </div>
    </div>
  );
}

// Sounds Panel
function SoundsPanel() {
  const sounds = [
    { id: "rain", label: "Rain", src: "/audio/gentle-rain.mp3" },
    { id: "cafe", label: "Cafe", src: "/audio/cafe.mp3" },
    { id: "fireplace", label: "Fireplace", src: "/audio/fireplace.mp3" },
  ];

  return (
    <div className="lo-sounds">
      <p className="lo-muted">
        Audio files are loaded from <code>public/audio</code>.
      </p>

      {sounds.map((s) => (
        <div key={s.id} className="lo-sounds__item">
          <div className="lo-sounds__label">{s.label}</div>
          <audio controls loop preload="none" src={s.src} />
        </div>
      ))}
    </div>
  );
}

// Calendar Panel
function CalendarPanel() {
  const [now, setNow] = React.useState(() => new Date());
  const y = now.getFullYear();
  const m = now.getMonth();

  const first = new Date(y, m, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = now.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const today = new Date();
  const isThisMonth = today.getFullYear() === y && today.getMonth() === m;

  return (
    <div className="lo-cal">
      <div className="lo-cal__top">
        <button
          className="lo-btn"
          onClick={() => setNow(new Date(y, m - 1, 1))}
        >
          Prev
        </button>
        <div className="lo-cal__title">{monthLabel}</div>
        <button
          className="lo-btn"
          onClick={() => setNow(new Date(y, m + 1, 1))}
        >
          Next
        </button>
      </div>

      <div className="lo-cal__grid lo-cal__dow">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="lo-cal__cell lo-cal__dowcell">
            {d}
          </div>
        ))}
      </div>

      <div className="lo-cal__grid">
        {cells.map((d, i) => {
          const isToday = isThisMonth && d === today.getDate();
          return (
            <div
              key={i}
              className={"lo-cal__cell " + (isToday ? "is-today" : "")}
            >
              {d ?? ""}
            </div>
          );
        })}
      </div>
    </div>
  );
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

  const topGroup = useMemo(
    () => [
      {
        key: "spaces" as const,
        label: "Spaces",
        iconWhite: "/icons/white/spaces.png",
        iconBlack: "/icons/black/spaces.png",
      },
      {
        key: "sounds" as const,
        label: "Sounds",
        iconWhite: "/icons/white/sounds.png",
        iconBlack: "/icons/black/sounds.png",
      },
      {
        key: "calendar" as const,
        label: "Calendar",
        iconWhite: "/icons/white/calendar.png",
        iconBlack: "/icons/black/calendar.png",
      },
    ],
    [],
  );

  const bottomGroup = useMemo(
    () => [
      {
        key: "timer" as const,
        label: "Timer",
        iconWhite: "/icons/white/timer.png",
        iconBlack: "/icons/black/timer.png",
      },
      {
        key: "tasks" as const,
        label: "Tasks",
        iconWhite: "/icons/white/tasks.png",
        iconBlack: "/icons/black/tasks.png",
      },
      {
        key: "notes" as const,
        label: "Notes",
        iconWhite: "/icons/white/notes.png",
        iconBlack: "/icons/black/notes.png",
      },
      {
        key: "bible" as const,
        label: "Bible",
        iconWhite: "/icons/white/bible.png",
        iconBlack: "/icons/black/bible.png",
      },
    ],
    [],
  );

  const [theme, setTheme] = useState<"duna" | "nebula">(() => {
    if (typeof document === "undefined") return "duna";
    const t = document.documentElement.getAttribute("data-theme");
    return t === "nebula" ? "nebula" : "duna";
  });

  React.useEffect(() => {
    const root = document.documentElement;

    const syncTheme = () => {
      const t = root.getAttribute("data-theme");
      setTheme(t === "nebula" ? "nebula" : "duna");
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

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
    setWins((prev) =>
      prev.map((win) => (win.key === key ? { ...win, w, h } : win)),
    );
  }

  return (
    <>
      {/* Top-right login */}
      <div className="lo-utility-dock lo-utility-dock--top-right" aria-label="Quick actions">
        <div className="lo-utility-dock__inner">
          <InstallButton />
          <FullscreenButton />
          <AuthButton className="lo-dock-action" />
        </div>
      </div>

      {/* Left floating dock */}
      <div className="lo-docks" aria-label="Dock groups">
        <nav className="lo-dock lo-dock--top" aria-label="Workspace tools">
          {topGroup.map((it) => {
            const active = wins.some((w) => w.key === it.key);
            return (
              <button
                key={it.key}
                className={"lo-dock__btn " + (active ? "is-active" : "")}
                onClick={(e) => {
                  const key = it.key;
                  const btn = e.currentTarget as HTMLButtonElement;
                  const r = btn.getBoundingClientRect();
                  const preferred = {
                    x: Math.round(r.right + 18),
                    y: Math.round(r.top - 10),
                  };

                  setWins((prev) => {
                    const existing = prev.find((w) => w.key === key);
                    if (existing) return prev.filter((w) => w.key !== key);

                    const size = defaultSizeFor(key);
                    const nextZ = zTop + 1;
                    setZTop(nextZ);

                    const placed = findNonOverlappingPos({
                      preferred,
                      size,
                      existing: prev.map((w) => ({
                        x: w.x,
                        y: w.y,
                        w: w.w,
                        h: w.h,
                      })),
                    });

                    return [
                      ...prev,
                      {
                        key,
                        x: placed.x,
                        y: placed.y,
                        z: nextZ,
                        w: size.w,
                        h: size.h,
                      },
                    ];
                  });
                }}
                aria-label={it.label}
                title={it.label}
                type="button"
              >
                <span className="lo-dock__icon" aria-hidden="true">
                  <img
                    src={theme === "nebula" ? it.iconBlack : it.iconWhite}
                    alt=""
                    className="lo-dock__icon-img"
                  />
                </span>
                <span className="lo-dock__label">{it.label}</span>
              </button>
            );
          })}
        </nav>

        <nav
          className="lo-dock lo-dock--bottom"
          aria-label="Productivity tools"
        >
          {bottomGroup.map((it) => {
            const active = wins.some((w) => w.key === it.key);
            return (
              <button
                key={it.key}
                className={"lo-dock__btn " + (active ? "is-active" : "")}
                onClick={(e) => {
                  const key = it.key;
                  const btn = e.currentTarget as HTMLButtonElement;
                  const r = btn.getBoundingClientRect();
                  const preferred = {
                    x: Math.round(r.right + 18),
                    y: Math.round(r.top - 10),
                  };

                  setWins((prev) => {
                    const existing = prev.find((w) => w.key === key);
                    if (existing) return prev.filter((w) => w.key !== key);

                    const size = defaultSizeFor(key);
                    const nextZ = zTop + 1;
                    setZTop(nextZ);

                    const placed = findNonOverlappingPos({
                      preferred,
                      size,
                      existing: prev.map((w) => ({
                        x: w.x,
                        y: w.y,
                        w: w.w,
                        h: w.h,
                      })),
                    });

                    return [
                      ...prev,
                      {
                        key,
                        x: placed.x,
                        y: placed.y,
                        z: nextZ,
                        w: size.w,
                        h: size.h,
                      },
                    ];
                  });
                }}
                aria-label={it.label}
                title={it.label}
                type="button"
              >
                <span className="lo-dock__icon" aria-hidden="true">
                  <img
                    src={theme === "nebula" ? it.iconBlack : it.iconWhite}
                    alt=""
                    className="lo-dock__icon-img"
                  />
                </span>
                <span className="lo-dock__label">{it.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

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
          {w.key === "notes" && <NotesPanel />}
          {w.key === "timer" && <TimerPanel />}
          {w.key === "sounds" && <SoundsPanel />}
          {w.key === "calendar" && <CalendarPanel />}
          {w.key === "spaces" && <SpacesPanel />}
          {w.key === "bible" && <DailyBibleVerse />}
        </WindowShell>
      ))}
    </>
  );
}
