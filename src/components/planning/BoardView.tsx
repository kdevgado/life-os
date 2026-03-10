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

const STORAGE_KEY = "lifeos_plan_day_board";

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

function createInitialDays(count = 14): DayColumn[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const next = new Date(today);
    next.setDate(today.getDate() + index);

    return {
      dateKey: formatDateKey(next),
      label: formatDayLabel(next),
      tasks: [],
    };
  });
}

function createTask(title: string): DayTask {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
  };
}

export default function BoardView() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const [days, setDays] = React.useState<DayColumn[]>(() => {
    if (typeof window === "undefined") return createInitialDays();

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialDays();

    try {
      const parsed = JSON.parse(raw) as DayColumn[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : createInitialDays();
    } catch {
      return createInitialDays();
    }
  });

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
  }, [days]);

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
          : day
      )
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
          : day
      )
    );
  }

  function addMoreDays(direction: "left" | "right", amount = 7) {
    setDays((prev) => {
      if (prev.length === 0) return createInitialDays();

      if (direction === "left") {
        const firstDate = new Date(prev[0].dateKey);
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

        return [...newDays, ...prev];
      }

      const lastDate = new Date(prev[prev.length - 1].dateKey);
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

      return [...prev, ...newDays];
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

  return (
    <section className="lo-day-board" aria-label="Daily planning board">
      <div className="lo-day-board__toolbar">
        <div className="lo-day-board__controls">
          <button type="button" onClick={() => addMoreDays("left")}>
            + Previous days
          </button>
          <button type="button" onClick={() => scrollByAmount("left")}>
            ← Scroll left
          </button>
          <button type="button" onClick={() => scrollByAmount("right")}>
            Scroll right →
          </button>
          <button type="button" onClick={() => addMoreDays("right")}>
            + Next days
          </button>
        </div>
      </div>

      <div className="lo-day-board__scroller" ref={scrollRef}>
        {days.map((day) => (
          <section key={day.dateKey} className="lo-day-board__column">
            <header className="lo-day-board__header">
              <h3>{day.label}</h3>
              <p>{day.tasks.length} task{day.tasks.length === 1 ? "" : "s"}</p>
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