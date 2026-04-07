import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Task } from "../../types/task";
import {
  createTask,
  deleteTask,
  loadTasks,
  updateTask,
} from "../../lib/tasksStore";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { getJwt, onAuthChange } from "../../lib/identity";
import { createPortal } from "react-dom";

type Priority = 1 | 2 | 3;

function isoDate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
function formatDateTime(iso?: string) {
  if (!iso) return "";

  const d = new Date(iso);

  const today = new Date();
  const isSameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const time = d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isSameDay) {
    return `Today, ${time}`;
  }

  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTaskDateKey(task: Task) {
  const raw = task.dueDate ?? task.plannedFor;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

function isTaskOverdue(task: Task) {
  if (task.status === "done") return false;

  const raw = task.dueDate ?? task.plannedFor;
  if (!raw) return false;

  const now = new Date();
  const due = new Date(raw);

  return due < now;
}

function getCreatedDateKey(task: Task) {
  if (!task.createdAt) return null;
  return isoDate(new Date(task.createdAt));
}

type TasksMode = "focus" | "plan";
type FocusFilter = "all" | "today" | "overdue";
type StatusFilter = "all" | "inprogress" | "completed";

export default function TasksApp({
  mode = "plan",
  setWindowHeader,
}: {
  mode?: TasksMode;
  setWindowHeader?: (node: React.ReactNode | null) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");

  // ✅ defaults requested
  const [dueDate, setDueDate] = useState<string>(() => isoDate(new Date())); // today
  const [priority, setPriority] = useState<Priority>(3); // low

  // ✅ for “new task” animation
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const [authed, setAuthed] = useState(false);
  const ignoreNextSaveRef = useRef(false);

  // ✅ error handling for load
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ✅ focus mode filter (hide completed)
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showFocusFilter, setShowFocusFilter] = useState(false);

  // ✅ context menu state
  const [contextMenu, setContextMenu] = useState<{
    task: Task;
    x: number;
    y: number;
  } | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<{
    title: string;
    notes: string;
    dueDate: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const focusFilterWrapRef = useRef<HTMLDivElement | null>(null);
  const focusFilterMenuRef = useRef<HTMLDivElement | null>(null);

  // ✅ helpers for open / close / duplicate / edit save
  const openTaskMenu = useCallback((e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation();

    const container = pageRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    const menuWidth = 190;
    const menuHeight = 132;

    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const x = Math.min(rawX + 8, rect.width - menuWidth - 8);
    const y = Math.min(rawY + 8, rect.height - menuHeight - 8);

    setContextMenu((prev) => {
      if (prev && prev.task.id === task.id) {
        return null;
      }

      return {
        task,
        x: Math.max(8, x),
        y: Math.max(8, y),
      };
    });
  }, []);

  const [filterMenuPos, setFilterMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const closeTaskMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const onDuplicateTask = useCallback((task: Task) => {
    const now = new Date().toISOString();

    const copy: Task = {
      ...task,
      id: crypto.randomUUID(),
      title: `${task.title} copy`,
      status: task.status === "done" ? "todo" : task.status,
      createdAt: now,
      updatedAt: now,
    };

    setTasks((prev) => [copy, ...prev]);
    setJustAddedId(copy.id);
    window.setTimeout(() => setJustAddedId(null), 1600);
  }, []);

  const startEditingTask = useCallback((task: Task) => {
    const start = getTimeParts(task.plannedStart ?? task.plannedFor);
    const end = getTimeParts(task.plannedEnd);

    setEditingTaskId(task.id);
    setEditorDraft({
      title: task.title ?? "",
      notes: task.notes ?? "",
      dueDate: task.dueDate ?? start.date ?? "",
      startTime: start.time ?? "",
      endTime: end.time ?? "",
    });
    setContextMenu(null);
  }, []);

  const cancelEditingTask = useCallback(() => {
    setEditingTaskId(null);
    setEditorDraft(null);
  }, []);

  const saveEditedTask = useCallback(
    (task: Task) => {
      if (!editorDraft) return;

      const trimmed = editorDraft.title.trim();
      if (!trimmed) {
        cancelEditingTask();
        return;
      }

      const now = new Date().toISOString();

      const patch = {
        title: trimmed,
        notes: editorDraft.notes.trim() || undefined,
        dueDate: editorDraft.dueDate || undefined,
        plannedFor:
          combineDateAndTime(editorDraft.dueDate, editorDraft.startTime) ||
          editorDraft.dueDate ||
          undefined,
        plannedStart: combineDateAndTime(
          editorDraft.dueDate,
          editorDraft.startTime,
        ),
        plannedEnd: combineDateAndTime(
          editorDraft.dueDate,
          editorDraft.endTime,
        ),
        updatedAt: now,
      };

      if (authed) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)),
        );
      } else {
        const updated = updateTask(task.id, patch);
        if (!updated) return;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      }

      cancelEditingTask();
    },
    [authed, editorDraft, cancelEditingTask],
  );

  function getTimeParts(iso?: string) {
    if (!iso) return { date: "", time: "" };

    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");

    return {
      date: `${yyyy}-${mm}-${dd}`,
      time: `${hh}:${min}`,
    };
  }

  function combineDateAndTime(date?: string, time?: string) {
    if (!date) return undefined;
    if (!time) return undefined;
    return `${date}T${time}:00`;
  }

  const reloadTasks = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const jwt = await getJwt();
      setAuthed(!!jwt);

      ignoreNextSaveRef.current = true;

      if (!jwt) {
        setTasks(loadTasks());
        setLoading(false);
        return;
      }

      const res = await fetch("/.netlify/functions/tasks", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!res.ok) {
        const text = await res.text();
        setLoadError(`Tasks failed to load (${res.status}): ${text}`);
        // ✅ Keep existing tasks visible instead of clearing
        setLoading(false);
        return;
      }

      const remote = (await res.json()) as Task[];
      setTasks(Array.isArray(remote) ? remote : []);
      setLoading(false);
    } catch (e: any) {
      setLoadError(e?.message ?? "Tasks failed to load");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadTasks();
  }, [reloadTasks]);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      unsub = await onAuthChange(() => {
        reloadTasks();
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [reloadTasks]);

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      hydratedRef.current = true;
      return;
    }

    // debounce
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      const jwt = await getJwt();

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

    const normalizedQuery = query.trim().toLowerCase();

    const searched = !normalizedQuery
      ? tasks
      : tasks.filter((t) => {
          const q = normalizedQuery.startsWith("@")
            ? normalizedQuery.slice(1)
            : normalizedQuery;

          return (
            t.title.toLowerCase().includes(q) ||
            (t.notes ?? "").toLowerCase().includes(q) ||
            (t.list ?? "").toLowerCase().includes(q) ||
            (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
          );
        });

    if (mode !== "focus") {
      return searched;
    }

    return searched.filter((t) => {
      const dueDateKey = getTaskDateKey(t);
      const createdDateKey = getCreatedDateKey(t);

      const isToday = createdDateKey === today;
      const isOverdue =
        !!dueDateKey && dueDateKey < today && t.status !== "done";

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "inprogress"
            ? t.status === "doing"
            : t.status === "done";

      const matchesFocus =
        focusFilter === "all"
          ? true
          : focusFilter === "today"
            ? isToday
            : isOverdue;

      const matchesHideCompleted = hideCompleted ? t.status !== "done" : true;

      return matchesStatus && matchesFocus && matchesHideCompleted;
    });
  }, [tasks, query, mode, focusFilter, statusFilter, hideCompleted]);

  const canAdd = title.trim().length > 0;

  function makeTask(title: string, due?: string, priority: Priority = 3): Task {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      title,
      status: "todo",
      priority,
      dueDate: due,
      sortOrder: tasks.length
        ? Math.max(...tasks.map((t) => t.sortOrder ?? 0)) + 1
        : 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  function onCreateDraftTask() {
    const today = isoDate(new Date());
    const now = new Date().toISOString();
    const nextSortOrder = tasks.length
      ? Math.max(...tasks.map((t) => t.sortOrder ?? 0)) + 1
      : 1;

    const draft: Task = authed
      ? {
          id: crypto.randomUUID(),
          title: "",
          status: "todo",
          priority: 3,
          dueDate: today,
          plannedFor: today,
          focus: true,
          list: "focus",
          tags: ["focus"],
          sortOrder: nextSortOrder,
          createdAt: now,
          updatedAt: now,
        }
      : createTask({
          title: "",
          dueDate: today,
          plannedFor: today,
          priority: 3,
          status: "todo",
          focus: true,
          list: "focus",
          tags: ["focus"],
          sortOrder: nextSortOrder,
        });

    setTasks((prev) => [...prev, draft]);
    setJustAddedId(draft.id);
  }

  function onSaveDraftTask(id: string, nextTitle: string) {
    const trimmed = nextTitle.trim();

    if (!trimmed) {
      onRemoveById(id);
      return;
    }

    if (authed) {
      const now = new Date().toISOString();

      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, title: trimmed, updatedAt: now } : t,
        ),
      );

      window.setTimeout(() => setJustAddedId(null), 300);
      return;
    }

    const updated = updateTask(id, { title: trimmed });
    if (!updated) return;

    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    window.setTimeout(() => setJustAddedId(null), 300);
  }

  async function onAdd(forcedList?: string) {
    const trimmed = title.trim();
    if (!trimmed) return;

    const due = dueDate || undefined;
    const today = isoDate(new Date());

    const basePatch =
      mode === "focus"
        ? {
            dueDate: today,
            plannedFor: today,
            priority: priority ?? 3,
            status: "todo" as const,
            focus: true,
          }
        : {
            dueDate: due,
            priority: priority ?? 3,
            status: "todo" as const,
          };

    const taskList = mode === "plan" ? (forcedList ?? "inbox") : "focus";

    const newTask = authed
      ? {
          ...makeTask(trimmed, due, priority ?? 3),
          ...basePatch,
          list: taskList,
          tags: mode === "focus" ? ["focus"] : [],
        }
      : createTask({
          title: trimmed,
          ...basePatch,
          list: taskList,
          tags: mode === "focus" ? ["focus"] : [],
        });

    setTasks((prev) => [newTask, ...prev]);
    setTitle("");
    setDueDate(isoDate(new Date()));
    setPriority(3);
    setJustAddedId(newTask.id);
    window.setTimeout(() => setJustAddedId(null), 1600);
  }

  function playTaskCompleteSound() {
    if (typeof window === "undefined") return;

    const audio = new Audio("/audio/task-complete.mp3");
    audio.volume = 0.5;
    void audio.play().catch(() => {
      // ignore autoplay restrictions
    });
  }

  function onToggleDone(task: Task) {
    const nextStatus: "todo" | "done" =
      task.status === "done" ? "todo" : "done";

    const shouldPlayCompleteSound = nextStatus === "done";

    if (authed) {
      const now = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: nextStatus, updatedAt: now } : t,
        ),
      );

      if (shouldPlayCompleteSound) {
        playTaskCompleteSound();
      }

      broadcastTaskStatus(task.id, nextStatus);
      return;
    }

    const updated = updateTask(task.id, { status: nextStatus });
    if (!updated) return;

    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));

    if (shouldPlayCompleteSound) {
      playTaskCompleteSound();
    }

    broadcastTaskStatus(task.id, nextStatus);
  }

  function onSetStatus(task: Task, status: "todo" | "doing" | "done") {
    const shouldPlayCompleteSound = status === "done" && task.status !== "done";

    if (authed) {
      const now = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status, updatedAt: now } : t,
        ),
      );

      if (shouldPlayCompleteSound) {
        playTaskCompleteSound();
      }

      broadcastTaskStatus(task.id, status);
      return;
    }

    const updated = updateTask(task.id, { status });
    if (!updated) return;

    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));

    if (shouldPlayCompleteSound) {
      playTaskCompleteSound();
    }

    broadcastTaskStatus(task.id, status);
  }

  function onSetDue(task: Task, dueDate: string) {
    const nextDue = dueDate || undefined;

    if (authed) {
      const now = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, dueDate: nextDue, updatedAt: now } : t,
        ),
      );
      return;
    }

    const updated = updateTask(task.id, { dueDate: nextDue });
    if (!updated) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  }

  function onSetPriority(task: Task, p: Priority) {
    if (authed) {
      const now = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, priority: p, updatedAt: now } : t,
        ),
      );
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

  function onRemoveById(id: string) {
    if (authed) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      return;
    }

    deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function sortTasksForFocus(items: Task[]) {
    return [...items].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  function reorderFocusTasks(
    sourceTaskId: string,
    targetTaskId: string,
    targetStatus: "todo" | "doing",
  ) {
    setTasks((prev) => {
      const next = [...prev];
      const source = next.find((t) => t.id === sourceTaskId);
      const target = next.find((t) => t.id === targetTaskId);

      if (!source || !target) return prev;

      source.status = targetStatus;

      const bucket = sortTasksForFocus(
        next.filter((t) => t.status === targetStatus && t.id !== sourceTaskId),
      );

      const targetIndex = bucket.findIndex((t) => t.id === targetTaskId);
      const insertAt = targetIndex < 0 ? bucket.length : targetIndex;

      bucket.splice(insertAt, 0, source);

      bucket.forEach((task, index) => {
        task.sortOrder = index + 1;
        task.updatedAt = new Date().toISOString();
        if (!authed)
          updateTask(task.id, {
            sortOrder: task.sortOrder,
            status: task.status,
          });
      });

      return next.map((task) => {
        const updated = bucket.find((b) => b.id === task.id);
        return updated ? { ...task, ...updated } : task;
      });
    });
  }

  function moveFocusTaskToEnd(taskId: string, targetStatus: "todo" | "doing") {
    setTasks((prev) => {
      const next = [...prev];
      const moving = next.find((t) => t.id === taskId);
      if (!moving) return prev;

      moving.status = targetStatus;

      const bucket = sortTasksForFocus(
        next.filter((t) => t.status === targetStatus && t.id !== taskId),
      );

      bucket.push(moving);

      bucket.forEach((task, index) => {
        task.sortOrder = index + 1;
        task.updatedAt = new Date().toISOString();
        if (!authed)
          updateTask(task.id, {
            sortOrder: task.sortOrder,
            status: task.status,
          });
      });

      return next.map((task) => {
        const updated = bucket.find((b) => b.id === task.id);
        return updated ? { ...task, ...updated } : task;
      });
    });
  }

  function broadcastTaskStatus(
    taskId: string,
    status: "todo" | "doing" | "done",
  ) {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("lifeos:task-status-changed", {
        detail: { taskId, status },
      }),
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleTaskStatusChanged(event: Event) {
      const customEvent = event as CustomEvent<{
        taskId: string;
        status: "todo" | "doing" | "done";
      }>;

      const taskId = customEvent.detail?.taskId;
      const status = customEvent.detail?.status;

      if (!taskId || !status) return;

      const now = new Date().toISOString();

      if (authed) {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId ? { ...task, status, updatedAt: now } : task,
          ),
        );
        return;
      }

      const updated = updateTask(taskId, { status, updatedAt: now });
      if (!updated) return;

      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? updated : task)),
      );
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
  }, [authed]);

  // Close the menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;

    const onClose = () => setContextMenu(null);

    window.addEventListener("click", onClose);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);

    return () => {
      window.removeEventListener("click", onClose);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [contextMenu]);

  useEffect(() => {
    function handleTaskScheduled(event: Event) {
      const customEvent = event as CustomEvent<{
        taskId: string | null;
        title: string;
        date: string;
        hour: number;
      }>;

      const taskId = customEvent.detail?.taskId;
      const date = customEvent.detail?.date;

      if (!taskId || !date) return;

      setTasks((prev) =>
        prev.map((task) => {
          if (task.id !== taskId) return task;

          const nextTask = {
            ...task,
            plannedFor: date,
            dueDate: task.dueDate ?? date,
            list: "planner",
            updatedAt: new Date().toISOString(),
          };

          if (!authed) {
            updateTask(task.id, {
              plannedFor: nextTask.plannedFor,
              dueDate: nextTask.dueDate,
              list: nextTask.list,
            });
          }

          return nextTask;
        }),
      );
    }

    window.addEventListener(
      "lifeos:task-scheduled",
      handleTaskScheduled as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:task-scheduled",
        handleTaskScheduled as EventListener,
      );
    };
  }, [authed]);

  useEffect(() => {
    if (!showFocusFilter) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;

      if (!focusFilterWrapRef.current?.contains(target)) {
        setShowFocusFilter(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowFocusFilter(false);
      }
    }

    function handleViewportChange() {
      setShowFocusFilter(false);
    }

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [showFocusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleCalendarTaskCreated(event: Event) {
      const customEvent = event as CustomEvent<{
        calendarEventId: string;
        title: string;
        date: string;
        hour: number;
        minute?: 0 | 15 | 30 | 45;
      }>;

      const detail = customEvent.detail;
      if (!detail?.calendarEventId || !detail.date) return;

      const plannedMinute = detail.minute ?? 0;
      const plannedFor = `${detail.date}T${String(detail.hour).padStart(2, "0")}:${String(plannedMinute).padStart(2, "0")}:00`;

      const now = new Date().toISOString();

      const createdTask = authed
        ? {
            id: crypto.randomUUID(),
            title: detail.title?.trim() || "New task",
            status: "todo" as const,
            priority: 3 as const,
            dueDate: detail.date,
            plannedFor,
            plannedStart: plannedFor,
            plannedEnd: undefined,
            list: "planner",
            sortOrder: tasks.length
              ? Math.max(...tasks.map((t) => t.sortOrder ?? 0)) + 1
              : 1,
            createdAt: now,
            updatedAt: now,
          }
        : createTask({
            title: detail.title?.trim() || "New task",
            status: "todo",
            priority: 3,
            dueDate: detail.date,
            plannedFor,
            plannedStart: plannedFor,
            plannedEnd: undefined,
            list: "planner",
            sortOrder: tasks.length
              ? Math.max(...tasks.map((t) => t.sortOrder ?? 0)) + 1
              : 1,
          });

      setTasks((prev) => {
        const alreadyExists = prev.some(
          (task) =>
            task.title === createdTask.title &&
            task.plannedStart === plannedFor &&
            task.list === "planner",
        );

        if (alreadyExists) return prev;
        return [createdTask, ...prev];
      });

      window.dispatchEvent(
        new CustomEvent("lifeos:calendar-link-task", {
          detail: {
            calendarEventId: detail.calendarEventId,
            taskId: createdTask.id,
            taskStatus: createdTask.status,
          },
        }),
      );
    }

    window.addEventListener(
      "lifeos:calendar-task-created",
      handleCalendarTaskCreated as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:calendar-task-created",
        handleCalendarTaskCreated as EventListener,
      );
    };
  }, [authed, tasks]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleCalendarTaskRemoved(event: Event) {
      const customEvent = event as CustomEvent<{ taskId: string }>;
      const taskId = customEvent.detail?.taskId;
      if (!taskId) return;

      if (!authed) {
        deleteTask(taskId);
      }

      setTasks((prev) => prev.filter((task) => task.id !== taskId));
    }

    window.addEventListener(
      "lifeos:calendar-task-removed",
      handleCalendarTaskRemoved as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:calendar-task-removed",
        handleCalendarTaskRemoved as EventListener,
      );
    };
  }, [authed]);

  return (
    <div ref={pageRef} className="lo-page lo-tasks lo-stack lo-tasks-menu-root">
      {loading && <div className="muted">Loading tasks…</div>}
      {loadError && (
        <div className="error">
          {loadError}
          <button className="linkBtn" onClick={reloadTasks}>
            Retry
          </button>
        </div>
      )}

      {!loading && mode === "focus" && (
        <>
          <div className="lo-window-filter-wrap">
            <div ref={focusFilterWrapRef} className="lo-filter-dropdown">
              <button
                type="button"
                className={`lo-window-filter lo-window-filter--button ${showFocusFilter ? "is-open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();

                  const rect = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();

                  setFilterMenuPos({
                    top: rect.bottom + 6,
                    left: rect.right - 200, // align right edge
                  });

                  setShowFocusFilter((prev) => !prev);
                }}
                aria-label="Filter"
                aria-expanded={showFocusFilter}
              >
                <span>Filter</span>
              </button>
            </div>
            {showFocusFilter &&
              filterMenuPos &&
              createPortal(
                <div
                  ref={focusFilterMenuRef}
                  className="lo-filter-menu"
                  style={{
                    position: "fixed",
                    top: filterMenuPos.top,
                    left: filterMenuPos.left,
                    zIndex: 9999,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="lo-filter-group">
                    <div className="lo-filter-label">Progress:</div>

                    <label className="lo-filter-option lo-filter-option--checkbox">
                      <input
                        type="checkbox"
                        checked={hideCompleted}
                        onChange={() => setHideCompleted((prev) => !prev)}
                      />
                      <span>Hide Completed</span>
                    </label>

                    <label className="lo-filter-option lo-filter-option--checkbox">
                      <input
                        type="checkbox"
                        checked={focusFilter === "today"}
                        onChange={() =>
                          setFocusFilter((prev) =>
                            prev === "today" ? "all" : "today",
                          )
                        }
                      />
                      <span>Today</span>
                    </label>

                    <label className="lo-filter-option lo-filter-option--checkbox">
                      <input
                        type="checkbox"
                        checked={focusFilter === "overdue"}
                        onChange={() =>
                          setFocusFilter((prev) =>
                            prev === "overdue" ? "all" : "overdue",
                          )
                        }
                      />
                      <span>Overdue</span>
                    </label>
                  </div>
                </div>,
                document.body,
              )}
          </div>

          <FocusTasksView
            onCreateDraftTask={onCreateDraftTask}
            onSaveDraftTask={onSaveDraftTask}
            tasks={filtered}
            justAddedId={justAddedId}
            onToggleDone={onToggleDone}
            onSetStatus={onSetStatus}
            onRemove={onRemove}
            onReorderTask={reorderFocusTasks}
            onMoveTaskToColumnEnd={moveFocusTaskToEnd}
            onOpenTaskMenu={openTaskMenu}
            startEditingTask={startEditingTask}
            editingTaskId={editingTaskId}
            editorDraft={editorDraft}
            setEditorDraft={setEditorDraft}
            saveEditedTask={saveEditedTask}
            cancelEditingTask={cancelEditingTask}
          />
        </>
      )}

      {!loading && mode === "plan" && (
        <PlanTasksView
          query={query}
          setQuery={setQuery}
          title={title}
          setTitle={setTitle}
          dueDate={dueDate}
          setDueDate={setDueDate}
          priority={priority}
          setPriority={setPriority}
          canAdd={canAdd}
          onAdd={onAdd}
          tasks={filtered}
          justAddedId={justAddedId}
          onToggleDone={onToggleDone}
          onRemove={onRemove}
          onSetDue={onSetDue}
          onSetPriority={onSetPriority}
          onOpenTaskMenu={openTaskMenu}
        />
      )}
      {contextMenu && (
        <div
          className="lo-task-menu"
          style={{
            position: "absolute",
            top: contextMenu.y,
            left: contextMenu.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.task.status === "todo" && (
            <button
              className="lo-task-menu__item"
              onClick={() => {
                onSetStatus(contextMenu.task, "doing");
                closeTaskMenu();
              }}
            >
              Start
            </button>
          )}

          {contextMenu.task.status === "doing" && (
            <button
              className="lo-task-menu__item"
              onClick={() => {
                onSetStatus(contextMenu.task, "todo");
                closeTaskMenu();
              }}
            >
              Move back
            </button>
          )}

          <button
            className="lo-task-menu__item"
            onClick={() => startEditingTask(contextMenu.task)}
          >
            Edit
          </button>

          <button
            className="lo-task-menu__item"
            onClick={() => {
              onDuplicateTask(contextMenu.task);
              closeTaskMenu();
            }}
          >
            Duplicate
          </button>

          <button
            className="lo-task-menu__item is-danger"
            onClick={() => {
              onRemove(contextMenu.task);
              closeTaskMenu();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// View components
function FocusTasksView({
  onCreateDraftTask,
  onSaveDraftTask,
  tasks,
  justAddedId,
  onToggleDone,
  onSetStatus,
  onRemove,
  onReorderTask,
  onMoveTaskToColumnEnd,
  onOpenTaskMenu,
  startEditingTask,
  editingTaskId,
  editorDraft,
  setEditorDraft,
  saveEditedTask,
  cancelEditingTask,
}: {
  onCreateDraftTask: () => void;
  onSaveDraftTask: (id: string, title: string) => void;
  tasks: Task[];
  justAddedId: string | null;
  onToggleDone: (task: Task) => void;
  onSetStatus: (task: Task, status: "todo" | "doing" | "done") => void;
  onRemove: (task: Task) => void;
  onReorderTask: (
    sourceTaskId: string,
    targetTaskId: string,
    targetStatus: "todo" | "doing",
  ) => void;
  onMoveTaskToColumnEnd: (
    taskId: string,
    targetStatus: "todo" | "doing",
  ) => void;
  onOpenTaskMenu: (e: React.MouseEvent, task: Task) => void;
  editingTaskId: string | null;
  editorDraft: {
    title: string;
    notes: string;
    dueDate: string;
    startTime: string;
    endTime: string;
  } | null;
  setEditorDraft: React.Dispatch<
    React.SetStateAction<{
      title: string;
      notes: string;
      dueDate: string;
      startTime: string;
      endTime: string;
    } | null>
  >;
  saveEditedTask: (task: Task) => void;
  cancelEditingTask: () => void;
  startEditingTask: (task: Task) => void;
}) {
  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(
    null,
  );
  const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null);
  const [inlineValue, setInlineValue] = React.useState("");
  function saveInlineEdit(task: Task) {
    const trimmed = inlineValue.trim();

    if (!trimmed) {
      setInlineEditId(null);
      setInlineValue("");
      return;
    }

    onSaveDraftTask(task.id, trimmed);
    setInlineEditId(null);
    setInlineValue("");
  }
  function autoResizeTextarea(el: HTMLTextAreaElement) {
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }
  const doing = [...tasks]
    .filter((t) => t.status === "doing")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const next = [...tasks]
    .filter((t) => t.status === "todo")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const completed = [...tasks]
    .filter((t) => t.status === "done")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <>
      <div className="lo-focus-composer">
        <button
          type="button"
          className="lo-focus-add-trigger"
          onClick={onCreateDraftTask}
        >
          + Add task
        </button>
      </div>

      <section
        className="lo-stack"
        onDragOver={(e) => {
          e.preventDefault();
          if (!draggingTaskId) return;
          setDropTargetId("__doing-end__");
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!draggingTaskId) return;
          onMoveTaskToColumnEnd(draggingTaskId, "doing");
          setDraggingTaskId(null);
          setDropTargetId(null);
        }}
      >
        <h3 className="lo-section-title">In Progress</h3>
        {doing.length === 0 && (
          <div className="muted">No active task right now.</div>
        )}
        {doing.map((task) => (
          <Card
            key={task.id}
            className={`lo-task lo-task-focus ${task.id === justAddedId ? "is-new" : ""}`}
            draggable={task.title.trim() !== ""}
            onContextMenu={(e) => onOpenTaskMenu(e, task)}
            onDoubleClick={() => {
              if (!task.title.trim()) return;
              startEditingTask(task);
            }}
            onDragStart={(e) => {
              if (!task.title.trim()) return;
              setDraggingTaskId(task.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(
                "application/x-lifeos-focus-reorder",
                task.id,
              );
              e.dataTransfer.setData(
                "application/x-lifeos-task",
                JSON.stringify({
                  id: task.id,
                  title: task.title,
                }),
              );
              e.dataTransfer.setData("text/plain", task.title);
            }}
            onDragEnd={() => {
              setDraggingTaskId(null);
              setDropTargetId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!draggingTaskId || draggingTaskId === task.id) return;
              setDropTargetId(task.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!draggingTaskId || draggingTaskId === task.id) return;
              onReorderTask(draggingTaskId, task.id, "doing");
              setDraggingTaskId(null);
              setDropTargetId(null);
            }}
          >
            {dropTargetId === task.id && draggingTaskId !== task.id && (
              <div className="lo-task-drop-indicator" />
            )}
            <div className="lo-task-row">
              <input
                type="checkbox"
                checked={task.status === "done"}
                onChange={() => onToggleDone(task)}
                aria-label="Mark done"
              />
              {task.title.trim() === "" ? (
                <FocusDraftInput
                  taskId={task.id}
                  onSave={onSaveDraftTask}
                  onCancel={() => onRemove(task)}
                />
              ) : (
                <div className="lo-task-main">
                  <span className="lo-task-drag">⋮⋮</span>

                  {editingTaskId === task.id && editorDraft ? (
                    <div
                      className="lo-task-editor"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <input
                        className="lo-task-edit-input"
                        value={editorDraft.title}
                        onChange={(e) =>
                          setEditorDraft((prev) =>
                            prev ? { ...prev, title: e.target.value } : prev,
                          )
                        }
                        autoFocus
                        placeholder="Task title"
                      />

                      <textarea
                        className="lo-task-editor-textarea"
                        value={editorDraft.notes}
                        onChange={(e) =>
                          setEditorDraft((prev) =>
                            prev ? { ...prev, notes: e.target.value } : prev,
                          )
                        }
                        placeholder="Task description"
                        rows={3}
                      />

                      <div className="lo-task-editor-grid">
                        <label>
                          <span>Date</span>
                          <input
                            type="date"
                            value={editorDraft.dueDate}
                            onChange={(e) =>
                              setEditorDraft((prev) =>
                                prev
                                  ? { ...prev, dueDate: e.target.value }
                                  : prev,
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Start</span>
                          <input
                            type="time"
                            value={editorDraft.startTime}
                            onChange={(e) =>
                              setEditorDraft((prev) =>
                                prev
                                  ? { ...prev, startTime: e.target.value }
                                  : prev,
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>End</span>
                          <input
                            type="time"
                            value={editorDraft.endTime}
                            onChange={(e) =>
                              setEditorDraft((prev) =>
                                prev
                                  ? { ...prev, endTime: e.target.value }
                                  : prev,
                              )
                            }
                          />
                        </label>
                      </div>

                      <div className="lo-task-editor-actions">
                        <button
                          type="button"
                          className="lo-task-editor-btn"
                          onClick={() => cancelEditingTask()}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="lo-task-editor-btn is-primary"
                          onClick={() => saveEditedTask(task)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : inlineEditId === task.id ? (
                    <textarea
                      className="lo-task-inline-edit"
                      value={inlineValue}
                      autoFocus
                      rows={1}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setInlineValue(e.target.value);
                        autoResizeTextarea(e.currentTarget);
                      }}
                      onFocus={(e) => {
                        const el = e.currentTarget;
                        autoResizeTextarea(el);

                        // move cursor to end
                        const length = el.value.length;
                        el.setSelectionRange(length, length);
                      }}
                      onBlur={() => saveInlineEdit(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveInlineEdit(task);
                        }
                        if (e.key === "Escape") {
                          setInlineEditId(null);
                          setInlineValue("");
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="lo-task-title lo-task-title-editable"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInlineEditId(task.id);
                        setInlineValue(task.title);
                      }}
                      title="Edit task title"
                    >
                      {task.title}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className="lo-task-menu-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTaskMenu(e, task);
                }}
              >
                ⋯
              </button>
            </div>

            <div
              className={`lo-task-meta-left ${isTaskOverdue(task) ? "is-overdue" : ""}`}
            >
              <img src="/icons/white/calendar.png" alt="Created" />
              <span>{formatDateTime(task.createdAt)}</span>
            </div>
          </Card>
        ))}
        {dropTargetId === "__doing-end__" && draggingTaskId && (
          <div className="lo-task-drop-indicator lo-task-drop-indicator--end" />
        )}
      </section>

      <section
        className="lo-stack"
        onDragOver={(e) => {
          e.preventDefault();
          if (!draggingTaskId) return;
          setDropTargetId("__todo-end__");
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!draggingTaskId) return;
          onMoveTaskToColumnEnd(draggingTaskId, "todo");
          setDraggingTaskId(null);
          setDropTargetId(null);
        }}
      >
        <h3 className="lo-section-title">Up Next</h3>
        {next.length === 0 && <div className="muted">Nothing queued.</div>}
        {next.map((task) => (
          <Card
            key={task.id}
            className={`lo-task lo-task-focus ${task.id === justAddedId ? "is-new" : ""}`}
            draggable={task.title.trim() !== ""}
            onContextMenu={(e) => onOpenTaskMenu(e, task)}
            onDoubleClick={() => {
              if (!task.title.trim()) return;
              startEditingTask(task);
            }}
            onDragStart={(e) => {
              if (!task.title.trim()) return;
              setDraggingTaskId(task.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(
                "application/x-lifeos-focus-reorder",
                task.id,
              );
              e.dataTransfer.setData(
                "application/x-lifeos-task",
                JSON.stringify({
                  id: task.id,
                  title: task.title,
                }),
              );
              e.dataTransfer.setData("text/plain", task.title);
            }}
            onDragEnd={() => {
              setDraggingTaskId(null);
              setDropTargetId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!draggingTaskId || draggingTaskId === task.id) return;
              setDropTargetId(task.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!draggingTaskId || draggingTaskId === task.id) return;
              onReorderTask(draggingTaskId, task.id, "todo");
              setDraggingTaskId(null);
              setDropTargetId(null);
            }}
          >
            {dropTargetId === task.id && draggingTaskId !== task.id && (
              <div className="lo-task-drop-indicator" />
            )}
            <div className="lo-task-row">
              <input
                type="checkbox"
                checked={task.status === "done"}
                onChange={() => onToggleDone(task)}
                aria-label="Mark done"
              />
              {task.title.trim() === "" ? (
                <FocusDraftInput
                  taskId={task.id}
                  onSave={onSaveDraftTask}
                  onCancel={() => onRemove(task)}
                />
              ) : (
                <div className="lo-task-main">
                  <span className="lo-task-drag">⋮⋮</span>
                  {editingTaskId === task.id && editorDraft ? (
                    <div
                      className="lo-task-editor"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <input
                        className="lo-task-edit-input"
                        value={editorDraft.title}
                        onChange={(e) =>
                          setEditorDraft((prev) =>
                            prev ? { ...prev, title: e.target.value } : prev,
                          )
                        }
                        autoFocus
                        placeholder="Task title"
                      />

                      <textarea
                        className="lo-task-editor-textarea"
                        value={editorDraft.notes}
                        onChange={(e) =>
                          setEditorDraft((prev) =>
                            prev ? { ...prev, notes: e.target.value } : prev,
                          )
                        }
                        placeholder="Task description"
                        rows={3}
                      />

                      <div className="lo-task-editor-grid">
                        <label>
                          <span>Date</span>
                          <input
                            type="date"
                            value={editorDraft.dueDate}
                            onChange={(e) =>
                              setEditorDraft((prev) =>
                                prev
                                  ? { ...prev, dueDate: e.target.value }
                                  : prev,
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Start</span>
                          <input
                            type="time"
                            value={editorDraft.startTime}
                            onChange={(e) =>
                              setEditorDraft((prev) =>
                                prev
                                  ? { ...prev, startTime: e.target.value }
                                  : prev,
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>End</span>
                          <input
                            type="time"
                            value={editorDraft.endTime}
                            onChange={(e) =>
                              setEditorDraft((prev) =>
                                prev
                                  ? { ...prev, endTime: e.target.value }
                                  : prev,
                              )
                            }
                          />
                        </label>
                      </div>

                      <div className="lo-task-editor-actions">
                        <button
                          type="button"
                          className="lo-task-editor-btn"
                          onClick={cancelEditingTask}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="lo-task-editor-btn is-primary"
                          onClick={() => saveEditedTask(task)}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : inlineEditId === task.id ? (
                    <textarea
                      className="lo-task-inline-edit"
                      value={inlineValue}
                      autoFocus
                      rows={1}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setInlineValue(e.target.value);
                        autoResizeTextarea(e.currentTarget);
                      }}
                      onFocus={(e) => {
                        const el = e.currentTarget;
                        autoResizeTextarea(el);

                        // move cursor to end
                        const length = el.value.length;
                        el.setSelectionRange(length, length);
                      }}
                      onBlur={() => saveInlineEdit(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveInlineEdit(task);
                        }
                        if (e.key === "Escape") {
                          setInlineEditId(null);
                          setInlineValue("");
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="lo-task-title lo-task-title-editable"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInlineEditId(task.id);
                        setInlineValue(task.title);
                      }}
                      title="Edit task title"
                    >
                      {task.title}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className="lo-task-action-btn lo-task-menu-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTaskMenu(e, task);
                }}
              >
                ⋯
              </button>
            </div>

            <div className="lo-task-subrow">
              <div
                className={`lo-task-meta-left ${isTaskOverdue(task) ? "is-overdue" : ""}`}
              >
                <img src="/icons/white/calendar.png" alt="Created" />
                <span>{formatDateTime(task.createdAt)}</span>
              </div>
              <button
                className="lo-task-action-btn lo-task-start-btn"
                onClick={() => onSetStatus(task, "doing")}
              >
                <img src="/icons/start.svg" alt="Start task" />
              </button>
            </div>
          </Card>
        ))}
        {dropTargetId === "__todo-end__" && draggingTaskId && (
          <div className="lo-task-drop-indicator lo-task-drop-indicator--end" />
        )}
      </section>

      <section className="lo-stack">
        <h3 className="lo-section-title">Completed</h3>
        {completed.length === 0 && (
          <div className="muted">No completed tasks.</div>
        )}
        {completed.map((task) => (
          <Card
            key={task.id}
            className={`lo-task lo-task-focus ${task.id === justAddedId ? "is-new" : ""}`}
            onContextMenu={(e) => onOpenTaskMenu(e, task)}
            onDoubleClick={() => {
              if (!task.title.trim()) return;
              startEditingTask(task);
            }}
          >
            {dropTargetId === task.id && draggingTaskId !== task.id && (
              <div className="lo-task-drop-indicator" />
            )}
            <div className="lo-task-row">
              <input
                type="checkbox"
                checked={task.status === "done"}
                onChange={() => onToggleDone(task)}
                aria-label="Mark done"
              />
              <div className="lo-task-main">
                <div className="lo-task-title is-done">{task.title}</div>
              </div>
              <button
                type="button"
                className="lo-task-menu-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTaskMenu(e, task);
                }}
              >
                ⋯
              </button>
            </div>

            <div
              className={`lo-task-meta-left ${isTaskOverdue(task) ? "is-overdue" : ""}`}
            >
              <img
                src="/icons/white/calendar.png"
                alt="Created"
                className="lo-task-meta-icon"
              />
              <span>{formatDateTime(task.createdAt)}</span>
            </div>
          </Card>
        ))}
      </section>
    </>
  );
}

function FocusDraftInput({
  taskId,
  onSave,
  onCancel,
}: {
  taskId: string;
  onSave: (id: string, title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      className="lo-focus-inline-input"
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Type a task..."
      onKeyDown={(e) => {
        if (e.key === "Enter") onSave(taskId, value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (value.trim()) onSave(taskId, value);
        else onCancel();
      }}
    />
  );
}

function labelForList(
  list: "inbox" | "today" | "week" | "planner" | "work" | "personal" | "home",
) {
  if (list === "today") return "Today";
  if (list === "week") return "This Week";
  if (list === "planner") return "Planner";
  if (list === "work") return "Work";
  if (list === "personal") return "Personal";
  if (list === "home") return "Home";
  return "Inbox";
}

function PlanTasksView({
  query,
  setQuery,
  title,
  setTitle,
  dueDate,
  setDueDate,
  priority,
  setPriority,
  canAdd,
  onAdd,
  tasks,
  justAddedId,
  onToggleDone,
  onRemove,
  onSetDue,
  onSetPriority,
  onOpenTaskMenu,
}: {
  query: string;
  setQuery: (value: string) => void;
  title: string;
  setTitle: (value: string) => void;
  dueDate: string;
  setDueDate: (value: string) => void;
  priority: Priority;
  setPriority: (value: Priority) => void;
  canAdd: boolean;
  onAdd: (forcedList?: string) => void;
  tasks: Task[];
  justAddedId: string | null;
  onToggleDone: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSetDue: (task: Task, dueDate: string) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onOpenTaskMenu: (e: React.MouseEvent, task: Task) => void;
}) {
  const [selectedList, setSelectedList] = React.useState<
    "inbox" | "today" | "week" | "planner" | "work" | "personal" | "home"
  >("inbox");

  const todayISO = isoDate(new Date());
  const weekEnd = isoDate(endOfWeek());

  const visibleTasks = tasks.filter((t) => {
    if (selectedList === "inbox") return (t.list ?? "inbox") === "inbox";
    if (selectedList === "planner") return t.list === "planner";
    if (selectedList === "work") return t.list === "work";
    if (selectedList === "personal") return t.list === "personal";
    if (selectedList === "home") return t.list === "home";

    if (selectedList === "today") {
      const due = t.dueDate ?? t.plannedFor;
      return due === todayISO && t.status !== "done";
    }

    if (selectedList === "week") {
      const due = t.dueDate ?? t.plannedFor;
      return !!due && due >= todayISO && due <= weekEnd && t.status !== "done";
    }

    return true;
  });

  return (
    <div className="lo-plan-tasks-layout">
      <Card className="lo-plan-tasks-sidebar">
        <button
          type="button"
          className={selectedList === "inbox" ? "is-active" : ""}
          onClick={() => setSelectedList("inbox")}
        >
          Inbox
        </button>

        <button
          type="button"
          className={selectedList === "today" ? "is-active" : ""}
          onClick={() => setSelectedList("today")}
        >
          Today
        </button>

        <button
          type="button"
          className={selectedList === "week" ? "is-active" : ""}
          onClick={() => setSelectedList("week")}
        >
          This Week
        </button>

        <button
          type="button"
          className={selectedList === "planner" ? "is-active" : ""}
          onClick={() => setSelectedList("planner")}
        >
          Planner
        </button>

        <button
          type="button"
          className={selectedList === "work" ? "is-active" : ""}
          onClick={() => setSelectedList("work")}
        >
          Work
        </button>

        <button
          type="button"
          className={selectedList === "personal" ? "is-active" : ""}
          onClick={() => setSelectedList("personal")}
        >
          Personal
        </button>

        <button
          type="button"
          className={selectedList === "home" ? "is-active" : ""}
          onClick={() => setSelectedList("home")}
        >
          Home
        </button>
      </Card>

      <div className="lo-plan-tasks-main lo-stack">
        <Card className="toolbar-card">
          <div className="lo-toolbar">
            <div className="lo-plan-tasks-heading">
              <h3>{labelForList(selectedList)}</h3>
            </div>

            <div className="spacer" />

            <input
              className="lo-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks… or use @work @planner"
            />
          </div>
        </Card>

        <Card className="toolbar-card">
          <div className="lo-addbar">
            <input
              className="lo-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Add a task in ${labelForList(selectedList)}…`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAdd) {
                  onAdd(
                    selectedList === "today" || selectedList === "week"
                      ? "inbox"
                      : selectedList,
                  );
                }
              }}
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
                onChange={(e) =>
                  setPriority(Number(e.target.value) as Priority)
                }
                aria-label="Priority"
              >
                <option value={1}>High</option>
                <option value={2}>Med</option>
                <option value={3}>Low</option>
              </select>
            </div>

            <div className="lo-add-btn">
              <Button
                onClick={() =>
                  onAdd(
                    selectedList === "today" || selectedList === "week"
                      ? "inbox"
                      : selectedList,
                  )
                }
                disabled={!canAdd}
              >
                Add
              </Button>
            </div>
          </div>
        </Card>

        <TaskSection
          title={labelForList(selectedList)}
          tasks={visibleTasks}
          justAddedId={justAddedId}
          onToggleDone={onToggleDone}
          onRemove={onRemove}
          onSetDue={onSetDue}
          onSetPriority={onSetPriority}
          onOpenTaskMenu={onOpenTaskMenu}
        />
      </div>
    </div>
  );
}

function TaskSection({
  title,
  tasks,
  justAddedId,
  onToggleDone,
  onRemove,
  onSetDue,
  onSetPriority,
  onOpenTaskMenu,
}: {
  title: string;
  tasks: Task[];
  justAddedId: string | null;
  onToggleDone: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSetDue: (task: Task, dueDate: string) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onOpenTaskMenu: (e: React.MouseEvent, task: Task) => void;
}) {
  if (tasks.length === 0) {
    return (
      <section className="lo-stack">
        <h3 className="lo-section-title">{title}</h3>
        <Card className="lo-task">
          <div className="muted">No tasks here yet.</div>
        </Card>
      </section>
    );
  }

  return (
    <section className="lo-stack">
      <h3 className="lo-section-title">{title}</h3>
      <div className="lo-tasklist lo-stack">
        {tasks.map((task) => {
          const isNew = task.id === justAddedId;
          const priorityLabel =
            task.priority === 1 ? "High" : task.priority === 2 ? "Med" : "Low";
          const priClass =
            task.priority === 1 ? "high" : task.priority === 2 ? "med" : "low";

          return (
            <Card
              key={task.id}
              className={`lo-task ${task.status === "done" ? "is-done" : ""} ${isNew ? "is-new" : ""}`}
              draggable={task.title.trim() !== ""}
              onContextMenu={(e) => onOpenTaskMenu(e, task)}
              onDragStart={(e) => {
                if (!task.title.trim()) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  "application/x-lifeos-task",
                  JSON.stringify({
                    id: task.id,
                    title: task.title,
                  }),
                );
                e.dataTransfer.setData("text/plain", task.title);
              }}
            >
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

                <button
                  type="button"
                  className="lo-task-menu-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTaskMenu(e, task);
                  }}
                >
                  ⋯
                </button>
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
                  onChange={(e) =>
                    onSetPriority(task, Number(e.target.value) as Priority)
                  }
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
    </section>
  );
}
