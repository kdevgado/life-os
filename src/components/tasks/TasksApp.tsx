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
  saveTasks,
  updateTask,
} from "../../lib/tasksStore";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { getJwt, onAuthChange } from "../../lib/identity";
import { createPortal } from "react-dom";
import {
  EMPTY_RESOURCE_META,
  fetchAuthedResource,
  ResourceApiError,
  saveAuthedResource,
  type ResourceMeta,
} from "../../lib/resourceApi";

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
const TASKS_FILTER_DROPDOWN_ID = "tasks-filter";

function formatDateForEditor(date?: string) {
  if (!date) return "";
  const [yyyy, mm, dd] = String(date).slice(0, 10).split("-");
  if (!yyyy || !mm || !dd) return "";
  return `${dd}/${mm}/${yyyy}`;
}

function parseEditorDate(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export default function TasksApp({
  mode = "plan",
  setWindowHeader,
}: {
  mode?: TasksMode;
  setWindowHeader?: (node: React.ReactNode | null) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>(() => {
    if (typeof window === "undefined") return [];
    return loadTasks();
  });
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");

  // ✅ defaults requested
  const [dueDate, setDueDate] = useState<string>(() => isoDate(new Date())); // today
  const [priority, setPriority] = useState<Priority>(3); // low

  // ✅ for “new task” animation
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const [authed, setAuthed] = useState(false);
  const ignoreNextSaveRef = useRef(false);
  const serverMetaRef = useRef<ResourceMeta>(EMPTY_RESOURCE_META);

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
    dueDateDisplay: string;
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
    const end = getDefaultEndTime(task);

    setEditingTaskId(task.id);
    setEditorDraft({
      title: task.title ?? "",
      notes: task.notes ?? "",
      dueDate: task.dueDate ?? start.date ?? "",
      dueDateDisplay: formatDateForEditor(task.dueDate ?? start.date ?? ""),
      startTime: start.time || "00:00",
      endTime: end.time || "00:30",
    });
    setContextMenu(null);
  }, []);

  const cancelEditingTask = useCallback(() => {
    setEditingTaskId(null);
    setEditorDraft(null);
  }, []);

  const buildEditorTaskPatch = useCallback(
    (draft: NonNullable<typeof editorDraft>) => {
      const now = new Date().toISOString();
      return {
        title: draft.title,
        notes: draft.notes || undefined,
        dueDate: draft.dueDate || undefined,
        plannedFor:
          combineDateAndTime(draft.dueDate, draft.startTime) ||
          draft.dueDate ||
          undefined,
        plannedStart: combineDateAndTime(draft.dueDate, draft.startTime),
        plannedEnd: combineDateAndTime(draft.dueDate, draft.endTime),
        updatedAt: now,
      };
    },
    [],
  );

  const removeTaskFromCalendar = useCallback(
    (task: Task) => {
      applyTaskPatch(
        task,
        {
          plannedFor: undefined,
          plannedStart: undefined,
          plannedEnd: undefined,
        },
        {
          broadcastUpdate: true,
        },
      );
    },
    [authed],
  );

  function getTimeParts(iso?: string) {
    if (!iso) return { date: "", time: "00:00" };

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

  function getDefaultEndTime(task: Task) {
    if (task.plannedEnd) {
      return getTimeParts(task.plannedEnd);
    }

    const startIso = task.plannedStart ?? task.plannedFor;
    if (!startIso) {
      return { date: "", time: "00:30" };
    }

    const start = new Date(startIso);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, "0");
    const dd = String(end.getDate()).padStart(2, "0");
    const hh = String(end.getHours()).padStart(2, "0");
    const min = String(end.getMinutes()).padStart(2, "0");

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
    ignoreNextSaveRef.current = true;
    const localTasks = loadTasks();

    try {
      const jwt = await getJwt();
      setAuthed(!!jwt);

      if (!jwt) {
        serverMetaRef.current = EMPTY_RESOURCE_META;
        setTasks(localTasks);
        setLoading(false);
        return;
      }

      const { data, meta } = await fetchAuthedResource<Task[]>(
        "/.netlify/functions/tasks",
        jwt,
      );
      const remoteTasks = Array.isArray(data) ? data : [];
      serverMetaRef.current = meta;

      const shouldKeepLocalBackup =
        localTasks.length > 0 &&
        remoteTasks.length === 0 &&
        (meta.revision ?? 0) === 0;

      if (shouldKeepLocalBackup) {
        setTasks(localTasks);
        setLoadError(
          "Remote tasks were empty, so the local backup is being kept.",
        );
        setLoading(false);
        return;
      }

      setTasks(remoteTasks);
      setLoading(false);
    } catch (e: any) {
      if (localTasks.length > 0) {
        setTasks(localTasks);
        setLoadError(
          `${e?.message ?? "Tasks failed to load"} Showing local backup.`,
        );
      } else {
        setLoadError(e?.message ?? "Tasks failed to load");
      }
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
    if (typeof window === "undefined") return;

    try {
      saveTasks(tasks);
    } catch {
      // Keep in-memory state if local storage is unavailable.
    }
  }, [tasks]);

  useEffect(() => {
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      hydratedRef.current = true;
      return;
    }

    // debounce
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const jwt = await getJwt();

        if (!jwt) return;

        const { meta } = await saveAuthedResource(
          "/.netlify/functions/tasks",
          jwt,
          tasks,
          serverMetaRef.current,
        );

        serverMetaRef.current = meta;
      } catch (error) {
        if (error instanceof ResourceApiError && error.status === 409) {
          setLoadError(
            "Tasks changed in another tab or device. Reloaded the latest version.",
          );
          void reloadTasks();
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "Tasks failed to save",
        );
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [tasks, reloadTasks]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleTaskUpdated(event: Event) {
      const customEvent = event as CustomEvent<{
        taskId: string;
        patch: {
          title?: string;
          dueDate?: string;
          plannedFor?: string;
          plannedStart?: string;
          plannedEnd?: string;
        };
      }>;

      const taskId = customEvent.detail?.taskId;
      const patch = customEvent.detail?.patch;

      if (!taskId || !patch) return;

      const nextUpdatedAt = new Date().toISOString();

      if (authed) {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === taskId
              ? { ...task, ...patch, updatedAt: nextUpdatedAt }
              : task,
          ),
        );
        return;
      }

      const updated = updateTask(taskId, {
        ...patch,
        updatedAt: nextUpdatedAt,
      });

      if (!updated) return;

      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? updated : task)),
      );
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
  }, [authed]);

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

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    applyTaskPatch(
      task,
      {
        title: trimmed,
      },
      {
        broadcastUpdate: true,
      },
    );

    window.setTimeout(() => setJustAddedId(null), 300);
  }

  async function onAdd(forcedList?: string, extraPatch: Partial<Task> = {}) {
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
          ...extraPatch,
          list: taskList,
          tags: mode === "focus" ? ["focus"] : [],
        }
      : createTask({
          title: trimmed,
          ...basePatch,
          ...extraPatch,
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

    applyTaskPatch(
      task,
      {
        status: nextStatus,
      },
      {
        broadcastStatus: true,
      },
    );

    if (shouldPlayCompleteSound) {
      playTaskCompleteSound();
    }
  }

  function onSetStatus(task: Task, status: "todo" | "doing" | "done") {
    const shouldPlayCompleteSound = status === "done" && task.status !== "done";

    applyTaskPatch(
      task,
      {
        status,
      },
      {
        broadcastStatus: true,
      },
    );

    if (shouldPlayCompleteSound) {
      playTaskCompleteSound();
    }
  }

  function onSetDue(task: Task, dueDate: string) {
    const nextDue = dueDate || undefined;

    applyTaskPatch(
      task,
      {
        dueDate: nextDue,
      },
      {
        broadcastUpdate: true,
      },
    );
  }

  function onSetPriority(task: Task, p: Priority) {
    applyTaskPatch(task, { priority: p });
  }

  function onSetImportant(task: Task, important: boolean) {
    applyTaskPatch(task, { important });
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

  function broadcastTaskUpdated(
    taskId: string,
    patch: {
      title?: string;
      dueDate?: string;
      plannedFor?: string;
      plannedStart?: string;
      plannedEnd?: string;
    },
  ) {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("lifeos:task-updated", {
        detail: {
          taskId,
          patch,
        },
      }),
    );
  }

  function applyTaskPatch(
    task: Task,
    patch: Partial<Task>,
    options?: {
      broadcastStatus?: boolean;
      broadcastUpdate?: boolean;
    },
  ) {
    const nextUpdatedAt =
      typeof patch.updatedAt === "string"
        ? patch.updatedAt
        : new Date().toISOString();

    const nextTask = {
      ...task,
      ...patch,
      updatedAt: nextUpdatedAt,
    };

    if (authed) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? nextTask : t)));
    } else {
      const updated = updateTask(task.id, {
        ...patch,
        updatedAt: nextUpdatedAt,
      });
      if (!updated) return null;

      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    }

    if (options?.broadcastStatus && nextTask.status) {
      broadcastTaskStatus(
        task.id,
        nextTask.status as "todo" | "doing" | "done",
      );
    }

    if (options?.broadcastUpdate) {
      broadcastTaskUpdated(task.id, {
        title: nextTask.title,
        dueDate: nextTask.dueDate,
        plannedFor: nextTask.plannedFor,
        plannedStart: nextTask.plannedStart,
        plannedEnd: nextTask.plannedEnd,
      });
    }

    return nextTask;
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

  function toTimeValue(hour?: number, minute?: number) {
    const safeHour = typeof hour === "number" ? hour : 0;
    const safeMinute = typeof minute === "number" ? minute : 0;
    return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
  }

  function addMinutesToTimeString(time: string, minutesToAdd: number) {
    const [hours, minutes] = time.split(":").map(Number);
    const total = hours * 60 + minutes + minutesToAdd;
    const nextHours = Math.floor(total / 60) % 24;
    const nextMinutes = total % 60;
    return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
  }

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
        minute?: 0 | 15 | 30 | 45;
        endHour?: number;
        endMinute?: 0 | 15 | 30 | 45;
      }>;

      const taskId = customEvent.detail?.taskId;
      const date = customEvent.detail?.date;

      if (!taskId || !date) return;

      setTasks((prev) =>
        prev.map((task) => {
          if (task.id !== taskId) return task;

          const plannedMinute = customEvent.detail?.minute ?? 0;
          const startTime = toTimeValue(
            customEvent.detail?.hour,
            plannedMinute,
          );
          const nextPlannedStart = combineDateAndTime(date, startTime);

          const hasExplicitEnd =
            typeof customEvent.detail?.endHour === "number";

          let nextPlannedEnd: string | undefined;

          if (hasExplicitEnd) {
            const endTime = toTimeValue(
              customEvent.detail.endHour,
              customEvent.detail.endMinute ?? 0,
            );
            nextPlannedEnd = combineDateAndTime(date, endTime);
          } else if (task.plannedStart && task.plannedEnd && nextPlannedStart) {
            const previousStart = new Date(task.plannedStart);
            const previousEnd = new Date(task.plannedEnd);
            const nextStart = new Date(nextPlannedStart);

            const durationMs = Math.max(
              15 * 60 * 1000,
              previousEnd.getTime() - previousStart.getTime(),
            );

            nextPlannedEnd = new Date(
              nextStart.getTime() + durationMs,
            ).toISOString();
          } else if (nextPlannedStart) {
            nextPlannedEnd = new Date(
              new Date(nextPlannedStart).getTime() + 30 * 60 * 1000,
            ).toISOString();
          }

          const nextTask = {
            ...task,
            dueDate: date,
            plannedFor: nextPlannedStart ?? date,
            plannedStart: nextPlannedStart,
            plannedEnd: nextPlannedEnd,
            list: "planner",
            status: "doing" as const,
            updatedAt: new Date().toISOString(),
          };

          if (!authed) {
            updateTask(task.id, {
              dueDate: nextTask.dueDate,
              plannedFor: nextTask.plannedFor,
              plannedStart: nextTask.plannedStart,
              plannedEnd: nextTask.plannedEnd,
              list: nextTask.list,
              status: nextTask.status,
            });
          }

          broadcastTaskStatus(task.id, nextTask.status);
          broadcastTaskUpdated(task.id, {
            title: nextTask.title,
            dueDate: nextTask.dueDate,
            plannedFor: nextTask.plannedFor,
            plannedStart: nextTask.plannedStart,
            plannedEnd: nextTask.plannedEnd,
          });

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

    function handleOutsideClick(event: PointerEvent) {
      const target = event.target as Node;

      if (focusFilterWrapRef.current?.contains(target)) return;
      if (focusFilterMenuRef.current?.contains(target)) return;

      setShowFocusFilter(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowFocusFilter(false);
      }
    }

    function handleViewportChange() {
      setShowFocusFilter(false);
    }

    function handleDropdownOpened(event: Event) {
      const customEvent = event as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id === TASKS_FILTER_DROPDOWN_ID) return;

      setShowFocusFilter(false);
    }

    document.addEventListener("pointerdown", handleOutsideClick, true);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener(
      "lifeos:dropdown-opened",
      handleDropdownOpened as EventListener,
    );

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick, true);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener(
        "lifeos:dropdown-opened",
        handleDropdownOpened as EventListener,
      );
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleOpenTaskEditor(event: Event) {
      const customEvent = event as CustomEvent<{ taskId: string }>;
      const taskId = customEvent.detail?.taskId;
      if (!taskId) return;

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      startEditingTask(task);
    }

    window.addEventListener(
      "lifeos:open-task-editor",
      handleOpenTaskEditor as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:open-task-editor",
        handleOpenTaskEditor as EventListener,
      );
    };
  }, [tasks, startEditingTask]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleOpenTaskEditor(event: Event) {
      const customEvent = event as CustomEvent<{ taskId: string }>;
      const taskId = customEvent.detail?.taskId;
      if (!taskId) return;

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      startEditingTask(task);
    }

    window.addEventListener(
      "lifeos:open-task-editor",
      handleOpenTaskEditor as EventListener,
    );

    return () => {
      window.removeEventListener(
        "lifeos:open-task-editor",
        handleOpenTaskEditor as EventListener,
      );
    };
  }, [tasks, startEditingTask]);

  const editingTask =
    editingTaskId && editorDraft
      ? (tasks.find((task) => task.id === editingTaskId) ?? null)
      : null;

  useEffect(() => {
    if (!editingTask || !editorDraft) return;

    const patch = buildEditorTaskPatch(editorDraft);
    const hasChanges =
      editingTask.title !== patch.title ||
      (editingTask.notes ?? "") !== (patch.notes ?? "") ||
      (editingTask.dueDate ?? "") !== (patch.dueDate ?? "") ||
      (editingTask.plannedFor ?? "") !== (patch.plannedFor ?? "") ||
      (editingTask.plannedStart ?? "") !== (patch.plannedStart ?? "") ||
      (editingTask.plannedEnd ?? "") !== (patch.plannedEnd ?? "");

    if (!hasChanges) return;

    applyTaskPatch(editingTask, patch, {
      broadcastUpdate: true,
    });
  }, [editingTask, editorDraft, buildEditorTaskPatch]);

  const activeFocusFilterCount =
    (hideCompleted ? 1 : 0) +
    (focusFilter === "today" ? 1 : 0) +
    (focusFilter === "overdue" ? 1 : 0);

  return (
    <div ref={pageRef} className="lo-tasks">
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
          {editingTask && editorDraft ? (
            <FocusTaskEditorView
              task={editingTask}
              editorDraft={editorDraft}
              setEditorDraft={setEditorDraft}
              onCancel={cancelEditingTask}
              onDelete={() => {
                onRemove(editingTask);
                cancelEditingTask();
              }}
              onRemoveFromCalendar={() => removeTaskFromCalendar(editingTask)}
            />
          ) : (
            <>
              <div className="lo-window-filter-wrap">
                <div ref={focusFilterWrapRef} className="lo-filter-dropdown">
                  <button
                    type="button"
                    className={`lo-dropdown-trigger lo-window-filter--button ${showFocusFilter ? "is-open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();

                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();

                      const menuWidth = 200;
                      const viewportPadding = 10;

                      const nextLeft = Math.min(
                        Math.max(viewportPadding, rect.right - menuWidth),
                        window.innerWidth - menuWidth - viewportPadding,
                      );

                      const nextTop = Math.min(
                        rect.bottom + 6,
                        window.innerHeight - 220,
                      );

                      setFilterMenuPos({
                        top: nextTop,
                        left: nextLeft,
                      });

                      const nextOpen = !showFocusFilter;

                      if (nextOpen) {
                        window.dispatchEvent(
                          new CustomEvent("lifeos:dropdown-opened", {
                            detail: { id: TASKS_FILTER_DROPDOWN_ID },
                          }),
                        );
                      }

                      setShowFocusFilter(nextOpen);
                    }}
                    aria-label="Filter"
                    aria-expanded={showFocusFilter}
                  >
                    <span className="lo-window-filter__label">
                      Filter
                      {activeFocusFilterCount > 0 ? (
                        <span className="lo-window-filter__count">
                          {activeFocusFilterCount}
                        </span>
                      ) : null}
                    </span>
                    <span className="lo-dropdown-caret" aria-hidden="true">
                      {"\u25BE"}
                    </span>
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
              />
            </>
          )}
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
          onSetImportant={onSetImportant}
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

  function isFocusReorderDrag(event: React.DragEvent) {
    return Array.from(event.dataTransfer.types).includes(
      "application/x-lifeos-focus-reorder",
    );
  }

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

      <div className="lo-focus-scroller">
        <section
        className="lo-stack"
        onDragOver={(e) => {
          if (!isFocusReorderDrag(e)) return;
          e.preventDefault();
          if (!draggingTaskId) return;
          setDropTargetId("__doing-end__");
        }}
        onDrop={(e) => {
          if (!isFocusReorderDrag(e)) return;
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
              if (!isFocusReorderDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              if (!draggingTaskId || draggingTaskId === task.id) return;
              setDropTargetId(task.id);
            }}
            onDrop={(e) => {
              if (!isFocusReorderDrag(e)) return;
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

                  {inlineEditId === task.id ? (
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
          if (!isFocusReorderDrag(e)) return;
          e.preventDefault();
          if (!draggingTaskId) return;
          setDropTargetId("__todo-end__");
        }}
        onDrop={(e) => {
          if (!isFocusReorderDrag(e)) return;
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
              if (!isFocusReorderDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              if (!draggingTaskId || draggingTaskId === task.id) return;
              setDropTargetId(task.id);
            }}
            onDrop={(e) => {
              if (!isFocusReorderDrag(e)) return;
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
                  {inlineEditId === task.id ? (
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
      </div>
    </>
  );
}

function FocusTaskEditorView({
  task,
  editorDraft,
  setEditorDraft,
  onCancel,
  onDelete,
  onRemoveFromCalendar,
}: {
  task: Task;
  editorDraft: {
    title: string;
    notes: string;
    dueDate: string;
    dueDateDisplay: string;
    startTime: string;
    endTime: string;
  };
  setEditorDraft: React.Dispatch<
    React.SetStateAction<{
      title: string;
      notes: string;
      dueDate: string;
      dueDateDisplay: string;
      startTime: string;
      endTime: string;
    } | null>
  >;
  onCancel: () => void;
  onDelete: () => void;
  onRemoveFromCalendar: () => void;
}) {
  const isScheduled =
    !!task.plannedFor || !!task.plannedStart || !!task.plannedEnd;

  return (
    <section className="lo-task-edit-panel">
      <button
        type="button"
        className="lo-task-edit-panel__back"
        onClick={onCancel}
      >
        {"< Back"}
      </button>

      <div className="lo-task-edit-panel__body">
        <label className="lo-task-edit-panel__field">
          <span>Task title</span>
          <textarea
            className="lo-task-edit-title"
            value={editorDraft.title}
            rows={3}
            onChange={(e) =>
              setEditorDraft((prev) =>
                prev ? { ...prev, title: e.target.value } : prev,
              )
            }
            placeholder="Task title"
            autoFocus
          />
        </label>

        <label className="lo-task-edit-panel__field lo-task-edit-panel__field--notes">
          <span>Description</span>
          <textarea
            className="lo-task-editor-textarea"
            value={editorDraft.notes}
            rows={4}
            onChange={(e) =>
              setEditorDraft((prev) =>
                prev ? { ...prev, notes: e.target.value } : prev,
              )
            }
            placeholder="Task description"
          />
        </label>

        <div className="lo-task-edit-rows">
          <label className="lo-task-edit-row">
            <span className="lo-task-edit-row__label">Date</span>
            <input
              type="text"
              className="lo-task-edit-row__input lo-task-edit-row__input--date"
              value={editorDraft.dueDateDisplay}
              onChange={(e) => {
                const nextDisplay = e.target.value;
                const nextIso = parseEditorDate(nextDisplay);

                setEditorDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        dueDateDisplay: nextDisplay,
                        dueDate: nextIso || prev.dueDate,
                      }
                    : prev,
                );
              }}
              placeholder="dd/mm/yyyy"
              inputMode="numeric"
            />
          </label>

          <div className="lo-task-edit-row lo-task-edit-row--time">
            <span className="lo-task-edit-row__label">Time</span>

            <input
              type="time"
              className="lo-task-edit-row__input"
              value={editorDraft.startTime}
              onChange={(e) =>
                setEditorDraft((prev) =>
                  prev
                    ? { ...prev, startTime: e.target.value || "00:00" }
                    : prev,
                )
              }
            />

            <span className="lo-task-edit-row__arrow">→</span>

            <input
              type="time"
              className="lo-task-edit-row__input"
              value={editorDraft.endTime}
              onChange={(e) =>
                setEditorDraft((prev) =>
                  prev ? { ...prev, endTime: e.target.value || "00:30" } : prev,
                )
              }
            />
          </div>
        </div>
      </div>

      <div className="lo-task-editor-actions">
        {isScheduled ? (
          <button
            type="button"
            className="lo-task-editor-btn"
            onClick={onRemoveFromCalendar}
          >
            <img
              src="/icons/white/calendar-xmark.png"
              alt=""
              aria-hidden="true"
            />
            Remove from calendar
          </button>
        ) : null}
        <button
          type="button"
          className="lo-task-editor-btn is-danger"
          onClick={onDelete}
        >
          <img
            src="/icons/white/trash-xmark.png"
            alt=""
            aria-hidden="true"
          />
          Delete task
        </button>
      </div>
    </section>
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

type PlanListId = "my-day" | "important" | "planned" | "assigned" | "tasks" | string;

const PLAN_SIDEBAR_ICONS: Record<string, string> = {
  "my-day": "/icons/white/day.png",
  important: "/icons/white/star.png",
  planned: "/icons/white/calendar.png",
  assigned: "/icons/white/me.png",
  tasks: "/icons/white/home.png",
};

const CUSTOM_LIST_ICON = "/icons/white/list.png";

function labelForList(list: PlanListId) {
  if (list === "my-day") return "My Day";
  if (list === "important") return "Important";
  if (list === "planned") return "Planned";
  if (list === "assigned") return "Assigned to me";
  if (list === "tasks") return "Tasks";
  if (list === "work") return "Work";
  if (list === "personal") return "Personal";
  if (list === "home") return "Home";
  return list
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  onSetImportant,
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
  onAdd: (forcedList?: string, extraPatch?: Partial<Task>) => void;
  tasks: Task[];
  justAddedId: string | null;
  onToggleDone: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSetDue: (task: Task, dueDate: string) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onSetImportant: (task: Task, important: boolean) => void;
  onOpenTaskMenu: (e: React.MouseEvent, task: Task) => void;
}) {
  const [selectedList, setSelectedList] = React.useState<PlanListId>("tasks");
  const [listDraft, setListDraft] = React.useState("");
  const [sessionLists, setSessionLists] = React.useState<string[]>([]);
  const [isCreatingList, setIsCreatingList] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const listDraftRef = React.useRef<HTMLInputElement | null>(null);
  const newListWrapRef = React.useRef<HTMLDivElement | null>(null);

  const todayISO = isoDate(new Date());
  const customLists = React.useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...sessionLists,
            ...tasks.map((task) => task.list ?? "tasks"),
          ].filter(
            (list) =>
              !["inbox", "tasks", "focus"].includes(list) &&
              !["my-day", "important", "planned", "assigned"].includes(list),
          ),
        ),
      ).sort((a, b) => labelForList(a).localeCompare(labelForList(b))),
    [sessionLists, tasks],
  );

  React.useEffect(() => {
    if (!isCreatingList) return;
    listDraftRef.current?.focus();
  }, [isCreatingList]);

  React.useEffect(() => {
    if (!isCreatingList) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (newListWrapRef.current?.contains(target)) return;
      cancelCustomListDraft();
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isCreatingList]);

  const visibleTasks = tasks.filter((t) => {
    if (selectedList === "tasks") {
      return (t.list ?? "tasks") === "tasks" || (t.list ?? "inbox") === "inbox";
    }

    if (selectedList === "my-day") {
      return getTaskDateKey(t) === todayISO && t.status !== "done";
    }

    if (selectedList === "important") return !!t.important;
    if (selectedList === "planned") return !!getTaskDateKey(t);
    if (selectedList === "assigned") return false;

    return t.list === selectedList;
  });
  const canAddToSelectedList = canAdd && selectedList !== "assigned";

  function addCurrentTask() {
    if (selectedList === "assigned") return;

    const forcedList =
      selectedList === "my-day" ||
      selectedList === "important" ||
      selectedList === "planned"
        ? "tasks"
        : selectedList;
    const extraPatch: Partial<Task> = {};

    if (selectedList === "my-day") {
      extraPatch.dueDate = todayISO;
      extraPatch.plannedFor = todayISO;
    }

    if (selectedList === "important") {
      extraPatch.important = true;
    }

    onAdd(forcedList, extraPatch);
  }

  function addCustomList() {
    const trimmed = listDraft.trim();
    if (!trimmed) return;

    const id = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!id) return;

    setSessionLists((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelectedList(id);
    setListDraft("");
    setIsCreatingList(false);
  }

  function startCustomListDraft() {
    setListDraft("");
    setIsCreatingList(true);
    setSidebarCollapsed(false);
  }

  function cancelCustomListDraft() {
    setListDraft("");
    setIsCreatingList(false);
  }

  function renderSidebarButton(list: PlanListId) {
    const icon = PLAN_SIDEBAR_ICONS[list];

    return (
      <button
        type="button"
        className={selectedList === list ? "is-active" : ""}
        onClick={() => setSelectedList(list)}
        title={labelForList(list)}
        aria-label={labelForList(list)}
      >
        {icon ? (
          <img className="lo-plan-tasks-sidebar__icon" src={icon} alt="" />
        ) : null}
        <span className="lo-plan-tasks-sidebar__text">
          {labelForList(list)}
        </span>
      </button>
    );
  }

  function getListIcon(list: PlanListId) {
    return PLAN_SIDEBAR_ICONS[list] ?? CUSTOM_LIST_ICON;
  }

  return (
    <div
      className={`lo-plan-tasks-layout ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
    >
      <Card className="lo-plan-tasks-sidebar">
        <button
          type="button"
          className="lo-plan-tasks-sidebar__toggle"
          onClick={() => setSidebarCollapsed((value) => !value)}
          aria-label={sidebarCollapsed ? "Expand task sidebar" : "Collapse task sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <img src="/icons/white/menu-burger.png" alt="" />
        </button>

        {renderSidebarButton("my-day")}
        {renderSidebarButton("important")}
        {renderSidebarButton("planned")}
        {renderSidebarButton("assigned")}
        {renderSidebarButton("tasks")}

        <div className="lo-plan-tasks-sidebar__divider" />

        <div className="lo-plan-tasks-sidebar__custom-list">
          {customLists.map((list) => (
            <button
              key={list}
              type="button"
              className={selectedList === list ? "is-active" : ""}
              onClick={() => setSelectedList(list)}
              title={labelForList(list)}
              aria-label={labelForList(list)}
            >
              <img
                className="lo-plan-tasks-sidebar__icon"
                src={CUSTOM_LIST_ICON}
                alt=""
              />
              <span className="lo-plan-tasks-sidebar__text">
                {labelForList(list)}
              </span>
            </button>
          ))}
        </div>

        {isCreatingList ? (
          <div className="lo-plan-tasks-new-list" ref={newListWrapRef}>
            <input
              ref={listDraftRef}
              type="text"
              value={listDraft}
              onChange={(e) => setListDraft(e.target.value)}
              placeholder="New list"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCustomList();
                if (e.key === "Escape") cancelCustomListDraft();
              }}
              aria-label="New list name"
            />
          </div>
        ) : (
          <button
            type="button"
            className="lo-plan-tasks-new-list-button"
            onClick={startCustomListDraft}
          >
            <span className="lo-plan-tasks-sidebar__text">+ New List</span>
          </button>
        )}
      </Card>

      <div className="lo-plan-tasks-main lo-stack">
        <Card className="toolbar-card">
          <div className="lo-toolbar">
            <div className="lo-plan-tasks-heading">
              <img src={getListIcon(selectedList)} alt="" />
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
                if (e.key === "Enter" && canAddToSelectedList) {
                  addCurrentTask();
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
              <Button onClick={addCurrentTask} disabled={!canAddToSelectedList}>
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
          onSetImportant={onSetImportant}
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
  onSetImportant,
  onOpenTaskMenu,
}: {
  title: string;
  tasks: Task[];
  justAddedId: string | null;
  onToggleDone: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSetDue: (task: Task, dueDate: string) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onSetImportant: (task: Task, important: boolean) => void;
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
                  className={`lo-task-important ${task.important ? "is-active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetImportant(task, !task.important);
                  }}
                  aria-label={
                    task.important ? "Remove from Important" : "Mark important"
                  }
                  title={
                    task.important ? "Remove from Important" : "Mark important"
                  }
                >
                  {task.important ? "★" : "☆"}
                </button>

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
