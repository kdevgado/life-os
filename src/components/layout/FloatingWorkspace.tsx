import React, { useMemo, useState } from "react";
import TasksApp from "../tasks/TasksApp";
import AccountMenu from "../account/AccountMenu";
import NotesPanel from "../dashboard/NotesPanel";
import DailyBibleVerse from "../dashboard/DailyBibleVerse";
import FullscreenButton from "../account/FullscreenButton";
import DayCalendarPanel from "../dashboard/DayCalendarPanel";
import SoundsPanel from "../dashboard/SoundsPanel";
import SpacesPanel from "../dashboard/SpacesPanel";

type PanelKey =
  | "spaces"
  | "sounds"
  | "calendar"
  | "calendar-settings"
  | "account-settings"
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
      return "Soundboard";
    case "calendar":
      return "Calendar";
    case "calendar-settings":
      return "Calendar Settings";
    case "account-settings":
      return "My Account";
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
      return { w: 400, h: 1150 };
    case "sounds":
      return { w: 400, h: 1150 };
    case "calendar":
      return { w: 450, h: 1150 };
    case "calendar-settings":
      return { w: 500, h: 350 };
    case "account-settings":
      return { w: 500, h: 420 };
    case "timer":
      return { w: 360, h: 260 };
    case "tasks":
      return { w: 520, h: 500 };
    case "notes":
      return { w: 460, h: 450 };
    case "bible":
      return { w: 280, h: 160 };
  }
}

function minSizeFor(key: Exclude<PanelKey, null>) {
  switch (key) {
    case "spaces":
      return { w: 400, h: 1150 };
    case "sounds":
      return { w: 400, h: 1150 };
    case "calendar":
      return { w: 450, h: 1150 };
    case "calendar-settings":
      return { w: 500, h: 350 };
    case "account-settings":
      return { w: 500, h: 420 };
    case "timer":
      return { w: 300, h: 230 };
    case "tasks":
      return { w: 360, h: 320 };
    case "notes":
      return { w: 460, h: 150 };
    case "bible":
      return { w: 280, h: 160 };
  }
}

const TOP_DOCK_KEYS: Exclude<PanelKey, null>[] = [
  "spaces",
  "sounds",
  "calendar",
];

function isTopDockPanel(key: Exclude<PanelKey, null>) {
  return TOP_DOCK_KEYS.includes(key);
}

function isModalPanel(key: Exclude<PanelKey, null>) {
  return key === "calendar-settings" || key === "account-settings";
}

function isFocusModeHidden() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("is-focus-mode-hidden");
}

function topDockWindowPos() {
  if (typeof window === "undefined") {
    return { x: 92, y: 68 };
  }

  if (isFocusModeHidden()) {
    return {
      x: 6,
      y: 6,
    };
  }

  return {
    x: 92,
    y: 68,
  };
}

function centeredWindowPos(w: number, h: number) {
  if (typeof window === "undefined") {
    return { x: 180, y: 120 };
  }

  return {
    x: Math.max(24, Math.round((window.innerWidth - w) / 2)),
    y: Math.max(24, Math.round((window.innerHeight - h) / 2)),
  };
}

function fixedHeightFor(key: Exclude<PanelKey, null>) {
  switch (key) {
    case "spaces":
      return 1150;
    case "sounds":
      return 1150;
    case "calendar":
      return 1150;
    default:
      return null;
  }
}

const MOBILE_BREAKPOINT = 720;

function getIsMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function mobileWindowPos(w: number, h: number) {
  if (typeof window === "undefined") {
    return { x: 12, y: 72 };
  }

  const topOffset = 72;
  const sideGap = 12;

  return {
    x: Math.max(sideGap, Math.round((window.innerWidth - w) / 2)),
    y: topOffset,
  };
}

function mobileSizeFor(key: Exclude<PanelKey, null>) {
  if (typeof window === "undefined") {
    return defaultSizeFor(key);
  }

  const maxW = window.innerWidth - 24;
  const maxH = window.innerHeight - 120;

  switch (key) {
    case "spaces":
      return {
        w: Math.min(400, maxW),
        h: Math.min(maxH, Math.max(420, Math.round(window.innerHeight * 0.68))),
      };
    case "timer":
      return {
        w: Math.min(360, maxW),
        h: 260,
      };
    case "tasks":
      return {
        w: Math.min(520, maxW),
        h: Math.min(maxH, Math.max(360, Math.round(window.innerHeight * 0.62))),
      };
    case "notes":
      return {
        w: Math.min(380, maxW),
        h: Math.min(maxH, Math.max(320, Math.round(window.innerHeight * 0.56))),
      };
    default:
      return {
        w: Math.min(defaultSizeFor(key).w, maxW),
        h: Math.min(defaultSizeFor(key).h, maxH),
      };
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
  onClose,
  onFocus,
  onMove,
  onResize,
  children,
  resizable = true,
  draggable = true,
  isFocused = false,
}: {
  title: string;
  panelKey: Exclude<PanelKey, null>;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  onClose: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  children: React.ReactNode;
  resizable?: boolean;
  draggable?: boolean;
  isFocused?: boolean;
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
      className={`lo-window lo-window--${panelKey}${isFocused ? " is-focused" : ""}`}
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
        className={`lo-window__bar ${draggable ? "lo-window__bar--draggable" : ""}`.trim()}
        onPointerDown={draggable ? onPointerDownBar : undefined}
        onPointerMove={draggable ? onPointerMoveBar : undefined}
        onPointerUp={draggable ? onPointerUpBar : undefined}
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

      <div
        className="lo-window__body"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>

      {resizable ? (
        <div
          className="lo-window__resize"
          onPointerDown={onPointerDownResize}
          onPointerMove={onPointerMoveResize}
          onPointerUp={onPointerUpResize}
        />
      ) : null}
    </section>
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
  const leftSafe = 84;
  const topSafe = 66;
  const pad = 10;

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

function CalendarSettingsPanel() {
  const ACCOUNTS_KEY = "lifeos_calendar_accounts_v1";
  const EVENTS_KEY = "lifeos_calendar_day_events_v1";
  const PROVIDER_KEY = "lifeos_calendar_provider_v1";
  const [confirmResetOpen, setConfirmResetOpen] = React.useState(false);

  const [accounts, setAccounts] = React.useState<
    Array<{ id: string; provider: "google" | "outlook"; label: string }>
  >(() => {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {}
  }, [accounts]);

  function addAccount(provider: "google" | "outlook") {
    const next = {
      id: `${provider}-${Date.now()}`,
      provider,
      label: provider === "google" ? "Google Calendar" : "Outlook Calendar",
    };

    setAccounts((prev) => [...prev, next]);

    try {
      localStorage.setItem(PROVIDER_KEY, provider);
    } catch {}

    window.dispatchEvent(
      new CustomEvent("lifeos:calendar-connect", { detail: { provider } }),
    );
  }

  function removeAccount(id: string) {
    setAccounts((prev) => {
      const next = prev.filter((item) => item.id !== id);

      try {
        if (next.length === 0) {
          localStorage.removeItem(PROVIDER_KEY);
        } else {
          localStorage.setItem(PROVIDER_KEY, next[next.length - 1].provider);
        }
      } catch {}

      return next;
    });
  }

  function resetCalendar() {
    try {
      localStorage.removeItem(EVENTS_KEY);
      localStorage.removeItem(PROVIDER_KEY);
      localStorage.removeItem(ACCOUNTS_KEY);
    } catch {}

    setAccounts([]);

    window.dispatchEvent(new CustomEvent("lifeos:calendar-reset"));
  }

  // Change the colour of the live time line
  const CALENDAR_NOW_COLOR_KEY = "lifeos_calendar_now_color_v1";

  const [nowLineColor, setNowLineColor] = React.useState(() => {
    try {
      return localStorage.getItem(CALENDAR_NOW_COLOR_KEY) || "#ef4444";
    } catch {
      return "#ef4444";
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_NOW_COLOR_KEY, nowLineColor);
    } catch {}

    window.dispatchEvent(
      new CustomEvent("lifeos:calendar-now-color-change", {
        detail: { color: nowLineColor },
      }),
    );
  }, [nowLineColor]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");

    if (connected !== "google") return;

    const PROVIDER_KEY = "lifeos_calendar_provider_v1";
    const ACCOUNTS_KEY = "lifeos_calendar_accounts_v1";

    try {
      localStorage.setItem(PROVIDER_KEY, "google");

      const raw = localStorage.getItem(ACCOUNTS_KEY);
      const existing = raw
        ? (JSON.parse(raw) as Array<{
            id: string;
            provider: "google" | "outlook";
            label: string;
          }>)
        : [];

      const hasGoogle = existing.some((item) => item.provider === "google");

      if (!hasGoogle) {
        const next = [
          ...existing,
          {
            id: `google-${Date.now()}`,
            provider: "google" as const,
            label: "Google Calendar",
          },
        ];

        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
      }
    } catch {}

    window.dispatchEvent(
      new CustomEvent("lifeos:calendar-connect", {
        detail: { provider: "google" },
      }),
    );

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");

    if (connected !== "google") return;

    const PROVIDER_KEY = "lifeos_calendar_provider_v1";
    const ACCOUNTS_KEY = "lifeos_calendar_accounts_v1";

    try {
      localStorage.setItem(PROVIDER_KEY, "google");

      const raw = localStorage.getItem(ACCOUNTS_KEY);
      const existing = raw
        ? (JSON.parse(raw) as Array<{
            id: string;
            provider: "google" | "outlook";
            label: string;
          }>)
        : [];

      const hasGoogle = existing.some((item) => item.provider === "google");

      if (!hasGoogle) {
        const next = [
          ...existing,
          {
            id: `google-${Date.now()}`,
            provider: "google" as const,
            label: "Google Calendar",
          },
        ];

        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
      }
    } catch {}

    window.dispatchEvent(
      new CustomEvent("lifeos:calendar-connect", {
        detail: { provider: "google" },
      }),
    );

    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  return (
    <div className="lo-cal-settings">
      <div className="lo-cal-settings__section">
        <div className="lo-cal-settings__heading">Add a new calendar</div>

        <div className="lo-cal-settings__actions">
          <button
            type="button"
            className="lo-btn"
            onClick={() => {
              window.location.href = "/.netlify/functions/google-auth";
            }}
          >
            Add Google
          </button>

          <button
            type="button"
            className="lo-btn"
            onClick={() => addAccount("outlook")}
          >
            Add Outlook
          </button>
        </div>
      </div>

      <div className="lo-cal-settings__section">
        <div className="lo-cal-settings__heading">Connected calendars</div>

        {accounts.length === 0 ? (
          <div className="lo-muted">No calendar accounts connected yet.</div>
        ) : (
          <div className="lo-cal-settings__list">
            {accounts.map((account) => (
              <div key={account.id} className="lo-cal-settings__item">
                <div className="lo-cal-settings__meta">
                  <strong>{account.label}</strong>
                  <span className="lo-muted">{account.provider}</span>
                </div>

                <button
                  type="button"
                  className="lo-btn"
                  onClick={() => removeAccount(account.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="lo-cal-settings__section">
        <div className="lo-cal-settings__heading">Live time line colour</div>

        <div className="lo-cal-settings__swatches">
          {[
            "#ef4444",
            "#f97316",
            "#eab308",
            "#22c55e",
            "#06b6d4",
            "#3b82f6",
            "#8b5cf6",
            "#ec4899",
            "#ffffff",
          ].map((color) => {
            const active = nowLineColor === color;

            return (
              <button
                key={color}
                type="button"
                className={`lo-cal-settings__swatch ${active ? "is-active" : ""}`.trim()}
                style={{ backgroundColor: color }}
                aria-label={`Set live time line colour to ${color}`}
                onClick={() => setNowLineColor(color)}
              />
            );
          })}
        </div>
      </div>

      <div className="lo-cal-settings__footer">
        {!confirmResetOpen ? (
          <button
            type="button"
            className="lo-btn lo-cal-settings__reset"
            onClick={() => setConfirmResetOpen(true)}
          >
            Reset calendar
          </button>
        ) : (
          <div className="lo-cal-settings__warning">
            <div className="lo-cal-settings__warning-title">
              Reset calendar?
            </div>
            <div className="lo-cal-settings__warning-text">
              This will delete current work with your calendar, including saved
              events and connected calendar accounts.
            </div>

            <div className="lo-cal-settings__warning-actions">
              <button
                type="button"
                className="lo-btn"
                onClick={() => setConfirmResetOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="lo-btn lo-cal-settings__reset"
                onClick={() => {
                  resetCalendar();
                  setConfirmResetOpen(false);
                }}
              >
                Yes, reset calendar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type IdentityUser = {
  email?: string;
  user_metadata?: {
    full_name?: string;
  };
  update?: (data: any) => Promise<any>;
  delete?: () => Promise<any>;
} | null;

function AccountSettingsPanel() {
  const [identity, setIdentity] = React.useState<any>(null);
  const [user, setUser] = React.useState<IdentityUser>(null);

  const [profileName, setProfileName] = React.useState("");
  const [profileEmail, setProfileEmail] = React.useState("");

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      const mod = await import("netlify-identity-widget");
      const netlifyIdentity = mod.default;

      const APIUrl =
        (import.meta as any).env?.PUBLIC_NETLIFY_IDENTITY_URL ||
        `${window.location.origin}/.netlify/identity`;

      netlifyIdentity.init({ APIUrl });

      const current = netlifyIdentity.currentUser() as IdentityUser;

      if (!mounted) return;

      setIdentity(netlifyIdentity);
      setUser(current || null);
      setProfileEmail(current?.email || "");
      setProfileName(current?.user_metadata?.full_name || "");

      netlifyIdentity.on("login", (nextUser: unknown) => {
        const typedUser = (nextUser as IdentityUser) || null;
        setUser(typedUser);
        setProfileEmail(typedUser?.email || "");
        setProfileName(typedUser?.user_metadata?.full_name || "");
      });

      netlifyIdentity.on("logout", () => {
        setUser(null);
        setProfileEmail("");
        setProfileName("");
      });
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!user || !identity?.currentUser?.()) return;

    try {
      const currentUser = identity.currentUser();

      await currentUser.update({
        data: {
          full_name: profileName,
        },
      });

      if (profileEmail && profileEmail !== currentUser.email) {
        await currentUser.update({
          email: profileEmail,
        });
      }

      const refreshed = identity.currentUser();
      setUser(refreshed || null);
    } catch (error) {
      console.error("Profile update failed:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await identity?.logout?.();
      window.dispatchEvent(new CustomEvent("lifeos:close-account-settings"));
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This cannot be undone.",
    );

    if (!confirmed) return;

    try {
      const currentUser = identity?.currentUser?.();
      await currentUser?.delete?.();
      window.dispatchEvent(new CustomEvent("lifeos:close-account-settings"));
    } catch (error) {
      console.error("Account delete failed:", error);
    }
  };

  if (!user) {
    return (
      <div className="lo-account-settings">
        <div className="lo-account-settings__section">
          <div className="lo-account-settings__heading">Account</div>
          <div className="lo-muted">You are not signed in.</div>
          <button
            type="button"
            className="lo-btn"
            onClick={() => identity?.open?.("login")}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lo-account-settings">
      <div className="lo-account-settings__section">
        <div className="lo-account-settings__heading">Profile</div>

        <label className="lo-account-menu__field">
          <span>Name</span>
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Your name"
          />
        </label>

        <label className="lo-account-menu__field">
          <span>Email</span>
          <input
            value={profileEmail}
            onChange={(e) => setProfileEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <div className="lo-account-settings__meta">
          <strong>Signed in as</strong>
          <span>{user.email || "No email available"}</span>
        </div>
      </div>

      <div className="lo-account-settings__footer">
        <button type="button" className="lo-btn" onClick={handleSaveProfile}>
          Save changes
        </button>

        <button type="button" className="lo-btn" onClick={handleSignOut}>
          Sign out
        </button>

        <button
          type="button"
          className="lo-btn lo-account-settings__danger"
          onClick={handleDeleteAccount}
        >
          Delete account
        </button>
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

  const [isMobile, setIsMobile] = useState(getIsMobileViewport);

  React.useEffect(() => {
    const onResize = () => setIsMobile(getIsMobileViewport());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem("lifeos_windows_v2", JSON.stringify(wins));
    } catch {}
  }, [wins]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const alreadyOpened = localStorage.getItem("lifeos_bible_autoload_v1");
    if (alreadyOpened) return;

    const size = defaultSizeFor("bible");
    const margin = 20;

    const x = window.innerWidth - size.w - margin;
    const y = window.innerHeight - size.h - margin;

    setWins((prev) => {
      if (prev.some((w) => w.key === "bible")) return prev;

      return [
        ...prev,
        {
          key: "bible",
          x,
          y,
          z: 9999,
          w: size.w,
          h: size.h,
        },
      ];
    });

    localStorage.setItem("lifeos_bible_autoload_v1", "true");
  }, []);

  const topGroup = useMemo(
    () => [
      {
        key: "spaces" as const,
        label: "Spaces",
        icon: "/icons/black/spaces.png",
      },
      {
        key: "sounds" as const,
        label: "Sounds",
        icon: "/icons/black/sounds.png",
      },
      {
        key: "calendar" as const,
        label: "Calendar",
        icon: "/icons/black/calendar.png",
      },
    ],
    [],
  );

  const bottomGroup = useMemo(
    () => [
      {
        key: "timer" as const,
        label: "Timer",
        icon: "/icons/black/timer.png",
      },
      {
        key: "tasks" as const,
        label: "Tasks",
        icon: "/icons/black/tasks.png",
      },
      {
        key: "notes" as const,
        label: "Notes",
        icon: "/icons/black/notes.png",
      },
      {
        key: "bible" as const,
        label: "Bible",
        icon: "/icons/black/bible.png",
      },
    ],
    [],
  );

  const mobileGroup = useMemo(
    () => [
      {
        key: "spaces" as const,
        label: "Spaces",
        icon: "/icons/black/spaces.png",
      },
      {
        key: "timer" as const,
        label: "Timer",
        icon: "/icons/black/timer.png",
      },
      {
        key: "notes" as const,
        label: "Notes",
        icon: "/icons/black/notes.png",
      },
      {
        key: "tasks" as const,
        label: "Tasks",
        icon: "/icons/black/tasks.png",
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
      const nextZ = isTopDockPanel(key) ? Math.max(z + 1, 2000) : z + 1;

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
    if (isTopDockPanel(key)) return;

    setWins((prev) =>
      prev.map((win) => (win.key === key ? { ...win, w, h } : win)),
    );
  }

  React.useEffect(() => {
    function openCalendarSettingsWindow() {
      setWins((prev) => {
        const size = defaultSizeFor("calendar-settings");
        const centered = centeredWindowPos(size.w, size.h);
        const existing = prev.find((w) => w.key === "calendar-settings");

        if (existing) {
          return prev.map((w) =>
            w.key === "calendar-settings"
              ? {
                  ...w,
                  x: centered.x,
                  y: centered.y,
                  z: 5000,
                  w: size.w,
                  h: size.h,
                }
              : w,
          );
        }

        return [
          ...prev,
          {
            key: "calendar-settings",
            x: centered.x,
            y: centered.y,
            z: 5000,
            w: size.w,
            h: size.h,
          },
        ];
      });
    }

    window.addEventListener(
      "lifeos:open-calendar-settings",
      openCalendarSettingsWindow as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:open-calendar-settings",
        openCalendarSettingsWindow as EventListener,
      );
    };
  }, []);

  const hasModalWindowOpen = wins.some(
    (w) => w.key === "calendar-settings" || w.key === "account-settings",
  );

  React.useEffect(() => {
    if (!hasModalWindowOpen) return;

    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as HTMLElement;

      // if clicking inside the modal window, ignore
      if (
        target.closest(".lo-window--calendar-settings") ||
        target.closest(".lo-window--account-settings")
      )
        return;

      // otherwise close it
      setWins((prev) =>
        prev.filter(
          (w) => !["calendar-settings", "account-settings"].includes(w.key),
        ),
      );
    }

    window.addEventListener("mousedown", handleOutsideClick);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [hasModalWindowOpen]);

  const [isUiHidden, setIsUiHidden] = useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    const syncHiddenState = () => {
      setIsUiHidden(root.classList.contains("is-focus-mode-hidden"));
    };

    syncHiddenState();

    const observer = new MutationObserver(syncHiddenState);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const syncTopDockWindows = () => {
      if (typeof window === "undefined") return;

      const placed = topDockWindowPos();

      setWins((prev) =>
        prev.map((w) => {
          if (!isTopDockPanel(w.key)) return w;
          if (isMobile) return w;

          const size = defaultSizeFor(w.key);
          const fixedH = fixedHeightFor(w.key);
          const nextH = fixedH ?? w.h ?? size.h;

          return {
            ...w,
            x: placed.x,
            y: placed.y,
            w: w.w || size.w,
            h: nextH,
          };
        }),
      );
    };

    syncTopDockWindows();

    const onResize = () => syncTopDockWindows();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [isMobile, isUiHidden]);

  const topDockZ = Math.max(
    0,
    ...wins.filter((win) => isTopDockPanel(win.key)).map((win) => win.z),
  );

  function toggleWindowFromDock(
    key: Exclude<PanelKey, null>,
    preferred?: { x: number; y: number },
  ) {
    setWins((prev) => {
      const existing = prev.find((w) => w.key === key);

      if (existing) {
        return prev.filter((w) => w.key !== key);
      }

      const nextZ = zTop + 1;
      setZTop(nextZ);

      if (isMobile) {
        const size = mobileSizeFor(key);
        const placed = mobileWindowPos(size.w, size.h);

        return [
          ...prev.filter(
            (w) => !["notes", "bible", "sounds", "calendar"].includes(w.key),
          ),
          {
            key,
            x: placed.x,
            y: placed.y,
            z: nextZ,
            w: size.w,
            h: size.h,
          },
        ];
      }

      if (isTopDockPanel(key)) {
        const withoutTopDockPanels = prev.filter((w) => !isTopDockPanel(w.key));
        const size = defaultSizeFor(key);
        const placed = topDockWindowPos();

        return [
          ...withoutTopDockPanels,
          {
            key,
            x: placed.x,
            y: placed.y,
            z: nextZ,
            w: size.w,
            h: size.h,
          },
        ];
      }

      const size = defaultSizeFor(key);
      const fixedH = fixedHeightFor(key);
      const finalSize = { w: size.w, h: fixedH ?? size.h };

      const placed = preferred
        ? findNonOverlappingPos({
            preferred,
            size: finalSize,
            existing: prev.map((w) => ({
              x: w.x,
              y: w.y,
              w: w.w,
              h: w.h,
            })),
          })
        : centeredWindowPos(finalSize.w, finalSize.h);

      return [
        ...prev,
        {
          key,
          x: placed.x,
          y: placed.y,
          z: nextZ,
          w: finalSize.w,
          h: finalSize.h,
        },
      ];
    });
  }

  React.useEffect(() => {
    if (!isMobile) return;

    setWins((prev) =>
      prev
        .filter((w) =>
          ["spaces", "timer", "tasks", "notes", "calendar-settings"].includes(
            w.key,
          ),
        )
        .map((w) => {
          if (w.key === "calendar-settings") return w;

          const size = mobileSizeFor(w.key);
          const placed = mobileWindowPos(size.w, size.h);

          return {
            ...w,
            x: placed.x,
            y: placed.y,
            w: size.w,
            h: size.h,
          };
        }),
    );
  }, [isMobile]);

  React.useEffect(() => {
    function openAccountSettingsWindow() {
      setWins((prev) => {
        const size = defaultSizeFor("account-settings");
        const centered = centeredWindowPos(size.w, size.h);
        const existing = prev.find((w) => w.key === "account-settings");

        if (existing) {
          return prev.map((w) =>
            w.key === "account-settings"
              ? {
                  ...w,
                  x: centered.x,
                  y: centered.y,
                  z: 5001,
                  w: size.w,
                  h: size.h,
                }
              : w,
          );
        }

        return [
          ...prev,
          {
            key: "account-settings",
            x: centered.x,
            y: centered.y,
            z: 5001,
            w: size.w,
            h: size.h,
          },
        ];
      });
    }

    function closeAccountSettingsWindow() {
      setWins((prev) => prev.filter((w) => w.key !== "account-settings"));
    }

    window.addEventListener(
      "lifeos:open-account-settings",
      openAccountSettingsWindow as EventListener,
    );

    window.addEventListener(
      "lifeos:close-account-settings",
      closeAccountSettingsWindow as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:open-account-settings",
        openAccountSettingsWindow as EventListener,
      );
      window.removeEventListener(
        "lifeos:close-account-settings",
        closeAccountSettingsWindow as EventListener,
      );
    };
  }, []);

  return (
    <>
      {/* Top-right login */}
      <div className="lo-auth">
        <div className="lo-top-dock" aria-label="Quick actions">
          <FullscreenButton />
          <span className="lo-top-dock__divider" aria-hidden="true" />
          <AccountMenu />
        </div>
      </div>

      {/* Left floating dock */}
      <div
        className={`lo-docks${isMobile ? " lo-docks--mobile" : ""}`}
        aria-label="Dock groups"
      >
        {isMobile ? (
          <nav
            className="lo-dock lo-dock--mobile"
            aria-label="Mobile workspace tools"
          >
            {mobileGroup.map((it) => {
              const active = wins.some((w) => w.key === it.key);

              return (
                <button
                  key={it.key}
                  className={"lo-dock__btn " + (active ? "is-active" : "")}
                  onClick={() => toggleWindowFromDock(it.key)}
                  aria-label={it.label}
                  title={it.label}
                  type="button"
                >
                  <span className="lo-dock__icon" aria-hidden="true">
                    <span className="lo-dock__icon" aria-hidden="true">
                      <img src={it.icon} alt="" className="lo-dock__icon-img" />
                    </span>
                  </span>
                  <span className="lo-dock__label">{it.label}</span>
                </button>
              );
            })}
          </nav>
        ) : (
          <>
            <nav className="lo-dock lo-dock--top" aria-label="Workspace tools">
              {topGroup.map((it) => {
                const active = wins.some((w) => w.key === it.key);

                return (
                  <button
                    key={it.key}
                    className={"lo-dock__btn " + (active ? "is-active" : "")}
                    onClick={() => toggleWindowFromDock(it.key)}
                    aria-label={it.label}
                    title={it.label}
                    type="button"
                  >
                    <span className="lo-dock__icon" aria-hidden="true">
                      <img src={it.icon} alt="" className="lo-dock__icon-img" />
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
                      const btn = e.currentTarget as HTMLButtonElement;
                      const r = btn.getBoundingClientRect();

                      toggleWindowFromDock(it.key, {
                        x: Math.round(r.right + 18),
                        y: Math.round(r.top - 10),
                      });
                    }}
                    aria-label={it.label}
                    title={it.label}
                    type="button"
                  >
                    <span className="lo-dock__icon" aria-hidden="true">
                      <img src={it.icon} alt="" className="lo-dock__icon-img" />
                    </span>
                    <span className="lo-dock__label">{it.label}</span>
                  </button>
                );
              })}
            </nav>
          </>
        )}
      </div>

      {hasModalWindowOpen ? (
        <div className="lo-modal-backdrop" aria-hidden="true" />
      ) : null}

      {wins.map((w) => {
        const isFocusedTopDockWindow =
          isTopDockPanel(w.key) && w.z === topDockZ;

        return (
          <WindowShell
            key={w.key}
            title={titleFor(w.key)}
            panelKey={w.key}
            x={w.x}
            y={w.y}
            z={w.z}
            w={w.w}
            h={w.h}
            isFocused={isFocusedTopDockWindow}
            onClose={() => closeWindow(w.key)}
            onFocus={() => {
              if (!isModalPanel(w.key)) focusWindow(w.key);
            }}
            onMove={(x, y) => moveWindow(w.key, x, y)}
            onResize={(width, height) => resizeWindow(w.key, width, height)}
            resizable={
              !isMobile && !isTopDockPanel(w.key) && !isModalPanel(w.key)
            }
            draggable={!isMobile && !isModalPanel(w.key)}
          >
            {w.key === "tasks" && <TasksApp mode="focus" />}
            {w.key === "notes" && <NotesPanel />}
            {w.key === "timer" && <TimerPanel />}
            {w.key === "sounds" && <SoundsPanel />}
            {w.key === "calendar" && (
              <DayCalendarPanel
                startHour={7}
                endHour={22}
                storageKey="lifeos_calendar_day_events_v1"
                providerStorageKey="lifeos_calendar_provider_v1"
                onDropTask={({ task, dateKey, hour }) => {
                  console.log("Focus task scheduled", { task, dateKey, hour });
                }}
              />
            )}
            {w.key === "calendar-settings" ? <CalendarSettingsPanel /> : null}
            {w.key === "account-settings" ? <AccountSettingsPanel /> : null}
            {w.key === "spaces" && <SpacesPanel />}
            {w.key === "bible" && <DailyBibleVerse />}
          </WindowShell>
        );
      })}
    </>
  );
}
