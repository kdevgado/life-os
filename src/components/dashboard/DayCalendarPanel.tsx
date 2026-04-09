import * as React from "react";

export type CalendarProvider = "google" | "outlook" | null;

export type DayCalendarEvent = {
  id: string;
  title: string;
  startHour: number;
  startMinute?: 0 | 15 | 30 | 45;
  durationHours?: number;
  sourceTaskId?: string;
  sourceTaskStatus?: "todo" | "doing" | "done";
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

type EventLayout = {
  id: string;
  column: number;
  columns: number;
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

function extractDraggedTask(
  ev: React.DragEvent,
): DayCalendarDroppedTask | null {
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

function clampMinuteToQuarter(minute: number): 0 | 15 | 30 | 45 {
  if (minute < 15) return 0;
  if (minute < 30) return 15;
  if (minute < 45) return 30;
  return 45;
}

function clampDurationToQuarter(hours: number) {
  return Math.max(0.25, Math.round(hours * 4) / 4);
}

function playTaskCompleteSound() {
  if (typeof window === "undefined") return;

  const audio = new Audio("/audio/task-complete.mp3");
  audio.volume = 0.5;
  void audio.play().catch(() => {
    // ignore autoplay restrictions
  });
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
  // States
  const [selectedDate, setSelectedDate] = React.useState<Date>(() =>
    normalizeDate(initialDate),
  );

  const [eventsByDay, setEventsByDay] = React.useState<
    Record<string, DayCalendarEvent[]>
  >(() => readJson<Record<string, DayCalendarEvent[]>>(storageKey, {}));

  const [connectedProvider, setConnectedProvider] =
    React.useState<CalendarProvider>(() =>
      readJson<CalendarProvider>(providerStorageKey, null),
    );

  const [dragOverHour, setDragOverHour] = React.useState<number | null>(null);

  const [theme, setTheme] = React.useState("duna");
  // Show current time
  const [now, setNow] = React.useState(new Date());
  // Change the colour of the live time line
  const CALENDAR_NOW_COLOR_KEY = "lifeos_calendar_now_color_v1";
  const [nowLineColor, setNowLineColor] = React.useState(() => {
    try {
      return localStorage.getItem(CALENDAR_NOW_COLOR_KEY) || "#ef4444";
    } catch {
      return "#ef4444";
    }
  });

  const [draggingEventId, setDraggingEventId] = React.useState<string | null>(
    null,
  );

  const [dragPreview, setDragPreview] = React.useState<{
    id: string;
    hour: number;
    minute: 0 | 15 | 30 | 45;
  } | null>(null);

  // Ref States
  const draggingEventIdRef = React.useRef<string | null>(null);
  const dragPreviewRef = React.useRef<{
    id: string;
    hour: number;
    minute: 0 | 15 | 30 | 45;
  } | null>(null);
  const dragPointerOffsetRef = React.useRef(0);
  const pointerDownEventRef = React.useRef<{
    id: string;
    taskId?: string;
    startX: number;
    startY: number;
    offsetY: number;
  } | null>(null);

  const hasDraggedRef = React.useRef(false);

  const [resizingEventId, setResizingEventId] = React.useState<string | null>(
    null,
  );
  const [resizePreview, setResizePreview] = React.useState<{
    id: string;
    startHour: number;
    startMinute: 0 | 15 | 30 | 45;
    durationHours: number;
    edge: "top" | "bottom";
  } | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const [providerEventsByDay, setProviderEventsByDay] = React.useState<
    Record<string, DayCalendarEvent[]>
  >({});

  // Memo / derived values states
  const dayKey = React.useMemo(() => getDateKey(selectedDate), [selectedDate]);
  const todayKey = React.useMemo(() => getDateKey(new Date()), []);
  const localDayEvents = eventsByDay[dayKey] || [];
  const providerDayEvents = providerEventsByDay[dayKey] || [];
  const dayEvents = React.useMemo(() => {
    return [...localDayEvents, ...providerDayEvents].sort((a, b) => {
      const aValue = a.startHour * 60 + (a.startMinute || 0);
      const bValue = b.startHour * 60 + (b.startMinute || 0);
      return aValue - bValue;
    });
  }, [localDayEvents, providerDayEvents]);
  const visibleHours = React.useMemo(() => {
    const safeStart = Math.max(0, Math.min(23, startHour));
    const safeEnd = Math.max(safeStart + 1, Math.min(24, endHour));
    const hours: number[] = [];
    for (let hour = safeStart; hour < safeEnd; hour += 1) {
      hours.push(hour);
    }
    return hours;
  }, [startHour, endHour]);
  const dateTitle = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: compact ? "short" : "long",
    year: compact ? undefined : "numeric",
  });
  const gearIcon =
    theme === "nebula"
      ? "/icons/white/setting.png"
      : "/icons/black/setting.png";
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const minuteProgress = currentMinute / 60; // 0 → 1
  const resizingEventIdRef = React.useRef<string | null>(null);
  const resizePreviewRef = React.useRef<{
    id: string;
    startHour: number;
    startMinute: 0 | 15 | 30 | 45;
    durationHours: number;
    edge: "top" | "bottom";
  } | null>(null);
  const eventLayout = React.useMemo(() => {
    return buildEventLayout(dayEvents);
  }, [dayEvents, dragPreview, resizePreview]);

  function removeEvent(id: string) {
    let linkedTaskId: string | undefined;

    setEventsByDay((prev) => {
      const existing = prev[dayKey] || [];
      const target = existing.find((item) => item.id === id);
      linkedTaskId = target?.sourceTaskId;

      return {
        ...prev,
        [dayKey]: existing.filter((item) => item.id !== id),
      };
    });
  }

  function cancelDragAndResize() {
    dragPointerOffsetRef.current = 0;
    setDraggingEventId(null);
    setDragPreview(null);
    setDragOverHour(null);
    setResizingEventId(null);
    setResizePreview(null);
  }

  // Drag/resize logic
  function getDurationFromTrackPointer(
    clientY: number,
    trackEl: HTMLDivElement,
    startHour: number,
    startMinute: 0 | 15 | 30 | 45,
  ) {
    const trackRect = trackEl.getBoundingClientRect();
    const relativeY = clientY - trackRect.top;

    const hourHeight = trackRect.height / visibleHours.length;
    const rawHourIndex = relativeY / hourHeight;

    const clampedHourIndex = Math.max(
      0,
      Math.min(visibleHours.length - 0.001, rawHourIndex),
    );
    const hourOffset = Math.floor(clampedHourIndex);
    const withinHour = clampedHourIndex - hourOffset;

    const targetHour = visibleHours[0] + hourOffset;
    const rawMinute = withinHour * 60;
    const snappedMinute = clampMinuteToQuarter(Math.round(rawMinute / 15) * 15);

    const startTotal = startHour * 60 + startMinute;
    const endTotal = targetHour * 60 + snappedMinute;

    const durationMinutes = Math.max(15, endTotal - startTotal);
    return clampDurationToQuarter(durationMinutes / 60);
  }

  function syncLinkedTaskFromCalendar(
    event: DayCalendarEvent,
    dateKey: string,
    overrides?: {
      startHour?: number;
      startMinute?: 0 | 15 | 30 | 45;
      durationHours?: number;
    },
  ) {
    if (typeof window === "undefined" || !event.sourceTaskId) return;

    const startHour = overrides?.startHour ?? event.startHour;
    const startMinute = overrides?.startMinute ?? event.startMinute ?? 0;
    const durationHours =
      overrides?.durationHours ?? event.durationHours ?? 0.5;

    const startTotalMinutes = startHour * 60 + startMinute;
    const durationMinutes = Math.max(15, Math.round(durationHours * 60));
    const endTotalMinutes = startTotalMinutes + durationMinutes;

    const endHour = Math.floor(endTotalMinutes / 60);
    const endMinute = clampMinuteToQuarter(endTotalMinutes % 60);

    const startIso = `${dateKey}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`;
    const endIso = `${dateKey}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:00`;

    window.dispatchEvent(
      new CustomEvent("lifeos:task-updated", {
        detail: {
          taskId: event.sourceTaskId,
          patch: {
            title: event.title,
            dueDate: dateKey,
            plannedFor: startIso,
            plannedStart: startIso,
            plannedEnd: endIso,
          },
        },
      }),
    );
  }

  function handleDropOnSlot(
    ev: React.DragEvent,
    hour: number,
    minute: 0 | 15 | 30 | 45,
  ) {
    ev.preventDefault();
    setDragOverHour(null);

    const task = extractDraggedTask(ev);
    if (!task) return;

    const newEvent: DayCalendarEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: task.title,
      startHour: hour,
      startMinute: minute,
      durationHours: 0.5,
      sourceTaskId: task.id,
      sourceTaskStatus: "todo",
      provider: "local",
    };

    setEventsByDay((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] || []), newEvent].sort((a, b) => {
        const aValue = a.startHour * 60 + (a.startMinute || 0);
        const bValue = b.startHour * 60 + (b.startMinute || 0);
        return aValue - bValue;
      }),
    }));

    onDropTask?.({ task, dateKey: dayKey, hour });

    const durationMinutes = Math.round((newEvent.durationHours ?? 0.5) * 60);
    const startTotalMinutes = hour * 60 + minute;
    const endTotalMinutes = startTotalMinutes + durationMinutes;
    const endHour = Math.floor(endTotalMinutes / 60);
    const endMinute = clampMinuteToQuarter(endTotalMinutes % 60);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("lifeos:task-scheduled", {
          detail: {
            taskId: task.id || null,
            title: task.title,
            date: dayKey,
            hour,
            minute,
            endHour,
            endMinute,
          },
        }),
      );
    }
  }

  const CALENDAR_SYNC_EVENT = "lifeos:calendar-events-sync";

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const serialized = JSON.stringify(eventsByDay);
      window.localStorage.setItem(storageKey, serialized);

      window.dispatchEvent(
        new CustomEvent(CALENDAR_SYNC_EVENT, {
          detail: {
            storageKey,
            eventsByDay,
          },
        }),
      );
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
    if (typeof window === "undefined") return;

    function syncFromStorage() {
      setEventsByDay(
        readJson<Record<string, DayCalendarEvent[]>>(storageKey, {}),
      );
    }

    function handleStorage(ev: StorageEvent) {
      if (ev.key && ev.key !== storageKey) return;
      syncFromStorage();
    }

    function handleCalendarSync(ev: Event) {
      const custom = ev as CustomEvent<{
        storageKey: string;
        eventsByDay: Record<string, DayCalendarEvent[]>;
      }>;

      if (custom.detail?.storageKey !== storageKey) return;

      setEventsByDay(custom.detail.eventsByDay || {});
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      CALENDAR_SYNC_EVENT,
      handleCalendarSync as EventListener,
    );

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        CALENDAR_SYNC_EVENT,
        handleCalendarSync as EventListener,
      );
    };
  }, [storageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    function handleTaskUpdated(event: Event) {
      const custom = event as CustomEvent<{
        taskId: string;
        patch: {
          title?: string;
          dueDate?: string;
          plannedFor?: string;
          plannedStart?: string;
          plannedEnd?: string;
        };
      }>;

      const taskId = custom.detail?.taskId;
      const patch = custom.detail?.patch;

      if (!taskId || !patch) return;

      setEventsByDay((prev) => {
        let changed = false;

        const next = Object.fromEntries(
          Object.entries(prev).map(([dateKey, events]) => {
            const updatedEvents = events.map((item) => {
              if (item.sourceTaskId !== taskId) return item;

              changed = true;

              const startIso = patch.plannedStart ?? patch.plannedFor;
              const endIso = patch.plannedEnd;

              let nextStartHour = item.startHour;
              let nextStartMinute = item.startMinute ?? 0;
              let nextDurationHours = item.durationHours ?? 0.5;

              if (startIso) {
                const start = new Date(startIso);
                nextStartHour = start.getHours();
                nextStartMinute = clampMinuteToQuarter(start.getMinutes());
              }

              if (startIso && endIso) {
                const start = new Date(startIso);
                const end = new Date(endIso);
                const duration = (end.getTime() - start.getTime()) / 3600000;

                nextDurationHours = clampDurationToQuarter(
                  Math.max(0.25, duration),
                );
              }

              return {
                ...item,
                title: patch.title ?? item.title,
                startHour: nextStartHour,
                startMinute: nextStartMinute,
                durationHours: nextDurationHours,
              };
            });

            return [dateKey, updatedEvents];
          }),
        ) as Record<string, DayCalendarEvent[]>;

        return changed ? next : prev;
      });
    }

    window.addEventListener(
      "lifeos:task-updated",
      handleTaskUpdated as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:task-updated",
        handleTaskUpdated as EventListener,
      );
    };
  }, []);

  React.useEffect(() => {
    onEventsChange?.(eventsByDay);
  }, [eventsByDay, onEventsChange]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    function handleTaskStatusChanged(event: Event) {
      const custom = event as CustomEvent<{
        taskId: string;
        status: "todo" | "doing" | "done";
      }>;

      const taskId = custom.detail?.taskId;
      const status = custom.detail?.status;

      if (!taskId || !status) return;

      setEventsByDay((prev) => {
        let changed = false;

        const next = Object.fromEntries(
          Object.entries(prev).map(([dateKey, events]) => {
            const updatedEvents = events.map((item) => {
              if (item.sourceTaskId !== taskId) return item;
              changed = true;
              return {
                ...item,
                sourceTaskStatus: status,
              };
            });

            return [dateKey, updatedEvents];
          }),
        ) as Record<string, DayCalendarEvent[]>;

        return changed ? next : prev;
      });
    }

    window.addEventListener(
      "lifeos:task-status-changed",
      handleTaskStatusChanged as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:task-status-changed",
        handleTaskStatusChanged as EventListener,
      );
    };
  }, []);

  function formatTime(hour: number, minute: 0 | 15 | 30 | 45 = 0) {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function toQuarterMinute(minute: number): 0 | 15 | 30 | 45 {
    return clampMinuteToQuarter(Math.round(minute / 15) * 15);
  }

  function mapGoogleEventToDayCalendarEvent(
    event: any,
  ): DayCalendarEvent | null {
    if (!event?.start?.dateTime || !event?.end?.dateTime) {
      return null;
    }

    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);

    const startHour = start.getHours();
    const startMinute = toQuarterMinute(start.getMinutes());
    const durationHours = Math.max(
      0.25,
      (end.getTime() - start.getTime()) / 3600000,
    );

    return {
      id: `google-${event.id}`,
      title: event.summary || "Google event",
      startHour,
      startMinute,
      durationHours,
      provider: "google",
    };
  }

  function getRenderedTimeRangeForEvent(event: DayCalendarEvent) {
    const startHour = getRenderedHourForEvent(event);
    const startMinute = getRenderedMinuteForEvent(event);
    const durationHours = getRenderedDurationForEvent(event);

    const startTotal = startHour * 60 + startMinute;
    const endTotal = startTotal + durationHours * 60;

    const endHour = Math.floor(endTotal / 60);
    const endMinute = clampMinuteToQuarter(endTotal % 60);

    return {
      startLabel: formatTime(startHour, startMinute),
      endLabel: formatTime(endHour, endMinute),
    };
  }

  function isEventBeingAdjusted(eventId: string) {
    return draggingEventId === eventId || resizingEventId === eventId;
  }

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

  React.useEffect(() => {
    const update = () => {
      const t = document.documentElement.getAttribute("data-theme") || "duna";
      setTheme(t);
    };

    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    function syncProviderFromStorage() {
      try {
        const provider = readJson<CalendarProvider>(providerStorageKey, null);
        setConnectedProvider(provider);
      } catch {
        setConnectedProvider(null);
      }
    }

    function handleReset() {
      setEventsByDay({});
      setConnectedProvider(null);
    }

    window.addEventListener(
      "lifeos:calendar-connect",
      syncProviderFromStorage as EventListener,
    );
    window.addEventListener(
      "lifeos:calendar-reset",
      handleReset as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:calendar-connect",
        syncProviderFromStorage as EventListener,
      );
      window.removeEventListener(
        "lifeos:calendar-reset",
        handleReset as EventListener,
      );
    };
  }, [providerStorageKey]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000); // update every minute

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    function syncNowLineColor(ev?: Event) {
      const custom = ev as CustomEvent<{ color?: string }> | undefined;

      if (custom?.detail?.color) {
        setNowLineColor(custom.detail.color);
        return;
      }

      try {
        setNowLineColor(
          localStorage.getItem(CALENDAR_NOW_COLOR_KEY) || "#ef4444",
        );
      } catch {
        setNowLineColor("#ef4444");
      }
    }

    window.addEventListener(
      "lifeos:calendar-now-color-change",
      syncNowLineColor as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:calendar-now-color-change",
        syncNowLineColor as EventListener,
      );
    };
  }, []);

  React.useEffect(() => {
    draggingEventIdRef.current = draggingEventId;
  }, [draggingEventId]);

  React.useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  React.useEffect(() => {
    function handlePointerMove(ev: PointerEvent) {
      if (!draggingEventIdRef.current) {
        const pending = pointerDownEventRef.current;
        if (!pending) return;

        const dx = ev.clientX - pending.startX;
        const dy = ev.clientY - pending.startY;
        const distance = Math.hypot(dx, dy);

        if (distance < 6) return;

        const pendingEvent = dayEvents.find((item) => item.id === pending.id);
        if (!pendingEvent) return;

        hasDraggedRef.current = true;
        dragPointerOffsetRef.current = pending.offsetY;

        setDraggingEventId(pending.id);
        setDragPreview({
          id: pending.id,
          hour: pendingEvent.startHour,
          minute: (pendingEvent.startMinute || 0) as 0 | 15 | 30 | 45,
        });

        return;
      }

      const activeId = draggingEventIdRef.current;
      if (!activeId) return;

      const trackEl = trackRef.current;
      if (!trackEl) return;

      const trackRect = trackEl.getBoundingClientRect();
      const isInsideTrack =
        ev.clientX >= trackRect.left &&
        ev.clientX <= trackRect.right &&
        ev.clientY >= trackRect.top &&
        ev.clientY <= trackRect.bottom;

      if (!isInsideTrack) {
        setDragOverHour(null);
        return;
      }

      const { hour: nextHour, minute: nextMinute } = getTimeFromTrackPointer(
        ev.clientY,
        trackEl,
        dragPointerOffsetRef.current,
      );

      setDragPreview((prev) => {
        if (
          prev &&
          prev.id === activeId &&
          prev.hour === nextHour &&
          prev.minute === nextMinute
        ) {
          return prev;
        }

        return {
          id: activeId,
          hour: nextHour,
          minute: nextMinute,
        };
      });

      setDragOverHour(nextHour);
    }

    function handlePointerUp() {
      const pending = pointerDownEventRef.current;
      const activeId = draggingEventIdRef.current;
      const preview = dragPreviewRef.current;

      if (!hasDraggedRef.current && pending?.taskId) {
        openLinkedTaskEditor(pending.taskId);
      } else if (activeId && preview?.id === activeId) {
        moveEventToTime(activeId, preview.hour, preview.minute);
      }

      pointerDownEventRef.current = null;
      hasDraggedRef.current = false;
      setDraggingEventId(null);
      setDragPreview(null);
      setDragOverHour(null);
      dragPointerOffsetRef.current = 0;
    }

    function handlePointerCancel() {
      pointerDownEventRef.current = null;
      hasDraggedRef.current = false;
      cancelDragAndResize();
      dragPointerOffsetRef.current = 0;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dayEvents]);

  function getTimeFromTrackPointer(
    clientY: number,
    trackEl: HTMLDivElement,
    pointerOffset = 0,
  ) {
    const trackRect = trackEl.getBoundingClientRect();
    const adjustedY = clientY - trackRect.top - pointerOffset;

    const totalMinutes = visibleHours.length * 60;
    const minuteHeight = trackRect.height / totalMinutes;

    const rawMinutes = adjustedY / minuteHeight;
    const snappedMinutes = Math.round(rawMinutes / 15) * 15;

    const clampedMinutes = Math.max(
      0,
      Math.min(totalMinutes - 15, snappedMinutes),
    );

    const absoluteMinutes = visibleHours[0] * 60 + clampedMinutes;
    const hour = Math.floor(absoluteMinutes / 60);
    const minute = clampMinuteToQuarter(absoluteMinutes % 60);

    return { hour, minute };
  }

  function moveEventToTime(
    id: string,
    nextHour: number,
    nextMinute: 0 | 15 | 30 | 45,
  ) {
    const targetEvent = (eventsByDay[dayKey] || []).find(
      (item) => item.id === id,
    );

    setEventsByDay((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] || [])
        .map((item) =>
          item.id === id
            ? { ...item, startHour: nextHour, startMinute: nextMinute }
            : item,
        )
        .sort((a, b) => {
          const aValue = a.startHour * 60 + (a.startMinute || 0);
          const bValue = b.startHour * 60 + (b.startMinute || 0);
          return aValue - bValue;
        }),
    }));

    if (targetEvent) {
      syncLinkedTaskFromCalendar(targetEvent, dayKey, {
        startHour: nextHour,
        startMinute: nextMinute,
      });
    }
  }

  function getRenderedDurationForEvent(event: DayCalendarEvent) {
    if (resizePreview?.id === event.id) {
      return resizePreview.durationHours;
    }
    return event.durationHours || 0.5;
  }

  function resizeEvent(
    id: string,
    startHour: number,
    startMinute: 0 | 15 | 30 | 45,
    durationHours: number,
  ) {
    const targetEvent = (eventsByDay[dayKey] || []).find(
      (item) => item.id === id,
    );

    setEventsByDay((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] || [])
        .map((item) =>
          item.id === id
            ? { ...item, startHour, startMinute, durationHours }
            : item,
        )
        .sort((a, b) => {
          const aValue = a.startHour * 60 + (a.startMinute || 0);
          const bValue = b.startHour * 60 + (b.startMinute || 0);
          return aValue - bValue;
        }),
    }));

    if (targetEvent) {
      syncLinkedTaskFromCalendar(targetEvent, dayKey, {
        startHour,
        startMinute,
        durationHours,
      });
    }
  }

  function openLinkedTaskEditor(taskId?: string) {
    if (typeof window === "undefined" || !taskId) return;

    window.dispatchEvent(
      new CustomEvent("lifeos:open-task-editor", {
        detail: { taskId },
      }),
    );
  }

  function getResizePreviewFromTrackPointer(
    clientY: number,
    trackEl: HTMLDivElement,
    event: DayCalendarEvent,
    edge: "top" | "bottom",
  ) {
    const trackRect = trackEl.getBoundingClientRect();
    const relativeY = clientY - trackRect.top;

    const hourHeight = trackRect.height / visibleHours.length;
    const rawHourIndex = relativeY / hourHeight;

    const clampedHourIndex = Math.max(
      0,
      Math.min(visibleHours.length - 0.001, rawHourIndex),
    );

    const hourOffset = Math.floor(clampedHourIndex);
    const withinHour = clampedHourIndex - hourOffset;

    const pointerHour = visibleHours[0] + hourOffset;
    const rawMinute = withinHour * 60;
    const snappedMinute = clampMinuteToQuarter(Math.round(rawMinute / 15) * 15);

    const currentStart =
      event.startHour * 60 + ((event.startMinute || 0) as 0 | 15 | 30 | 45);
    const currentEnd = currentStart + (event.durationHours || 0.5) * 60;
    const pointerTotal = pointerHour * 60 + snappedMinute;

    if (edge === "bottom") {
      const nextEnd = Math.max(currentStart + 15, pointerTotal);
      return {
        startHour: event.startHour,
        startMinute: (event.startMinute || 0) as 0 | 15 | 30 | 45,
        durationHours: clampDurationToQuarter((nextEnd - currentStart) / 60),
      };
    }

    const nextStart = Math.min(currentEnd - 15, pointerTotal);
    return {
      startHour: Math.floor(nextStart / 60),
      startMinute: clampMinuteToQuarter(nextStart % 60),
      durationHours: clampDurationToQuarter((currentEnd - nextStart) / 60),
    };
  }

  function getRenderedMinuteForEvent(event: DayCalendarEvent) {
    if (dragPreview?.id === event.id) {
      return dragPreview.minute;
    }
    if (resizePreview?.id === event.id) {
      return resizePreview.startMinute;
    }
    return (event.startMinute || 0) as 0 | 15 | 30 | 45;
  }

  function getRenderedHourForEvent(event: DayCalendarEvent) {
    if (dragPreview?.id === event.id) {
      return dragPreview.hour;
    }
    if (resizePreview?.id === event.id) {
      return resizePreview.startHour;
    }
    return event.startHour;
  }

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    if (draggingEventId || resizingEventId) {
      document.body.classList.add("lo-is-dragging-calendar");
    } else {
      document.body.classList.remove("lo-is-dragging-calendar");
    }

    return () => {
      document.body.classList.remove("lo-is-dragging-calendar");
    };
  }, [draggingEventId, resizingEventId]);

  React.useEffect(() => {
    resizingEventIdRef.current = resizingEventId;
  }, [resizingEventId]);

  React.useEffect(() => {
    resizePreviewRef.current = resizePreview;
  }, [resizePreview]);

  function getEventStartMinutes(event: DayCalendarEvent) {
    return (
      getRenderedHourForEvent(event) * 60 + getRenderedMinuteForEvent(event)
    );
  }

  function getEventEndMinutes(event: DayCalendarEvent) {
    return (
      getEventStartMinutes(event) + getRenderedDurationForEvent(event) * 60
    );
  }

  function eventsOverlap(a: DayCalendarEvent, b: DayCalendarEvent) {
    const aStart = getEventStartMinutes(a);
    const aEnd = getEventEndMinutes(a);
    const bStart = getEventStartMinutes(b);
    const bEnd = getEventEndMinutes(b);

    return aStart < bEnd && bStart < aEnd;
  }

  function buildEventLayout(
    events: DayCalendarEvent[],
  ): Map<string, EventLayout> {
    const sorted = [...events].sort((a, b) => {
      const diff = getEventStartMinutes(a) - getEventStartMinutes(b);
      if (diff !== 0) return diff;
      return getEventEndMinutes(a) - getEventEndMinutes(b);
    });

    const layout = new Map<string, EventLayout>();

    type ActiveItem = {
      event: DayCalendarEvent;
      column: number;
    };

    let active: ActiveItem[] = [];
    let cluster: DayCalendarEvent[] = [];
    let clusterAssignments = new Map<string, number>();
    let clusterMaxColumns = 0;

    function flushCluster() {
      if (cluster.length === 0) return;

      for (const event of cluster) {
        layout.set(event.id, {
          id: event.id,
          column: clusterAssignments.get(event.id) ?? 0,
          columns: Math.max(1, clusterMaxColumns),
        });
      }

      cluster = [];
      clusterAssignments = new Map();
      clusterMaxColumns = 0;
    }

    for (const event of sorted) {
      const start = getEventStartMinutes(event);

      active = active.filter((item) => getEventEndMinutes(item.event) > start);

      if (active.length === 0) {
        flushCluster();
      }

      const usedColumns = new Set(active.map((item) => item.column));

      let column = 0;
      while (usedColumns.has(column)) {
        column += 1;
      }

      active.push({ event, column });
      cluster.push(event);
      clusterAssignments.set(event.id, column);
      clusterMaxColumns = Math.max(clusterMaxColumns, active.length);
    }

    flushCluster();

    return layout;
  }

  React.useEffect(() => {
    if (!resizingEventId) return;

    function handlePointerMove(ev: PointerEvent) {
      const activeId = resizingEventIdRef.current;
      if (!activeId) return;

      const activeEvent = dayEvents.find((item) => item.id === activeId);
      const trackEl = trackRef.current;

      if (!activeEvent || !trackEl) return;

      const next = getResizePreviewFromTrackPointer(
        ev.clientY,
        trackEl,
        activeEvent,
        resizePreviewRef.current?.edge || "bottom",
      );

      setResizePreview((prev) => {
        if (
          prev &&
          prev.id === activeId &&
          prev.startHour === next.startHour &&
          prev.startMinute === next.startMinute &&
          prev.durationHours === next.durationHours &&
          prev.edge === (prev.edge || "bottom")
        ) {
          return prev;
        }

        return {
          id: activeId,
          startHour: next.startHour,
          startMinute: next.startMinute,
          durationHours: next.durationHours,
          edge: prev?.edge || "bottom",
        };
      });
    }

    function handlePointerUp() {
      const activeId = resizingEventIdRef.current;
      const preview = resizePreviewRef.current;

      if (activeId && preview?.id === activeId) {
        resizeEvent(
          activeId,
          preview.startHour,
          preview.startMinute,
          preview.durationHours,
        );
      }

      setResizingEventId(null);
      setResizePreview(null);
    }

    function handlePointerCancel() {
      cancelDragAndResize();
      dragPointerOffsetRef.current = 0;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [resizingEventId, dayEvents, visibleHours]);

  React.useEffect(() => {
    if (connectedProvider !== "google") {
      setProviderEventsByDay((prev) => ({
        ...prev,
        [dayKey]: [],
      }));
      return;
    }

    let isCancelled = false;

    async function loadGoogleEvents() {
      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);

      try {
        let res = await fetch(
          `/.netlify/functions/google-events?${new URLSearchParams({
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
          }).toString()}`,
          {
            credentials: "include",
          },
        );

        let data = await res.json();

        if (data?.retry) {
          res = await fetch(
            `/.netlify/functions/google-events?${new URLSearchParams({
              timeMin: start.toISOString(),
              timeMax: end.toISOString(),
            }).toString()}`,
            {
              credentials: "include",
            },
          );
          data = await res.json();
        }

        if (!res.ok) {
          console.error("Failed to load Google events", data);
          if (!isCancelled) {
            setProviderEventsByDay((prev) => ({
              ...prev,
              [dayKey]: [],
            }));
          }
          return;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        const mapped = items
          .map(mapGoogleEventToDayCalendarEvent)
          .filter(Boolean) as DayCalendarEvent[];

        if (!isCancelled) {
          setProviderEventsByDay((prev) => ({
            ...prev,
            [dayKey]: mapped,
          }));
        }
      } catch (error) {
        console.error("Failed to load Google events", error);
        if (!isCancelled) {
          setProviderEventsByDay((prev) => ({
            ...prev,
            [dayKey]: [],
          }));
        }
      }
    }

    void loadGoogleEvents();

    return () => {
      isCancelled = true;
    };
  }, [connectedProvider, selectedDate, dayKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    function handleCalendarLinkTask(event: Event) {
      const custom = event as CustomEvent<{
        calendarEventId: string;
        taskId: string;
        taskStatus?: "todo" | "doing" | "done";
      }>;

      const calendarEventId = custom.detail?.calendarEventId;
      const taskId = custom.detail?.taskId;
      const taskStatus = custom.detail?.taskStatus ?? "todo";

      if (!calendarEventId || !taskId) return;

      setEventsByDay((prev) => {
        let changed = false;

        const next = Object.fromEntries(
          Object.entries(prev).map(([dateKey, events]) => {
            const updated = events.map((item) => {
              if (item.id !== calendarEventId) return item;
              changed = true;
              return {
                ...item,
                sourceTaskId: taskId,
                sourceTaskStatus: taskStatus,
              };
            });

            return [dateKey, updated];
          }),
        ) as Record<string, DayCalendarEvent[]>;

        return changed ? next : prev;
      });
    }

    window.addEventListener(
      "lifeos:calendar-link-task",
      handleCalendarLinkTask as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:calendar-link-task",
        handleCalendarLinkTask as EventListener,
      );
    };
  }, []);

  return (
    <section
      className={`lo-daycal ${compact ? "is-compact" : ""} ${className}`.trim()}
    >
      <div className="lo-daycal__top">
        <div className="lo-daycal__nav">
          <button
            className="lo-btn"
            onClick={() => shiftDay(-1)}
            type="button"
            aria-label="Previous day"
          >
            ←
          </button>

          <div className="lo-daycal__titlewrap">
            <div className="lo-daycal__title">{dateTitle}</div>
            <div className="lo-daycal__subtitle">
              {dayKey === todayKey ? "Today" : "Day view"}
            </div>
          </div>

          <button
            className="lo-btn"
            onClick={() => shiftDay(1)}
            type="button"
            aria-label="Next day"
          >
            →
          </button>

          {showTodayButton ? (
            <button
              className="lo-btn lo-daycal__today"
              onClick={goToToday}
              type="button"
            >
              Today
            </button>
          ) : null}
        </div>

        {showSettings ? (
          <div className="lo-daycal__tools">
            <div className="lo-daycal__provider">
              {connectedProvider ? (
                <span className="lo-chip">
                  {connectedProvider === "google"
                    ? "Google connected"
                    : "Outlook connected"}
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
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("lifeos:open-calendar-settings"),
                    );
                  }
                }}
              >
                <img src={gearIcon} alt="Settings" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="lo-daycal__body">
        <div className="lo-daycal__grid">
          <div className="lo-daycal__hours">
            {visibleHours.map((hour) => (
              <div key={hour} className="lo-daycal__hour-row">
                <div className="lo-daycal__hour">{formatTime(hour, 0)}</div>
              </div>
            ))}
          </div>

          <div
            ref={trackRef}
            className="lo-daycal__track"
            onDragLeave={() => setDragOverHour(null)}
          >
            {visibleHours.map((hour) => {
              const slotEvents = dayEvents
                .filter((item) => getRenderedHourForEvent(item) === hour)
                .sort((a, b) => {
                  const aMinute = getRenderedMinuteForEvent(a);
                  const bMinute = getRenderedMinuteForEvent(b);
                  return aMinute - bMinute;
                });

              const q0Events = slotEvents.filter(
                (event) => getRenderedMinuteForEvent(event) === 0,
              );
              const q15Events = slotEvents.filter(
                (event) => getRenderedMinuteForEvent(event) === 15,
              );
              const q30Events = slotEvents.filter(
                (event) => getRenderedMinuteForEvent(event) === 30,
              );
              const q45Events = slotEvents.filter(
                (event) => getRenderedMinuteForEvent(event) === 45,
              );

              const isDropTarget = dragOverHour === hour;

              return (
                <div
                  key={hour}
                  className={`lo-daycal__track-hour ${isDropTarget ? "is-drop-target" : ""}`}
                  data-hour-slot="true"
                  data-hour={hour}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    setDragOverHour(hour);
                  }}
                  onDrop={(ev) => handleDropOnSlot(ev, hour, 0)}
                >
                  {[...q0Events, ...q15Events, ...q30Events, ...q45Events].map(
                    (event) => {
                      const isProviderEvent =
                        event.provider === "google" ||
                        event.provider === "outlook";
                      const isReadOnlyEvent = isProviderEvent;
                      const minute = getRenderedMinuteForEvent(event);
                      const isAdjusting = isEventBeingAdjusted(event.id);
                      const { startLabel, endLabel } =
                        getRenderedTimeRangeForEvent(event);
                      const minuteClass =
                        minute === 0
                          ? "is-q0"
                          : minute === 15
                            ? "is-q15"
                            : minute === 30
                              ? "is-q30"
                              : "is-q45";

                      const layoutMeta = eventLayout.get(event.id) ?? {
                        column: 0,
                        columns: 1,
                      };

                      const columnIndex = layoutMeta.column;
                      const overlapCount = layoutMeta.columns;

                      const sidePadding = 10;
                      const overlapOffset = 150;

                      const isOverlapping = overlapCount > 1;
                      const maxShift = 130; // increase this if you want more visible offset

                      const overlapShift = isOverlapping
                        ? Math.min(columnIndex * overlapOffset, maxShift)
                        : 0;

                      const eventWidth = isOverlapping
                        ? `calc(100% - ${sidePadding * 2}px - ${maxShift}px)`
                        : `calc(100% - ${sidePadding * 2}px)`;

                      const leftOffset = `${sidePadding + overlapShift}px`;

                      const renderedDuration =
                        getRenderedDurationForEvent(event);
                      const lineClamp =
                        renderedDuration >= 1.5
                          ? 4
                          : renderedDuration >= 1
                            ? 3
                            : renderedDuration >= 0.5
                              ? 2
                              : 1;

                      return (
                        <div
                          key={event.id}
                          className={`lo-daycal__event ${minuteClass} ${draggingEventId === event.id ? "is-dragging" : ""} ${resizingEventId === event.id ? "is-resizing" : ""}`.trim()}
                          style={
                            {
                              zIndex:
                                draggingEventId === event.id ||
                                resizingEventId === event.id
                                  ? 80
                                  : 20 + columnIndex,
                              opacity:
                                draggingEventId === event.id ||
                                resizingEventId === event.id
                                  ? 0.96
                                  : 1,
                              transform:
                                draggingEventId === event.id ||
                                resizingEventId === event.id
                                  ? "scale(1.02)"
                                  : "none",
                              userSelect: "none",
                              WebkitUserSelect: "none",
                              height: `calc(${renderedDuration * 100}% - 8px)`,
                              left: leftOffset,
                              right: "auto",
                              width: eventWidth,
                              "--daycal-line-clamp": lineClamp,
                            } as React.CSSProperties
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onPointerDown={(e) => {
                            if (isReadOnlyEvent) return;

                            const target = e.target as HTMLElement;

                            if (
                              target.closest(
                                "button, input, textarea, .lo-daycal__event-resize",
                              )
                            ) {
                              return;
                            }

                            e.stopPropagation();

                            const rect = (
                              e.currentTarget as HTMLDivElement
                            ).getBoundingClientRect();

                            pointerDownEventRef.current = {
                              id: event.id,
                              taskId: event.sourceTaskId,
                              startX: e.clientX,
                              startY: e.clientY,
                              offsetY: e.clientY - rect.top,
                            };

                            hasDraggedRef.current = false;
                          }}
                        >
                          <div className="lo-daycal__event-main">
                            <div className="lo-daycal__event-content">
                              {event.sourceTaskId ? (
                                <input
                                  type="checkbox"
                                  className="lo-daycal__event-checkbox"
                                  checked={event.sourceTaskStatus === "done"}
                                  onChange={(e) => {
                                    e.stopPropagation();

                                    const nextStatus: "todo" | "done" = e.target
                                      .checked
                                      ? "done"
                                      : "todo";

                                    const shouldPlayCompleteSound =
                                      nextStatus === "done" &&
                                      event.sourceTaskStatus !== "done";

                                    setEventsByDay((prev) => ({
                                      ...prev,
                                      [dayKey]: (prev[dayKey] || []).map(
                                        (item) =>
                                          item.id === event.id
                                            ? {
                                                ...item,
                                                sourceTaskStatus: nextStatus,
                                              }
                                            : item,
                                      ),
                                    }));

                                    if (shouldPlayCompleteSound) {
                                      playTaskCompleteSound();
                                    }

                                    if (
                                      typeof window !== "undefined" &&
                                      event.sourceTaskId
                                    ) {
                                      window.dispatchEvent(
                                        new CustomEvent(
                                          "lifeos:task-status-changed",
                                          {
                                            detail: {
                                              taskId: event.sourceTaskId,
                                              status: nextStatus,
                                            },
                                          },
                                        ),
                                      );
                                    }
                                  }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={
                                    event.sourceTaskStatus === "done"
                                      ? "Mark task incomplete"
                                      : "Mark task complete"
                                  }
                                />
                              ) : null}

                              <div className="lo-daycal__event-text">
                                <strong
                                  className={
                                    event.sourceTaskStatus === "done"
                                      ? "is-done"
                                      : ""
                                  }
                                >
                                  {event.title || "New event"}
                                </strong>

                                {renderedDuration >= 0.75 ? (
                                  <span className="lo-daycal__event-time">
                                    {startLabel} - {endLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {!isAdjusting && !isReadOnlyEvent ? (
                            <button
                              type="button"
                              className="lo-daycal__event-remove"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeEvent(event.id);
                              }}
                              aria-label={`Remove ${event.title || "event"}`}
                            >
                              ×
                            </button>
                          ) : null}

                          {!isReadOnlyEvent ? (
                            <div
                              className="lo-daycal__event-resize lo-daycal__event-resize--top"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setResizingEventId(event.id);
                                setResizePreview({
                                  id: event.id,
                                  startHour: getRenderedHourForEvent(event),
                                  startMinute: getRenderedMinuteForEvent(event),
                                  durationHours:
                                    getRenderedDurationForEvent(event),
                                  edge: "top",
                                });
                              }}
                            />
                          ) : null}

                          {!isReadOnlyEvent ? (
                            <div
                              className="lo-daycal__event-resize lo-daycal__event-resize--bottom"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setResizingEventId(event.id);
                                setResizePreview({
                                  id: event.id,
                                  startHour: getRenderedHourForEvent(event),
                                  startMinute: getRenderedMinuteForEvent(event),
                                  durationHours:
                                    getRenderedDurationForEvent(event),
                                  edge: "bottom",
                                });
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    },
                  )}

                  {hour === currentHour ? (
                    <div
                      className="lo-daycal__now"
                      style={
                        {
                          top: `${minuteProgress * 100}%`,
                          "--lo-now-line-color": nowLineColor,
                        } as React.CSSProperties
                      }
                      aria-hidden="true"
                    >
                      <div className="lo-daycal__now-line" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
