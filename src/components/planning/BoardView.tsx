import React from "react";

type DayTask = {
  id: string;
  title: string;
};

type DayColumn = {
  dateKey: string;
  label: string;
  tasks: DayTask[];
};

const STORAGE_KEY = "lifeos_plan_day_board_v2";
const AUTO_EXTEND_DAYS = 2;
const EDGE_THRESHOLD = 120;
const EXTEND_COOLDOWN_MS = 250;

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function createInitialDays(before = 0, after = 6): DayColumn[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: DayColumn[] = [];

  for (let offset = -before; offset <= after; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    days.push({
      dateKey: formatDateKey(date),
      label: formatDayLabel(date),
      tasks: [],
    });
  }

  return days;
}

function createTask(title: string): DayTask {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
  };
}

function buildPreviousDays(beforeDateKey: string, amount: number): DayColumn[] {
  const firstDate = new Date(beforeDateKey);
  const newDays: DayColumn[] = [];

  for (let i = amount; i >= 1; i--) {
    const d = new Date(firstDate);
    d.setDate(firstDate.getDate() - i);

    newDays.push({
      dateKey: formatDateKey(d),
      label: formatDayLabel(d),
      tasks: [],
    });
  }

  return newDays;
}

function buildNextDays(afterDateKey: string, amount: number): DayColumn[] {
  const lastDate = new Date(afterDateKey);
  const newDays: DayColumn[] = [];

  for (let i = 1; i <= amount; i++) {
    const d = new Date(lastDate);
    d.setDate(lastDate.getDate() + i);

    newDays.push({
      dateKey: formatDateKey(d),
      label: formatDayLabel(d),
      tasks: [],
    });
  }

  return newDays;
}

function getTodayKey() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return formatDateKey(today);
}

export default function BoardView() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const prependAdjustRef = React.useRef<number>(0);
  const isExtendingLeftRef = React.useRef(false);
  const isExtendingRightRef = React.useRef(false);
  const lastExtendAtRef = React.useRef(0);

  const todayKey = React.useMemo(() => getTodayKey(), []);
  const [days, setDays] = React.useState<DayColumn[]>(() => {
    const freshDays = createInitialDays(0, 6);

    if (typeof window === "undefined") return freshDays;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshDays;

    try {
      const parsed = JSON.parse(raw) as DayColumn[];
      if (!Array.isArray(parsed)) return freshDays;

      const taskMap = new Map(
        parsed.map((day) => [day.dateKey, day.tasks ?? []]),
      );

      return freshDays.map((day) => ({
        ...day,
        tasks: taskMap.get(day.dateKey) ?? [],
      }));
    } catch {
      return freshDays;
    }
  });

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
  }, [days]);

  const hasPositionedInitialViewRef = React.useRef(false);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (hasPositionedInitialViewRef.current) return;

    const todayElement = el.querySelector<HTMLElement>(
      `[data-date-key="${todayKey}"]`,
    );
    if (!todayElement) return;

    el.scrollLeft =
      todayElement.offsetLeft -
      el.clientWidth / 2 +
      todayElement.clientWidth / 2;

    hasPositionedInitialViewRef.current = true;
  }, [todayKey, days]);

  function updateDraft(dateKey: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [dateKey]: value,
    }));
  }

  function addTask(dateKey: string) {
    const value = (drafts[dateKey] || "").trim();
    if (!value) return;

    setDays((prev) =>
      prev.map((day) =>
        day.dateKey === dateKey
          ? {
              ...day,
              tasks: [...day.tasks, createTask(value)],
            }
          : day,
      ),
    );

    setDrafts((prev) => ({
      ...prev,
      [dateKey]: "",
    }));
  }

  function deleteTask(dateKey: string, taskId: string) {
    setDays((prev) =>
      prev.map((day) =>
        day.dateKey === dateKey
          ? {
              ...day,
              tasks: day.tasks.filter((task) => task.id !== taskId),
            }
          : day,
      ),
    );
  }

  function extendLeft(amount = AUTO_EXTEND_DAYS) {
    if (isExtendingLeftRef.current) return;

    const el = scrollRef.current;
    if (!el || days.length === 0) return;

    isExtendingLeftRef.current = true;

    const previousWidth = el.scrollWidth;
    const newDays = buildPreviousDays(days[0].dateKey, amount);

    setDays((prev) => [...newDays, ...prev]);

    requestAnimationFrame(() => {
      const nextEl = scrollRef.current;
      if (nextEl) {
        prependAdjustRef.current = nextEl.scrollWidth - previousWidth;
      }
      isExtendingLeftRef.current = false;
    });
  }

  function extendRight(amount = AUTO_EXTEND_DAYS) {
    if (isExtendingRightRef.current) return;
    if (days.length === 0) return;

    isExtendingRightRef.current = true;

    const newDays = buildNextDays(days[days.length - 1].dateKey, amount);
    setDays((prev) => [...prev, ...newDays]);

    requestAnimationFrame(() => {
      isExtendingRightRef.current = false;
    });
  }

  function scrollByAmount(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollBy({
      left: direction === "left" ? -420 : 420,
      behavior: "smooth",
    });
  }

  function jumpToToday() {
    const el = scrollRef.current;
    if (!el) return;

    const todayElement = el.querySelector<HTMLElement>(
      `[data-date-key="${todayKey}"]`,
    );

    if (todayElement) {
      todayElement.scrollIntoView({
        behavior: "smooth",
        inline: "start",
        block: "nearest",
      });
      return;
    }

    const first = days[0]?.dateKey;
    const last = days[days.length - 1]?.dateKey;

    if (!first || !last) return;

    if (todayKey < first) {
      const diff =
        Math.ceil(
          (new Date(first).getTime() - new Date(todayKey).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 3;

      const newDays = buildPreviousDays(first, diff);

      setDays((prev) => [...newDays, ...prev]);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const nextTodayElement =
            scrollRef.current?.querySelector<HTMLElement>(
              `[data-date-key="${todayKey}"]`,
            );

          nextTodayElement?.scrollIntoView({
            behavior: "smooth",
            inline: "start",
            block: "nearest",
          });
        });
      });

      return;
    }

    if (todayKey > last) {
      const diff =
        Math.ceil(
          (new Date(todayKey).getTime() - new Date(last).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 3;

      const newDays = buildNextDays(last, diff);

      setDays((prev) => [...prev, ...newDays]);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const nextTodayElement =
            scrollRef.current?.querySelector<HTMLElement>(
              `[data-date-key="${todayKey}"]`,
            );

          nextTodayElement?.scrollIntoView({
            behavior: "smooth",
            inline: "start",
            block: "nearest",
          });
        });
      });
    }
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;

    const now = Date.now();
    if (now - lastExtendAtRef.current < EXTEND_COOLDOWN_MS) return;

    const nearLeft = el.scrollLeft <= EDGE_THRESHOLD;
    const nearRight =
      el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_THRESHOLD;

    if (nearLeft) {
      lastExtendAtRef.current = now;
      extendLeft();
      return;
    }

    if (nearRight) {
      lastExtendAtRef.current = now;
      extendRight();
    }
  }

  return (
    <section className="lo-day-board" aria-label="Daily planning board">
      <div className="lo-day-board__toolbar">
        <div className="lo-day-board__controls">
          <button type="button" onClick={jumpToToday}>
            Today
          </button>
          <button type="button" onClick={() => scrollByAmount("left")}>
            ← Scroll left
          </button>
          <button type="button" onClick={() => scrollByAmount("right")}>
            Scroll right →
          </button>
        </div>
      </div>

      <div
        className="lo-day-board__scroller"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {days.map((day) => (
          <section
            key={day.dateKey}
            data-date-key={day.dateKey}
            className={`lo-day-board__column ${day.dateKey === todayKey ? "is-today" : ""}`}
          >
            <header className="lo-day-board__header">
              <h3>{day.label}</h3>
              <p>
                {day.tasks.length} task{day.tasks.length === 1 ? "" : "s"}
              </p>
            </header>

            <div className="lo-day-board__composer">
              <input
                type="text"
                value={drafts[day.dateKey] || ""}
                onChange={(e) => updateDraft(day.dateKey, e.target.value)}
                placeholder="Add a task"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTask(day.dateKey);
                }}
              />
              <button type="button" onClick={() => addTask(day.dateKey)}>
                Add
              </button>
            </div>

            <div className="lo-day-board__tasks">
              {day.tasks.length === 0 && (
                <div className="lo-day-board__empty">No tasks yet</div>
              )}

              {day.tasks.map((task) => (
                <article key={task.id} className="lo-day-board__task">
                  <p>{task.title}</p>
                  <button
                    type="button"
                    onClick={() => deleteTask(day.dateKey, task.id)}
                    aria-label={`Delete ${task.title}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
