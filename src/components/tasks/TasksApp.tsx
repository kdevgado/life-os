import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "../../types/task";
import { createTask, deleteTask, loadTasks, updateTask } from "../../lib/tasksStore";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { getJwt } from "../../lib/identity";

type View = "today" | "week" | "all";
type Priority = 1 | 2 | 3;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfWeek() {
  const d = startOfToday();
  d.setDate(d.getDate() + 7);
  return d;
}

export default function TasksApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [view, setView] = useState<View>("today");

  // ✅ defaults requested
  const [dueDate, setDueDate] = useState<string>(() => isoDate(new Date())); // today
  const [priority, setPriority] = useState<Priority>(3); // low

  // ✅ for “new task” animation
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    (async () => {
      const jwt = await getJwt();
      setAuthed(!!jwt);

      if (!jwt) {
        setTasks(loadTasks());
        return;
      }

      const res = await fetch("/.netlify/functions/tasks", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      setTasks(res.ok ? ((await res.json()) as Task[]) : loadTasks());
    })();
  }, []);

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // skip autosave until we’ve loaded initial data
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    // debounce
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      const jwt = await getJwt();

      // logged out -> keep local storage as your current store does
      if (!jwt) return;

      await fetch("/.netlify/functions/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(tasks),
      });
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [tasks]);

  const filtered = useMemo(() => {
    const today = isoDate(new Date());
    const weekEnd = isoDate(endOfWeek());

    if (view === "all") return tasks;

    if (view === "today") {
      return tasks.filter((t) => t.dueDate === today && t.status !== "done");
    }

    return tasks.filter((t) => {
      if (!t.dueDate) return false;
      return t.dueDate >= today && t.dueDate <= weekEnd && t.status !== "done";
    });
  }, [tasks, view]);

  const canAdd = title.trim().length > 0;

  function makeTask(title: string, due?: string, priority: Priority = 3): Task {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      title,
      status: "todo",
      priority,
      dueDate: due,
      createdAt: now,
      updatedAt: now,
    };
  }

  function onAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;

    const due = dueDate || isoDate(new Date());

    const newTask = authed
      ? makeTask(trimmed, due, priority ?? 3)
      : createTask({ title: trimmed, dueDate: due, priority: priority ?? 3, status: "todo" });

    setTasks((prev) => [newTask, ...prev]);
    setTitle("");
    setJustAddedId(newTask.id);

    setDueDate(isoDate(new Date()));
    setPriority(3);

    window.setTimeout(() => setJustAddedId(null), 650);
  }

  function onToggleDone(task: Task) {
    const nextStatus = task.status === "done" ? "todo" : "done";

    if (authed) {
      const now = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, updatedAt: now } : t))
      );
      return;
    }

    const updated = updateTask(task.id, { status: nextStatus });
    if (!updated) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  }

  function inNext7Days(due: string) {
    const today = isoDate(new Date());
    const end = isoDate(endOfWeek());
    return due >= today && due <= end;
  }

  function onSetDue(task: Task, dueDate: string) {
    const nextDue = dueDate || undefined;

    if (authed) {
      const now = new Date().toISOString();
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, dueDate: nextDue, updatedAt: now } : t)));

      // your view-switch logic can stay the same
      if (view === "today" && nextDue && nextDue !== isoDate(new Date())) setView(inNext7Days(nextDue) ? "week" : "all");
      if (view === "week" && nextDue && !inNext7Days(nextDue)) setView("all");
      return;
    }

    const updated = updateTask(task.id, { dueDate: nextDue });
    if (!updated) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));

    if (view === "today" && nextDue && nextDue !== isoDate(new Date())) setView(inNext7Days(nextDue) ? "week" : "all");
    if (view === "week" && nextDue && !inNext7Days(nextDue)) setView("all");
  }

  function onSetPriority(task: Task, p: Priority) {
    if (authed) {
      const now = new Date().toISOString();
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, priority: p, updatedAt: now } : t)));
      return;
    }

    const updated = updateTask(task.id, { priority: p });
    if (!updated) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  }

  function onRemove(task: Task) {
    if (!authed) deleteTask(task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
  }

  return (
    <div className="lo-page lo-tasks lo-stack">
      <Card className="toolbar-card">
        <div className="lo-toolbar">
          <Button variant={view === "today" ? "primary" : "ghost"} onClick={() => setView("today")}>
            Today
          </Button>
          <Button variant={view === "week" ? "primary" : "ghost"} onClick={() => setView("week")}>
            This Week
          </Button>
          <Button variant={view === "all" ? "primary" : "ghost"} onClick={() => setView("all")}>
            All
          </Button>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 14 }}>
            {filtered.length} items
          </span>
        </div>
      </Card>

      <Card className="toolbar-card">
        <div className="lo-addbar">
            <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            onKeyDown={(e) => e.key === "Enter" && canAdd && onAdd()}
            />

            <div className="lo-chip" title="Due date">
            <label>Due</label>
            <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
            />
            </div>

            <div className="lo-chip" title="Priority">
            <label>Priority</label>
            <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) as Priority)}
                aria-label="Priority"
            >
                <option value={1}>High</option>
                <option value={2}>Med</option>
                <option value={3}>Low</option>
            </select>
            </div>

            <div className="lo-add-btn">
            <Button onClick={onAdd} disabled={!canAdd}>
                Add
            </Button>
            </div>
        </div>
        </Card>

      <div className="lo-tasklist lo-stack">
        {filtered.map((task) => {
        const isNew = task.id === justAddedId;

        const priorityLabel = task.priority === 1 ? "High" : task.priority === 2 ? "Med" : "Low";
        const priClass = task.priority === 1 ? "high" : task.priority === 2 ? "med" : "low";

        return (
            <Card key={task.id} className={`lo-task ${task.status === "done" ? "is-done" : ""} ${isNew ? "is-new" : ""}`}>
            <div className="lo-task-row">
                <input
                type="checkbox"
                checked={task.status === "done"}
                onChange={() => onToggleDone(task)}
                aria-label="Mark done"
                />

                <div
                className={`lo-task-title ${task.status === "done" ? "is-done" : ""}`}
                title={task.title}
                
                >
                {task.title}
                </div>

                <Button variant="danger" onClick={() => onRemove(task)}>
                Delete
                </Button>
            </div>

            <div className="lo-meta-row">
                <span>Due</span>
                <input
                type="date"
                value={task.dueDate ?? ""}
                onChange={(e) => onSetDue(task, e.target.value)}
                />

                <span className={`lo-pill ${priClass}`}>{priorityLabel}</span>

                <span style={{ marginLeft: "auto" }} />

                <span className="muted">Set priority:</span>
                <select
                className="lo-pri-select"
                value={task.priority}
                onChange={(e) => onSetPriority(task, Number(e.target.value) as Priority)}
                aria-label="Set priority"
                >
                <option value={1}>High</option>
                <option value={2}>Med</option>
                <option value={3}>Low</option>
                </select>
            </div>
            </Card>
        );
        })}
      </div>
    </div>
  );
}