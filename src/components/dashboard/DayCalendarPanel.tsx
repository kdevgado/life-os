import * as React from "react";

export type CalendarProvider = "google" | "outlook" | null;

export type DayCalendarEvent = {
  id: string;
  title: string;
  startHour: number;
  durationHours?: number;
  sourceTaskId?: string;
  provider?: "google" | "outlook" | "local";
};

export type DayCalendarDroppedTask = {
  id?: string;
  title: string;
};

export type DayCalendarProps = {
  storageKey?: string;
  providerStorageKey?: string;
  className?: string;
  compact?: boolean;
  showSettings?: boolean;
  showTodayButton?: boolean;
  startHour?: number;
  endHour?: number;
  initialDate?: Date;
  onConnectProvider?: (provider: Exclude<CalendarProvider, null>) => void;
  onDropTask?: (payload: {
    task: DayCalendarDroppedTask;
    dateKey: string;
    hour: number;
  }) => void;
  onEventsChange?: (eventsByDay: Record<string, DayCalendarEvent[]>) => void;
};

function getDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDate(date?: Date) {
  const next = new Date(date ?? new Date());
  next.setHours(0, 0, 0, 0);
  return next;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function extractDraggedTask(ev: React.DragEvent): DayCalendarDroppedTask | null {
  const json =
    ev.dataTransfer.getData("application/x-lifeos-task") ||
    ev.dataTransfer.getData("application/json");

  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        id?: string;
        title?: string;
        text?: string;
      };
      return {
        id: parsed.id,
        title: String(parsed.title || parsed.text || "Task"),
      };
    } catch {}
  }

  const plain = ev.dataTransfer.getData("text/plain");
  if (plain) {
    return { title: plain };
  }

  return null;
}

export default function DayCalendarPanel({
  storageKey = "lifeos_calendar_day_events_v1",
  providerStorageKey = "lifeos_calendar_provider_v1",
  className = "",
  compact = false,
  showSettings = true,
  showTodayButton = true,
  startHour = 6,
  endHour = 22,
  initialDate,
  onConnectProvider,
  onDropTask,
  onEventsChange,
}: DayCalendarProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date>(() =>
    normalizeDate(initialDate),
  );

  const [eventsByDay, setEventsByDay] = React.useState<
    Record<string, DayCalendarEvent[]>
  >(() => readJson<Record<string, DayCalendarEvent[]>>(storageKey, {}));

  const [connectedProvider, setConnectedProvider] = React.useState<CalendarProvider>(
    () => readJson<CalendarProvider>(providerStorageKey, null),
  );

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [dragOverHour, setDragOverHour] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(eventsByDay));
    } catch {}
  }, [eventsByDay, storageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (connectedProvider) {
        window.localStorage.setItem(providerStorageKey, connectedProvider);
      } else {
        window.localStorage.removeItem(providerStorageKey);
      }
    } catch {}
  }, [connectedProvider, providerStorageKey]);

  React.useEffect(() => {
    onEventsChange?.(eventsByDay);
  }, [eventsByDay, onEventsChange]);

  const dayKey = React.useMemo(() => getDateKey(selectedDate), [selectedDate]);
  const todayKey = React.useMemo(() => getDateKey(new Date()), []);
  const dayEvents = eventsByDay[dayKey] || [];

  const visibleHours = React.useMemo(() => {
    const safeStart = Math.max(0, Math.min(23, startHour));
    const safeEnd = Math.max(safeStart + 1, Math.min(24, endHour));
    return Array.from({ length: safeEnd - safeStart }, (_, index) => safeStart + index);
  }, [startHour, endHour]);

  const dateTitle = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: compact ? "short" : "long",
    year: compact ? undefined : "numeric",
  });

  function shiftDay(amount: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + amount);
      next.setHours(0, 0, 0, 0);
      return next;
    });
  }

  function goToToday() {
    setSelectedDate(normalizeDate());
  }

  function formatHour(hour: number) {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function addEventAtHour(hour: number, title = "New event") {
    const newEvent: DayCalendarEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      startHour: hour,
      durationHours: 1,
      provider: "local",
    };

    setEventsByDay((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] || []), newEvent].sort(
        (a, b) => a.startHour - b.startHour,
      ),
    }));
  }

  function removeEvent(id: string) {
    setEventsByDay((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] || []).filter((item) => item.id !== id),
    }));
  }

  function connectProvider(provider: Exclude<CalendarProvider, null>) {
    setConnectedProvider(provider);
    setSettingsOpen(false);
    onConnectProvider?.(provider);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("lifeos:calendar-connect", { detail: { provider } }),
      );
    }
  }

  function disconnectProvider() {
    setConnectedProvider(null);
    setSettingsOpen(false);
  }

  function handleDropOnHour(ev: React.DragEvent, hour: number) {
    ev.preventDefault();
    setDragOverHour(null);

    const task = extractDraggedTask(ev);
    if (!task) return;

    const newEvent: DayCalendarEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: task.title,
      startHour: hour,
      durationHours: 1,
      sourceTaskId: task.id,
      provider: "local",
    };

    setEventsByDay((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] || []), newEvent].sort(
        (a, b) => a.startHour - b.startHour,
      ),
    }));

    onDropTask?.({ task, dateKey: dayKey, hour });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("lifeos:task-scheduled", {
          detail: {
            taskId: task.id || null,
            title: task.title,
            date: dayKey,
            hour,
          },
        }),
      );
    }
  }

  return (
    <section className={`lo-daycal ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <div className="lo-daycal__top">
        <div className="lo-daycal__nav">
          <button className="lo-btn" onClick={() => shiftDay(-1)} type="button" aria-label="Previous day">
            ←
          </button>

          <div className="lo-daycal__titlewrap">
            <div className="lo-daycal__title">{dateTitle}</div>
            <div className="lo-daycal__subtitle">
              {dayKey === todayKey ? "Today" : "Day view"}
            </div>
          </div>

          <button className="lo-btn" onClick={() => shiftDay(1)} type="button" aria-label="Next day">
            →
          </button>

          {showTodayButton ? (
            <button className="lo-btn lo-daycal__today" onClick={goToToday} type="button">
              Today
            </button>
          ) : null}
        </div>

        {showSettings ? (
          <div className="lo-daycal__tools">
            <div className="lo-daycal__provider">
              {connectedProvider ? (
                <span className="lo-chip">
                  {connectedProvider === "google" ? "Google connected" : "Outlook connected"}
                </span>
              ) : (
                <span className="lo-chip">Not connected</span>
              )}
            </div>

            <div className="lo-daycal__settingswrap">
              <button
                className="lo-btn lo-daycal__gear"
                type="button"
                aria-label="Calendar settings"
                onClick={() => setSettingsOpen((prev) => !prev)}
              >
                ⚙
              </button>

              {settingsOpen ? (
                <div className="lo-daycal__settings">
                  <div className="lo-daycal__settings-title">Calendar connection</div>

                  <button
                    type="button"
                    className="lo-daycal__settings-btn"
                    onClick={() => connectProvider("google")}
                  >
                    Connect Google Calendar
                  </button>

                  <button
                    type="button"
                    className="lo-daycal__settings-btn"
                    onClick={() => connectProvider("outlook")}
                  >
                    Connect Outlook Calendar
                  </button>

                  {connectedProvider ? (
                    <button
                      type="button"
                      className="lo-daycal__settings-btn is-danger"
                      onClick={disconnectProvider}
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="lo-daycal__body">
        {visibleHours.map((hour) => {
          const slotEvents = dayEvents.filter((item) => item.startHour === hour);
          const isDropTarget = dragOverHour === hour;

          return (
            <div
              key={hour}
              className={`lo-daycal__row ${isDropTarget ? "is-drop-target" : ""}`.trim()}
              onDragOver={(ev) => {
                ev.preventDefault();
                setDragOverHour(hour);
              }}
              onDragEnter={(ev) => {
                ev.preventDefault();
                setDragOverHour(hour);
              }}
              onDragLeave={() => {
                setDragOverHour((prev) => (prev === hour ? null : prev));
              }}
              onDrop={(ev) => handleDropOnHour(ev, hour)}
              onDoubleClick={() => addEventAtHour(hour)}
            >
              <div className="lo-daycal__hour">{formatHour(hour)}</div>

              <div className="lo-daycal__slot">
                {slotEvents.length === 0 ? (
                  <div className="lo-daycal__emptyline" />
                ) : (
                  slotEvents.map((event) => (
                    <div key={event.id} className="lo-daycal__event">
                      <div className="lo-daycal__event-main">
                        <strong>{event.title}</strong>
                        <span>{formatHour(event.startHour)}</span>
                      </div>

                      <button
                        type="button"
                        className="lo-daycal__event-remove"
                        onClick={() => removeEvent(event.id)}
                        aria-label={`Remove ${event.title}`}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}