import React, { useEffect, useMemo, useState } from "react";
import type { Task } from "../../types/task";
import { loadTasks } from "../../lib/tasksStore";
import { Card } from "../ui/Card";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DashboardTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  const { top3, upcoming } = useMemo(() => {
    const today = isoDate(new Date());
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const weekEnd = isoDate(in7);

    const active = tasks.filter(t => t.status !== "done");

    const sorted = [...active].sort((a, b) => {
      // priority asc (1 is higher), then due date asc (missing due date goes last)
      const p = a.priority - b.priority;
      if (p !== 0) return p;
      const ad = a.dueDate ?? "9999-12-31";
      const bd = b.dueDate ?? "9999-12-31";
      return ad.localeCompare(bd);
    });

    const upcomingTasks = active
      .filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

    return { top3: sorted.slice(0, 3), upcoming: upcomingTasks.slice(0, 8) };
  }, [tasks]);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card>
        <div style={{ fontWeight: 700, marginBottom: ".6rem" }}>Top 3 tasks</div>
        {top3.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Nothing urgent — add a task to get moving.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: ".4rem" }}>
            {top3.map(t => (
              <li key={t.id}>
                {t.title} <span style={{ opacity: 0.7, fontSize: 13 }}>{t.dueDate ? `• due ${t.dueDate}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div style={{ fontWeight: 700, marginBottom: ".6rem" }}>Upcoming (7 days)</div>
        {upcoming.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No deadlines in the next week.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: ".4rem" }}>
            {upcoming.map(t => (
              <li key={t.id}>
                {t.title} <span style={{ opacity: 0.7, fontSize: 13 }}>• {t.dueDate}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}