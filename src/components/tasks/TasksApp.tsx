import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Task, TaskRepeatRule } from "../../types/task";
import {
  createTask,
  deleteTask,
  loadTasks,
  saveTasks,
  taskBackupKey,
  taskStorageKey,
  updateTask,
} from "../../lib/tasksStore";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { getCurrentUserId, getJwt, onAuthChange } from "../../lib/identity";
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

  const dateKey = getTaskDateKey(task);
  if (!dateKey) return false;

  const today = isoDate(startOfToday());

  return dateKey < today;
}

function repeatLabel(rule?: TaskRepeatRule) {
  return rule ? REPEAT_RULE_LABELS[rule] : "";
}

function addMonthsClamped(date: Date, amount: number) {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(originalDay, lastDay));
  return next;
}

function nextRepeatDateKey(task: Task) {
  if (!task.repeatRule) return "";

  const baseKey = getTaskDateKey(task) ?? isoDate(startOfToday());
  let next = new Date(`${baseKey}T00:00:00`);
  if (Number.isNaN(next.getTime())) next = startOfToday();

  const today = startOfToday();
  const advance = () => {
    switch (task.repeatRule) {
      case "daily":
      case "custom":
        next.setDate(next.getDate() + 1);
        break;
      case "weekdays":
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() === 0 || next.getDay() === 6);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next = addMonthsClamped(next, 1);
        break;
      case "yearly":
        next = addMonthsClamped(next, 12);
        break;
      default:
        next.setDate(next.getDate() + 1);
    }
  };

  advance();
  while (next < today) advance();

  return isoDate(next);
}

function getCreatedDateKey(task: Task) {
  if (!task.createdAt) return null;
  return isoDate(new Date(task.createdAt));
}

function getMyDayDateKey(task: Task) {
  if (task.myDay === "") return null;
  if (task.myDay) return String(task.myDay).slice(0, 10);
  return getCreatedDateKey(task);
}

function isTaskInMyDay(task: Task, todayISO: string) {
  return getMyDayDateKey(task) === todayISO;
}

type TasksMode = "focus" | "plan";
type FocusFilter = "all" | "today" | "overdue";
type StatusFilter = "all" | "inprogress" | "completed";
const TASKS_FILTER_DROPDOWN_ID = "tasks-filter";
const TASK_REMINDER_FIRED_KEY = "lifeos_task_reminders_fired_v1";

type ReminderAlert = {
  key: string;
  taskId: string;
  title: string;
  reminderAt: string;
  listLabel: string;
};

const REPEAT_RULE_LABELS: Record<TaskRepeatRule, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};

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

function detectDueDateFromTaskText(value: string) {
  const normalized = value.toLowerCase();
  if (/\b(tomorrow|tmrw)\b/.test(normalized)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isoDate(tomorrow);
  }

  const weekdayAliases: Array<[RegExp, number]> = [
    [/\b(mon|monday)\b/, 1],
    [/\b(tue|tues|tuesday)\b/, 2],
    [/\b(wed|weds|wednesday)\b/, 3],
    [/\b(thu|thur|thurs|thursday)\b/, 4],
    [/\b(fri|friday)\b/, 5],
    [/\b(sat|saturday)\b/, 6],
    [/\b(sun|sunday)\b/, 0],
  ];

  const match = weekdayAliases.find(([pattern]) => pattern.test(normalized));
  if (!match) return "";

  const today = new Date();
  const targetDay = match[1];
  const daysUntilTarget = (targetDay - today.getDay() + 7) % 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  return isoDate(targetDate);
}

function reminderAlertKey(task: Task) {
  return `${task.id}:${task.reminderAt ?? ""}`;
}

function readFiredReminderKeys() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(TASK_REMINDER_FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

function writeFiredReminderKeys(keys: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TASK_REMINDER_FIRED_KEY,
    JSON.stringify([...keys].slice(-500)),
  );
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
  const [dueDate, setDueDate] = useState<string>("");
  const [priority, setPriority] = useState<Priority>(3); // low

  // ✅ for “new task” animation
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const [authed, setAuthed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const ignoreNextSaveRef = useRef(false);
  const serverMetaRef = useRef<ResourceMeta>(EMPTY_RESOURCE_META);

  // ✅ error handling for load
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reminderAlerts, setReminderAlerts] = useState<ReminderAlert[]>([]);
  const reminderStartedAtRef = useRef(Date.now());
  const reminderFiredRef = useRef<Set<string>>(new Set());
  const reminderStorageLoadedRef = useRef(false);

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
    const today = isoDate(new Date());

    const copy: Task = {
      ...task,
      id: crypto.randomUUID(),
      title: `${task.title} copy`,
      status: task.status === "done" ? "todo" : task.status,
      myDay: today,
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
    const userId = await getCurrentUserId();
    const localTasks = loadTasks(taskStorageKey(userId), taskBackupKey(userId));

    try {
      const jwt = await getJwt();
      setAuthed(!!jwt);
      setCurrentUserId(jwt ? userId : null);

      if (!jwt) {
        serverMetaRef.current = EMPTY_RESOURCE_META;
        setTasks(loadTasks());
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
      saveTasks(
        tasks,
        taskStorageKey(currentUserId),
        taskBackupKey(currentUserId),
      );
    } catch {
      // Keep in-memory state if local storage is unavailable.
    }
  }, [currentUserId, tasks]);

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
    const today = isoDate(new Date());
    return {
      id: crypto.randomUUID(),
      title,
      status: "todo",
      priority,
      dueDate: due,
      myDay: today,
      sortOrder: tasks.length
        ? Math.max(...tasks.map((t) => t.sortOrder ?? 0)) + 1
        : 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  function onCreateDraftTask() {
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
          focus: true,
          list: "focus",
          tags: ["focus"],
          sortOrder: nextSortOrder,
          createdAt: now,
          updatedAt: now,
        }
        : createTask({
          title: "",
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

    const today = isoDate(new Date());

    const basePatch =
      mode === "focus"
        ? {
            myDay: today,
            priority: priority ?? 3,
            status: "todo" as const,
            focus: true,
          }
        : {
            myDay: today,
            priority: priority ?? 3,
            status: "todo" as const,
          };

    const taskList = mode === "plan" ? (forcedList ?? "tasks") : "focus";

    const newTask = authed
      ? {
          ...makeTask(trimmed, undefined, priority ?? 3),
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
    setDueDate("");
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

    if (shouldPlayCompleteSound && task.repeatRule) {
      rescheduleRepeatingTask(task);
      playTaskCompleteSound();
      return;
    }

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

    if (shouldPlayCompleteSound && task.repeatRule) {
      rescheduleRepeatingTask(task);
      playTaskCompleteSound();
      return;
    }

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

  function rescheduleRepeatingTask(task: Task) {
    const nextDueDate = nextRepeatDateKey(task);
    if (!nextDueDate) return;

    applyTaskPatch(
      task,
      {
        status: "todo",
        dueDate: nextDueDate,
        plannedFor: undefined,
        plannedStart: undefined,
        plannedEnd: undefined,
      },
      {
        broadcastUpdate: true,
      },
    );
  }

  function dismissReminderAlert(key: string) {
    setReminderAlerts((prev) => prev.filter((alert) => alert.key !== key));
  }

  function completeReminderAlert(alert: ReminderAlert) {
    const task = tasks.find((item) => item.id === alert.taskId);
    if (task) {
      onSetStatus(task, "done");
    }

    dismissReminderAlert(alert.key);
  }

  function snoozeReminderAlert(alert: ReminderAlert) {
    const task = tasks.find((item) => item.id === alert.taskId);
    if (!task) {
      dismissReminderAlert(alert.key);
      return;
    }

    const snoozedReminderAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    applyTaskPatch(task, {
      reminderAt: snoozedReminderAt,
    });
    dismissReminderAlert(alert.key);
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

  function onSetTaskSchedule(
    task: Task,
    patch: Partial<
      Pick<
        Task,
        "dueDate" | "plannedFor" | "plannedStart" | "plannedEnd" | "myDay"
      >
    >,
  ) {
    const updatesCalendarFields =
      "dueDate" in patch ||
      "plannedFor" in patch ||
      "plannedStart" in patch ||
      "plannedEnd" in patch;

    applyTaskPatch(task, patch, {
      broadcastUpdate: updatesCalendarFields,
    });
  }

  function onSetPriority(task: Task, p: Priority) {
    applyTaskPatch(task, { priority: p });
  }

  function onSetImportant(task: Task, important: boolean) {
    applyTaskPatch(task, { important });
  }

  function onMoveTaskToList(
    task: Task,
    list: string,
    extraPatch: Partial<Task> = {},
  ) {
    applyTaskPatch(
      task,
      { ...extraPatch, list },
      {
        broadcastUpdate:
          "dueDate" in extraPatch ||
          "plannedFor" in extraPatch ||
          "plannedStart" in extraPatch ||
          "plannedEnd" in extraPatch,
      },
    );
  }

  function onCopyTaskToList(task: Task, list: string) {
    const now = new Date().toISOString();
    const today = isoDate(new Date());
    const copy: Task = {
      ...task,
      id: crypto.randomUUID(),
      list,
      myDay: today,
      sortOrder: tasks.length
        ? Math.max(...tasks.map((t) => t.sortOrder ?? 0)) + 1
        : 1,
      createdAt: now,
      updatedAt: now,
    };

    setTasks((prev) => [copy, ...prev]);
    setJustAddedId(copy.id);
    window.setTimeout(() => setJustAddedId(null), 1600);
  }

  function onDuplicateTaskList(sourceList: string, newList: string) {
    const now = new Date().toISOString();
    const today = isoDate(new Date());
    const sourceTasks = tasks.filter((task) => task.list === sourceList);
    if (sourceTasks.length === 0) return;

    const highestSortOrder = tasks.length
      ? Math.max(...tasks.map((task) => task.sortOrder ?? 0))
      : 0;

    const copies = sourceTasks.map((task, index): Task => ({
      ...task,
      id: crypto.randomUUID(),
      list: newList,
      myDay: today,
      sortOrder: highestSortOrder + index + 1,
      createdAt: now,
      updatedAt: now,
    }));

    setTasks((prev) => [...copies, ...prev]);
    setJustAddedId(copies[0]?.id ?? null);
    window.setTimeout(() => setJustAddedId(null), 1600);
  }

  function onDeleteTaskList(list: string) {
    if (!authed) {
      tasks
        .filter((task) => task.list === list)
        .forEach((task) => deleteTask(task.id));
    }

    setTasks((prev) => prev.filter((task) => task.list !== list));
  }

  function onRenameTaskList(oldList: string, newList: string) {
    const now = new Date().toISOString();

    if (!authed) {
      tasks
        .filter((task) => task.list === oldList)
        .forEach((task) => {
          updateTask(task.id, {
            list: newList,
            updatedAt: now,
          });
        });
    }

    setTasks((prev) =>
      prev.map((task) =>
        task.list === oldList
          ? {
              ...task,
              list: newList,
              updatedAt: now,
            }
          : task,
      ),
    );
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
      const today = isoDate(new Date());

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
            myDay: today,
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
            myDay: today,
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!reminderStorageLoadedRef.current) {
      reminderFiredRef.current = readFiredReminderKeys();
      reminderStorageLoadedRef.current = true;
    }

    function scanReminders() {
      const now = Date.now();
      const nextAlerts: ReminderAlert[] = [];
      let firedChanged = false;

      for (const task of tasks) {
        if (!task.reminderAt || task.status === "done") continue;

        const reminderTime = new Date(task.reminderAt).getTime();
        if (Number.isNaN(reminderTime) || reminderTime > now) continue;

        const key = reminderAlertKey(task);
        if (reminderFiredRef.current.has(key)) continue;

        reminderFiredRef.current.add(key);
        firedChanged = true;

        const reminderWasMissedBeforeOpen =
          reminderTime < reminderStartedAtRef.current - 30_000;
        if (reminderWasMissedBeforeOpen) continue;

        nextAlerts.push({
          key,
          taskId: task.id,
          title: task.title,
          reminderAt: task.reminderAt,
          listLabel: labelForTaskList(task),
        });
      }

      if (firedChanged) {
        writeFiredReminderKeys(reminderFiredRef.current);
      }

      if (!nextAlerts.length) return;

      setReminderAlerts((prev) => {
        const existingKeys = new Set(prev.map((alert) => alert.key));
        const merged = [
          ...prev,
          ...nextAlerts.filter((alert) => !existingKeys.has(alert.key)),
        ];

        return merged.slice(-4);
      });
    }

    scanReminders();
    const interval = window.setInterval(scanReminders, 15_000);

    return () => window.clearInterval(interval);
  }, [tasks]);

  useEffect(() => {
    setReminderAlerts((prev) =>
      prev.filter((alert) =>
        tasks.some(
          (task) =>
            task.id === alert.taskId &&
            task.status !== "done" &&
            task.reminderAt === alert.reminderAt,
        ),
      ),
    );
  }, [tasks]);

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
      <ReminderPopupStack
        alerts={reminderAlerts}
        onDismiss={dismissReminderAlert}
        onSnooze={snoozeReminderAlert}
        onComplete={completeReminderAlert}
      />

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
          onSetTaskSchedule={onSetTaskSchedule}
          onSetPriority={onSetPriority}
          onSetImportant={onSetImportant}
          onSetStatus={onSetStatus}
          onUpdateTask={(task, patch) => {
            applyTaskPatch(task, patch, {
              broadcastUpdate:
                "title" in patch ||
                "dueDate" in patch ||
                "plannedFor" in patch ||
                "plannedStart" in patch ||
                "plannedEnd" in patch,
            });
          }}
          onMoveTaskToList={onMoveTaskToList}
          onCopyTaskToList={onCopyTaskToList}
          onDuplicateTaskList={onDuplicateTaskList}
          onDeleteTaskList={onDeleteTaskList}
          onRenameTaskList={onRenameTaskList}
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
const COMPLETE_ICON = "/icons/white/circle.png";
const DELETE_ICON = "/icons/white/trash-xmark.png";
const REMOVE_DUE_ICON = "/icons/white/calendar-xmark.png";
const MOVE_UP_ICON = "/icons/white/menu-burger.png";
const PRINT_LIST_ICON = "/icons/white/notes.png";
const SUGGESTIONS_ICON = "/icons/white/bulb.png";
const SORT_ICON = "/icons/white/sort-alt.png";

type BoardSortMode = "importance" | "due-date" | "alphabetical" | "creation-date";

const BOARD_SORT_OPTIONS: Array<{
  mode: BoardSortMode;
  label: string;
  icon: string;
}> = [
  { mode: "importance", label: "Importance", icon: PLAN_SIDEBAR_ICONS.important },
  { mode: "due-date", label: "Due date", icon: PLAN_SIDEBAR_ICONS.planned },
  { mode: "alphabetical", label: "Alphabetically", icon: CUSTOM_LIST_ICON },
  { mode: "creation-date", label: "Creation date", icon: PLAN_SIDEBAR_ICONS.planned },
];

type BoardTaskMenuState = {
  task: Task;
  x: number;
  y: number;
};

type PlannedSectionId = "earlier" | "today" | "later";
type ComposerMenu = "due" | "reminder" | "repeat" | null;

type CustomListMenuState = {
  list: string;
  x: number;
  y: number;
};

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

function labelForTaskList(task: Task) {
  const list = task.list || "tasks";
  return labelForList(list === "inbox" ? "tasks" : list);
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
  onSetTaskSchedule,
  onSetPriority,
  onSetImportant,
  onSetStatus,
  onUpdateTask,
  onMoveTaskToList,
  onCopyTaskToList,
  onDuplicateTaskList,
  onDeleteTaskList,
  onRenameTaskList,
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
  onSetTaskSchedule: (
    task: Task,
    patch: Partial<
      Pick<
        Task,
        "dueDate" | "plannedFor" | "plannedStart" | "plannedEnd" | "myDay"
      >
    >,
  ) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onSetImportant: (task: Task, important: boolean) => void;
  onSetStatus: (task: Task, status: "todo" | "doing" | "done") => void;
  onUpdateTask: (task: Task, patch: Partial<Task>) => void;
  onMoveTaskToList: (
    task: Task,
    list: string,
    extraPatch?: Partial<Task>,
  ) => void;
  onCopyTaskToList: (task: Task, list: string) => void;
  onDuplicateTaskList: (sourceList: string, newList: string) => void;
  onDeleteTaskList: (list: string) => void;
  onRenameTaskList: (oldList: string, newList: string) => void;
}) {
  const [selectedList, setSelectedList] = React.useState<PlanListId>("my-day");
  const [listDraft, setListDraft] = React.useState("");
  const [sessionLists, setSessionLists] = React.useState<string[]>([]);
  const [editingListHeading, setEditingListHeading] = React.useState(false);
  const [listHeadingDraft, setListHeadingDraft] = React.useState("");
  const [isCreatingList, setIsCreatingList] = React.useState(false);
  const [myDayComposerOpen, setMyDayComposerOpen] = React.useState(false);
  const [myDayComposerClosing, setMyDayComposerClosing] = React.useState(false);
  const [composerMenu, setComposerMenu] = React.useState<ComposerMenu>(null);
  const [composerDatePickerOpen, setComposerDatePickerOpen] =
    React.useState(false);
  const [composerReminderAt, setComposerReminderAt] = React.useState("");
  const [composerRepeatRule, setComposerRepeatRule] =
    React.useState<TaskRepeatRule | "">("");
  const [composerAutoDueDate, setComposerAutoDueDate] = React.useState("");
  const [myDayCompletedOpen, setMyDayCompletedOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = React.useState(false);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = React.useState(false);
  const [sortMenuClosing, setSortMenuClosing] = React.useState(false);
  const [boardSortMode, setBoardSortMode] =
    React.useState<BoardSortMode | null>(null);
  const [boardSortDirection, setBoardSortDirection] = React.useState<
    "asc" | "desc"
  >("asc");
  const [plannedSectionsOpen, setPlannedSectionsOpen] = React.useState<
    Record<PlannedSectionId, boolean>
  >({
    earlier: true,
    today: true,
    later: true,
  });
  const [boardTaskMenu, setBoardTaskMenu] = React.useState<BoardTaskMenuState | null>(null);
  const [customListMenu, setCustomListMenu] = React.useState<CustomListMenuState | null>(null);
  const listDraftRef = React.useRef<HTMLInputElement | null>(null);
  const listHeadingInputRef = React.useRef<HTMLInputElement | null>(null);
  const newListWrapRef = React.useRef<HTMLDivElement | null>(null);
  const myDayComposerRef = React.useRef<HTMLDivElement | null>(null);
  const composerToolsRef = React.useRef<HTMLDivElement | null>(null);
  const myDayTitleRef = React.useRef<HTMLDivElement | null>(null);
  const boardTaskMenuRef = React.useRef<HTMLDivElement | null>(null);
  const customListMenuRef = React.useRef<HTMLDivElement | null>(null);
  const sortMenuRef = React.useRef<HTMLDivElement | null>(null);
  const myDayComposerCloseTimerRef = React.useRef<number | null>(null);
  const sortMenuCloseTimerRef = React.useRef<number | null>(null);

  const todayISO = isoDate(new Date());
  const composerTomorrow = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date;
  }, []);
  const composerNextWeek = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  }, []);
  const composerLaterTodayReminder = React.useMemo(() => nextWholeHour(), []);
  const composerTomorrowReminder = React.useMemo(() => atHourFromToday(1, 9), []);
  const composerNextWeekReminder = React.useMemo(() => atHourFromToday(7, 9), []);
  const yesterdayISO = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return isoDate(date);
  }, []);
  const recentSinceISO = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return isoDate(date);
  }, []);
  const discoveredCustomLists = React.useMemo(
    () =>
      Array.from(
        new Set(
          tasks
            .map((task) => task.list ?? "tasks")
            .filter(
              (list) =>
                !["inbox", "tasks", "focus"].includes(list) &&
                !["my-day", "important", "planned", "assigned"].includes(list),
            ),
        ),
      ).sort((a, b) => labelForList(a).localeCompare(labelForList(b))),
    [tasks],
  );
  const customLists = React.useMemo(
    () => [
      ...sessionLists,
      ...discoveredCustomLists.filter((list) => !sessionLists.includes(list)),
    ],
    [discoveredCustomLists, sessionLists],
  );
  const isCustomSelectedList = customLists.includes(selectedList);
  const usesCompactComposer = true;
  const showSuggestionsButton = selectedList === "my-day";
  const showSortButton =
    selectedList === "my-day" ||
    selectedList === "important" ||
    selectedList === "tasks" ||
    isCustomSelectedList;

  React.useEffect(() => {
    if (!editingListHeading) return;

    const input = listHeadingInputRef.current;
    if (!input) return;

    input.focus();
    input.select();
  }, [editingListHeading]);

  React.useEffect(() => {
    if (isCustomSelectedList) return;

    setEditingListHeading(false);
    setListHeadingDraft("");
  }, [isCustomSelectedList, selectedList]);

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

  React.useEffect(() => {
    if (!composerMenu) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (composerToolsRef.current?.contains(target)) return;
      setComposerMenu(null);
      setComposerDatePickerOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [composerMenu]);

  React.useEffect(() => {
    if (!myDayComposerOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (myDayComposerRef.current?.contains(target)) return;
      resetMyDayComposerPlaceholder();
      closeMyDayComposer();
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [myDayComposerOpen]);

  React.useEffect(() => {
    return () => {
      if (myDayComposerCloseTimerRef.current) {
        window.clearTimeout(myDayComposerCloseTimerRef.current);
      }
      if (sortMenuCloseTimerRef.current) {
        window.clearTimeout(sortMenuCloseTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!boardTaskMenu) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (boardTaskMenuRef.current?.contains(target)) return;
      setBoardTaskMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setBoardTaskMenu(null);
      }
    }

    function handleViewportChange() {
      setBoardTaskMenu(null);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [boardTaskMenu]);

  React.useEffect(() => {
    if (!customListMenu) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (customListMenuRef.current?.contains(target)) return;
      setCustomListMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCustomListMenu(null);
      }
    }

    function handleViewportChange() {
      setCustomListMenu(null);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [customListMenu]);

  React.useEffect(() => {
    if (!sortMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (sortMenuRef.current?.contains(target)) return;
      closeSortMenu();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSortMenu();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [sortMenuOpen]);

  React.useEffect(() => {
    const el = myDayTitleRef.current;
    if (!el || document.activeElement === el) return;
    if ((el.textContent ?? "") !== title) {
      el.textContent = title;
    }
  }, [title]);

  React.useEffect(() => {
    if (showSuggestionsButton) return;
    setSuggestionsOpen(false);
  }, [showSuggestionsButton]);

  React.useEffect(() => {
    if (showSortButton) return;
    closeSortMenu();
  }, [showSortButton]);

  function compareTasksBySortMode(a: Task, b: Task) {
    if (!boardSortMode) return 0;

    const importanceCompare = Number(!!b.important) - Number(!!a.important);
    let result = 0;

    if (boardSortMode === "importance" && importanceCompare !== 0) {
      result = importanceCompare;
    }

    if (result === 0 && boardSortMode === "due-date") {
      const aDate = getTaskDateKey(a) ?? "9999-12-31";
      const bDate = getTaskDateKey(b) ?? "9999-12-31";
      const dateCompare = aDate.localeCompare(bDate);
      if (dateCompare !== 0) result = dateCompare;
    }

    if (result === 0 && boardSortMode === "alphabetical") {
      const titleCompare = a.title.localeCompare(b.title, undefined, {
        sensitivity: "base",
      });
      if (titleCompare !== 0) result = titleCompare;
    }

    if (result === 0 && boardSortMode === "creation-date") {
      const createdCompare = b.createdAt.localeCompare(a.createdAt);
      if (createdCompare !== 0) result = createdCompare;
    }

    return boardSortDirection === "desc" ? result * -1 : result;
  }

  const activeSortOption =
    boardSortMode === null
      ? null
      : (BOARD_SORT_OPTIONS.find((option) => option.mode === boardSortMode) ??
        null);

  const visibleTasks = tasks
    .filter((t) => {
      if (selectedList === "tasks") {
        return (
          ((t.list ?? "tasks") === "tasks" || (t.list ?? "inbox") === "inbox") &&
          t.status !== "done"
        );
      }

      if (selectedList === "my-day") {
        return isTaskInMyDay(t, todayISO) && t.status !== "done";
      }

      if (selectedList === "important") {
        return !!t.important && t.status !== "done";
      }
      if (selectedList === "planned") {
        return !!getTaskDateKey(t) && t.status !== "done";
      }
      if (selectedList === "assigned") {
        return t.list === "assigned" && t.status !== "done";
      }

      if (isCustomSelectedList) {
        return t.list === selectedList && t.status !== "done";
      }

      return t.list === selectedList;
    })
    .sort(compareTasksBySortMode);
  const plannedTaskGroups = React.useMemo(
    () => ({
      earlier: visibleTasks.filter((task) => {
        const dateKey = getTaskDateKey(task);
        return !!dateKey && dateKey < todayISO;
      }),
      today: visibleTasks.filter((task) => getTaskDateKey(task) === todayISO),
      later: visibleTasks.filter((task) => {
        const dateKey = getTaskDateKey(task);
        return !!dateKey && dateKey > todayISO;
      }),
    }),
    [visibleTasks, todayISO],
  );
  const visiblePlannedGroups = (
    [
      { id: "earlier", title: "Earlier", tasks: plannedTaskGroups.earlier },
      { id: "today", title: "Today", tasks: plannedTaskGroups.today },
      { id: "later", title: "Later", tasks: plannedTaskGroups.later },
    ] as Array<{ id: PlannedSectionId; title: string; tasks: Task[] }>
  ).filter((group) => group.tasks.length > 0);
  const selectedTask = selectedTaskId
    ? (tasks.find((task) => task.id === selectedTaskId) ?? null)
    : null;
  const completedBoardTasks = tasks
    .filter((t) => {
      if (selectedList === "my-day") {
        return isTaskInMyDay(t, todayISO) && t.status === "done";
      }

      if (selectedList === "tasks") {
        return (
          ((t.list ?? "tasks") === "tasks" || (t.list ?? "inbox") === "inbox") &&
          t.status === "done"
        );
      }

      if (selectedList === "important") {
        return !!t.important && t.status === "done";
      }

      if (selectedList === "planned") {
        return !!getTaskDateKey(t) && t.status === "done";
      }

      if (selectedList === "assigned") {
        return t.list === "assigned" && t.status === "done";
      }

      if (isCustomSelectedList) {
        return t.list === selectedList && t.status === "done";
      }

      return false;
    })
    .sort(compareTasksBySortMode);
  const suggestionGroups = React.useMemo(() => {
    const openTasks = tasks.filter(
      (task) => task.status !== "done" && !isTaskInMyDay(task, todayISO),
    );
    const newestFirst = (items: Task[]) =>
      [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      yesterday: newestFirst(
        openTasks.filter((task) => {
          const createdDateKey = getCreatedDateKey(task);
          const dueDateKey = getTaskDateKey(task);
          return createdDateKey === yesterdayISO || dueDateKey === yesterdayISO;
        }),
      ),
      later: newestFirst(
        openTasks.filter((task) => {
          const dueDateKey = getTaskDateKey(task);
          return (!!dueDateKey && dueDateKey > todayISO) || !task.myDay;
        }),
      ),
      recently: newestFirst(
        openTasks.filter((task) => {
          const createdDateKey = getCreatedDateKey(task);
          return !!createdDateKey && createdDateKey >= recentSinceISO;
        }),
      ),
    };
  }, [tasks, todayISO, yesterdayISO, recentSinceISO]);
  const canAddToSelectedList = canAdd;

  function addCurrentTask() {
    const forcedList =
      selectedList === "my-day" ||
      selectedList === "important" ||
      selectedList === "planned" ||
      selectedList === "tasks"
        ? "tasks"
        : selectedList;
    const extraPatch: Partial<Task> = {};

    if (selectedList === "my-day") {
      extraPatch.myDay = todayISO;
    }

    if (selectedList === "important") {
      extraPatch.important = true;
    }

    if (dueDate) {
      extraPatch.dueDate = dueDate;
    }

    if (composerReminderAt) {
      extraPatch.reminderAt = composerReminderAt;
    }

    if (composerRepeatRule) {
      extraPatch.repeatRule = composerRepeatRule;
      extraPatch.dueDate = dueDate || todayISO;
    }

    onAdd(forcedList, extraPatch);
    setComposerReminderAt("");
    setComposerRepeatRule("");
    setComposerAutoDueDate("");
    setComposerMenu(null);
    setComposerDatePickerOpen(false);
  }

  function addCustomList() {
    const trimmed = listDraft.trim();
    if (!trimmed) return;

    const id = makeCustomListId(trimmed);
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

  function makeCustomListId(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function makeUniqueCustomListId(baseId: string, currentList: string) {
    const used = new Set(customLists.filter((list) => list !== currentList));
    if (!used.has(baseId)) return baseId;

    let index = 2;
    while (used.has(`${baseId}-${index}`)) {
      index += 1;
    }

    return `${baseId}-${index}`;
  }

  function startEditingListHeading() {
    if (!isCustomSelectedList) return;

    setListHeadingDraft(labelForList(selectedList));
    setEditingListHeading(true);
  }

  function cancelEditingListHeading() {
    setEditingListHeading(false);
    setListHeadingDraft("");
  }

  function saveListHeading() {
    if (!isCustomSelectedList) {
      cancelEditingListHeading();
      return;
    }

    const baseId = makeCustomListId(listHeadingDraft);
    if (!baseId) {
      cancelEditingListHeading();
      return;
    }

    const nextList = makeUniqueCustomListId(baseId, selectedList);

    if (nextList === selectedList) {
      cancelEditingListHeading();
      return;
    }

    setSessionLists((prev) => {
      const ordered = customLists;
      const nextOrdered = ordered.map((list) =>
        list === selectedList ? nextList : list,
      );
      const sessionSet = new Set(prev);

      return nextOrdered.filter(
        (list) =>
          list === nextList ||
          sessionSet.has(list) ||
          !discoveredCustomLists.includes(list),
      );
    });

    onRenameTaskList(selectedList, nextList);
    setSelectedList(nextList);
    setEditingListHeading(false);
    setListHeadingDraft("");
  }

  function openBoardTaskMenu(event: React.MouseEvent, task: Task) {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 270;
    const menuHeight = 440;
    const padding = 8;
    const x = Math.min(
      Math.max(padding, event.clientX + 6),
      window.innerWidth - menuWidth - padding,
    );
    const y = Math.min(
      Math.max(padding, event.clientY + 6),
      window.innerHeight - menuHeight - padding,
    );

    setBoardTaskMenu({ task, x, y });
  }

  function openTaskDetails(task: Task) {
    setSelectedTaskId(task.id);
    setBoardTaskMenu(null);
  }

  function openCustomListMenu(event: React.MouseEvent, list: string) {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 210;
    const menuHeight = 210;
    const padding = 8;
    const x = Math.min(
      Math.max(padding, event.clientX + 6),
      window.innerWidth - menuWidth - padding,
    );
    const y = Math.min(
      Math.max(padding, event.clientY + 6),
      window.innerHeight - menuHeight - padding,
    );

    setCustomListMenu({ list, x, y });
  }

  function closeBoardTaskMenu() {
    setBoardTaskMenu(null);
  }

  function closeCustomListMenu() {
    setCustomListMenu(null);
  }

  function runBoardTaskAction(action: () => void) {
    action();
    closeBoardTaskMenu();
  }

  function runCustomListAction(action: () => void) {
    action();
    closeCustomListMenu();
  }

  function moveCustomListUp(list: string) {
    const ordered = customLists;
    const index = ordered.indexOf(list);
    if (index <= 0) return;

    const next = [...ordered];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setSessionLists(next);
  }

  function getDuplicateListId(list: string) {
    const base = `${list}-copy`;
    const used = new Set(customLists);
    if (!used.has(base)) return base;

    let index = 2;
    while (used.has(`${base}-${index}`)) {
      index += 1;
    }

    return `${base}-${index}`;
  }

  function duplicateCustomList(list: string) {
    const nextList = getDuplicateListId(list);
    setSessionLists((prev) => (prev.includes(nextList) ? prev : [...prev, nextList]));
    onDuplicateTaskList(list, nextList);
    setSelectedList(nextList);
  }

  function printCustomList(list: string) {
    const title = labelForList(list);
    const listTasks = tasks.filter((task) => task.list === list);
    const printWindow = window.open("", "_blank", "width=720,height=900");
    if (!printWindow) {
      window.print();
      return;
    }

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 32px; color: #111827; }
            h1 { font-size: 24px; margin: 0 0 18px; }
            ul { display: grid; gap: 10px; padding-left: 20px; }
            li { line-height: 1.4; }
            .done { text-decoration: line-through; color: #6b7280; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <ul>
            ${listTasks
              .map(
                (task) =>
                  `<li class="${task.status === "done" ? "done" : ""}">${escapeHtml(task.title)}</li>`,
              )
              .join("")}
          </ul>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function deleteCustomList(list: string) {
    const taskCount = tasks.filter((task) => task.list === list).length;
    const confirmed = window.confirm(
      `Delete "${labelForList(list)}" and its ${taskCount} task${taskCount === 1 ? "" : "s"}?`,
    );

    if (!confirmed) return;

    setSessionLists((prev) => prev.filter((item) => item !== list));
    onDeleteTaskList(list);

    if (selectedList === list) {
      setSelectedList("my-day");
    }
  }

  function addOrRemoveMyDay(task: Task) {
    const isInMyDay = isTaskInMyDay(task, todayISO);

    if (isInMyDay) {
      onSetTaskSchedule(task, { myDay: "" });
      return;
    }

    onSetTaskSchedule(task, { myDay: todayISO });
  }

  function updateTaskNotes(task: Task, notes: string) {
    onUpdateTask(task, { notes });
  }

  function updateTaskTitle(task: Task, title: string) {
    onUpdateTask(task, { title: title.trim() || task.title });
  }

  function addTaskToMyDay(task: Task) {
    if (isTaskInMyDay(task, todayISO)) return;
    onSetTaskSchedule(task, { myDay: todayISO });
  }

  function setBoardTaskDue(task: Task, date: string) {
    onSetTaskSchedule(task, {
      dueDate: date,
      plannedFor: date,
      plannedStart: undefined,
      plannedEnd: undefined,
    });
  }

  function removeBoardTaskDue(task: Task) {
    onSetTaskSchedule(task, {
      dueDate: undefined,
      plannedFor: undefined,
      plannedStart: undefined,
      plannedEnd: undefined,
    });
  }

  function updateTaskDueDate(task: Task, date: string) {
    if (!date) {
      removeBoardTaskDue(task);
      return;
    }

    setBoardTaskDue(task, date);
  }

  function updateTaskReminder(task: Task, reminderAt: string) {
    onUpdateTask(task, { reminderAt });
  }

  function updateTaskRepeat(task: Task, repeatRule: TaskRepeatRule | "") {
    const nextDueDate = getTaskDateKey(task) ?? todayISO;
    onUpdateTask(task, {
      repeatRule: repeatRule || undefined,
      dueDate: repeatRule ? nextDueDate : task.dueDate,
    });
  }

  function toggleTaskTag(task: Task) {
    const tags = task.tags ?? [];
    const nextTags = tags.includes("tagged")
      ? tags.filter((tag) => tag !== "tagged")
      : [...tags, "tagged"];

    onUpdateTask(task, { tags: nextTags });
  }

  function createListFromTask(task: Task) {
    const name = window.prompt("New list name", task.title);
    if (!name) return;

    const id = makeCustomListId(name);
    if (!id) return;

    setSessionLists((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSelectedList(id);
    onMoveTaskToList(task, id, getMoveCleanupPatch());
  }

  function moveTaskToCustomList(task: Task, list: string) {
    setSelectedList(list);
    onMoveTaskToList(task, list, getMoveCleanupPatch());
  }

  function copyTaskToCustomList(task: Task, list: string) {
    setSelectedList(list);
    onCopyTaskToList(task, list);
  }

  function getMoveCleanupPatch(): Partial<Task> {
    if (selectedList === "my-day") {
      return { myDay: undefined };
    }

    if (selectedList === "planned") {
      return {
        dueDate: undefined,
        plannedFor: undefined,
        plannedStart: undefined,
        plannedEnd: undefined,
      };
    }

    if (selectedList === "important") {
      return { important: false };
    }

    return {};
  }

  function cancelCustomListDraft() {
    setListDraft("");
    setIsCreatingList(false);
  }

  function submitMyDayTask() {
    if (!canAddToSelectedList) return;
    addCurrentTask();
    if (myDayTitleRef.current) {
      myDayTitleRef.current.textContent = "";
    }
    closeMyDayComposer();
  }

  function resetMyDayComposerPlaceholder() {
    const el = myDayTitleRef.current;
    const text = (el?.textContent ?? "").trim();
    if (text) return;

    setTitle("");
    if (el) {
      el.textContent = "";
      el.innerHTML = "";
    }
  }

  function toggleComposerMenu(menu: Exclude<ComposerMenu, null>) {
    openMyDayComposer();
    setComposerDatePickerOpen(false);
    setComposerMenu((current) => (current === menu ? null : menu));
  }

  function updateComposerTitle(value: string) {
    setTitle(value);
    openMyDayComposer();

    const detectedDueDate = detectDueDateFromTaskText(value);
    if (detectedDueDate) {
      setDueDate(detectedDueDate);
      setComposerAutoDueDate(detectedDueDate);
      return;
    }

    if (composerAutoDueDate && dueDate === composerAutoDueDate) {
      setDueDate("");
      setComposerAutoDueDate("");
    }
  }

  function chooseComposerDueDate(date: string) {
    setDueDate(date);
    setComposerAutoDueDate("");
    setComposerMenu(null);
    setComposerDatePickerOpen(false);
  }

  function removeComposerDueDate() {
    setDueDate("");
    setComposerAutoDueDate("");
    setComposerMenu(null);
    setComposerDatePickerOpen(false);
  }

  function chooseComposerReminder(date: Date) {
    setComposerReminderAt(date.toISOString());
    setComposerMenu(null);
  }

  function removeComposerReminder() {
    setComposerReminderAt("");
    setComposerMenu(null);
  }

  function chooseComposerRepeat(rule: TaskRepeatRule) {
    setComposerRepeatRule(rule);
    if (!dueDate) setDueDate(todayISO);
    setComposerMenu(null);
  }

  function removeComposerRepeat() {
    setComposerRepeatRule("");
    setComposerMenu(null);
  }

  function openMyDayComposer() {
    if (myDayComposerCloseTimerRef.current) {
      window.clearTimeout(myDayComposerCloseTimerRef.current);
    }
    setMyDayComposerClosing(false);
    setMyDayComposerOpen(true);
  }

  function closeMyDayComposer() {
    if (!myDayComposerOpen || myDayComposerClosing) return;

    resetMyDayComposerPlaceholder();
    setMyDayComposerClosing(true);
    myDayComposerCloseTimerRef.current = window.setTimeout(() => {
      setMyDayComposerOpen(false);
      setMyDayComposerClosing(false);
      myDayComposerCloseTimerRef.current = null;
    }, 180);
  }

  function openSortMenu() {
    if (sortMenuCloseTimerRef.current) {
      window.clearTimeout(sortMenuCloseTimerRef.current);
      sortMenuCloseTimerRef.current = null;
    }

    setSortMenuClosing(false);
    setSortMenuOpen(true);
  }

  function closeSortMenu() {
    if (!sortMenuOpen || sortMenuClosing) return;

    setSortMenuClosing(true);
    sortMenuCloseTimerRef.current = window.setTimeout(() => {
      setSortMenuOpen(false);
      setSortMenuClosing(false);
      sortMenuCloseTimerRef.current = null;
    }, 150);
  }

  function toggleSortMenu() {
    if (sortMenuOpen) {
      closeSortMenu();
      return;
    }

    openSortMenu();
  }

  function togglePlannedSection(section: PlannedSectionId) {
    setPlannedSectionsOpen((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
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

  function renderSelectedListHeading() {
    if (isCustomSelectedList && editingListHeading) {
      return (
        <input
          ref={listHeadingInputRef}
          className="lo-plan-tasks-heading__input"
          value={listHeadingDraft}
          onChange={(event) => setListHeadingDraft(event.target.value)}
          onBlur={saveListHeading}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveListHeading();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditingListHeading();
            }
          }}
          aria-label="Rename custom list"
        />
      );
    }

    if (isCustomSelectedList) {
      return (
        <button
          type="button"
          className="lo-plan-tasks-heading__button"
          onClick={startEditingListHeading}
          title="Rename list"
        >
          {labelForList(selectedList)}
        </button>
      );
    }

    return <h3>{labelForList(selectedList)}</h3>;
  }

  function renderToolbarActions() {
    if (!showSortButton && !showSuggestionsButton) {
      return <span className="lo-plan-tasks-toolbar-spacer" aria-hidden="true" />;
    }

    return (
      <div className="lo-plan-tasks-toolbar-actions" ref={sortMenuRef}>
        {showSortButton ? (
          <div className="lo-plan-sort-wrap">
            <button
              type="button"
              className={`lo-plan-tasks-toolbar-action ${sortMenuOpen ? "is-active" : ""}`}
              aria-label="Sort tasks"
              aria-expanded={sortMenuOpen}
              aria-haspopup="menu"
              onClick={toggleSortMenu}
            >
              <img src={SORT_ICON} alt="" />
              <span className="lo-plan-tasks-toolbar-tooltip">Sort</span>
            </button>

            {sortMenuOpen ? (
              <div
                className={`lo-plan-sort-menu ${sortMenuClosing ? "is-closing" : ""}`}
                role="menu"
              >
                <div className="lo-plan-sort-menu__title">Sort by</div>
                <div className="lo-task-menu__divider" />
                <div className="lo-plan-sort-menu__content">
                  {BOARD_SORT_OPTIONS.map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      className={`lo-plan-sort-menu__item ${boardSortMode === option.mode ? "is-active" : ""}`}
                      role="menuitemradio"
                      aria-checked={boardSortMode === option.mode}
                      onClick={() => {
                        setBoardSortMode(option.mode);
                        setBoardSortDirection("asc");
                        closeSortMenu();
                      }}
                    >
                      <img src={option.icon} alt="" />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {showSuggestionsButton ? (
          <button
            type="button"
            className="lo-plan-tasks-toolbar-action"
            aria-label="Suggestions"
            onClick={() => setSuggestionsOpen(true)}
          >
            <img src={SUGGESTIONS_ICON} alt="" />
            <span className="lo-plan-tasks-toolbar-tooltip">Suggestions</span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`lo-plan-tasks-layout ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
    >
      <div className="lo-plan-tasks-sidebar-wrap">
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
                onContextMenu={(event) => openCustomListMenu(event, list)}
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

        {activeSortOption && !sidebarCollapsed ? (
          <div className="lo-plan-sort-status" aria-label="Current sort order">
            <button
              type="button"
              className="lo-plan-sort-status__reverse"
              onClick={() =>
                setBoardSortDirection((direction) =>
                  direction === "asc" ? "desc" : "asc",
                )
              }
              aria-label="Reverse sort order"
              title="Reverse sort order"
            >
              {boardSortDirection === "asc" ? "↑" : "↓"}
            </button>
            <span className="lo-plan-sort-status__label">
              Sorted by {activeSortOption.label}
            </span>
            <button
              type="button"
              className="lo-plan-sort-status__remove"
              onClick={() => {
                setBoardSortMode(null);
                setBoardSortDirection("asc");
              }}
              aria-label="Remove sort order"
              title="Remove sort order"
            >
              x
            </button>
          </div>
        ) : null}
      </div>

      <div className="lo-plan-tasks-main lo-stack">
        {usesCompactComposer ? (
          <>
            <Card className="toolbar-card">
              <div className="lo-toolbar">
                <div className="lo-plan-tasks-heading">
                  <img src={getListIcon(selectedList)} alt="" />
                  {renderSelectedListHeading()}
                </div>

                <div className="lo-plan-tasks-search">
                  <img src="/icons/white/search.png" alt="" />
                  <input
                    className="lo-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search tasks"
                  />
                </div>

                {renderToolbarActions()}
              </div>
            </Card>

          <Card
            className={`toolbar-card lo-my-day-composer ${myDayComposerClosing ? "is-closing" : ""}`}
          >
            <div className="lo-my-day-composer__panel" ref={myDayComposerRef}>
              <div className="lo-my-day-composer__top">
                <button
                  type="button"
                  className="lo-my-day-composer__tick"
                  aria-label="Task not completed"
                  onClick={openMyDayComposer}
                >
                  <img src="/icons/white/circle.png" alt="" />
                </button>
                <div
                  ref={myDayTitleRef}
                  className="lo-my-day-composer__input"
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  tabIndex={0}
                  aria-label="Add a task"
                  data-placeholder="Add a task"
                  onFocus={openMyDayComposer}
                  onInput={(e) => {
                    updateComposerTitle(e.currentTarget.textContent ?? "");
                  }}
                  onBlur={resetMyDayComposerPlaceholder}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitMyDayTask();
                    }
                    if (e.key === "Escape") {
                      e.currentTarget.blur();
                      closeMyDayComposer();
                    }
                  }}
                />
              </div>

              {(myDayComposerOpen || myDayComposerClosing) && (
                <div className="lo-my-day-composer__actions">
                  <div className="lo-my-day-composer__divider" />

                  <div className="lo-my-day-composer__bottom">
                    <div className="lo-my-day-composer__tools" ref={composerToolsRef}>
                      <div className="lo-my-day-composer__tool-wrap">
                        <button
                          type="button"
                          className={dueDate ? "is-active" : ""}
                          title="Due date"
                          aria-label="Due date"
                          aria-expanded={composerMenu === "due"}
                          onClick={() => toggleComposerMenu("due")}
                        >
                          <img src="/icons/white/calendar.png" alt="" />
                        </button>
                        {composerMenu === "due" ? (
                          <div className="lo-composer-menu" role="menu">
                            <div className="lo-task-details-due-menu__title">Due</div>
                            <div className="lo-task-details-divider" />
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() => chooseComposerDueDate(todayISO)}
                            >
                              <img src={PLAN_SIDEBAR_ICONS["my-day"]} alt="" />
                              <span>Today</span>
                            </button>
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() => chooseComposerDueDate(isoDate(composerTomorrow))}
                            >
                              <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                              <span>Tomorrow</span>
                            </button>
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() => chooseComposerDueDate(isoDate(composerNextWeek))}
                            >
                              <img src="/icons/white/repeat.png" alt="" />
                              <span>Next Week</span>
                            </button>
                            <div className="lo-task-details-divider" />
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() => setComposerDatePickerOpen((open) => !open)}
                            >
                              <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                              <span>Pick a Date</span>
                            </button>
                            {composerDatePickerOpen ? (
                              <input
                                className="lo-task-details-due-menu__date"
                                type="date"
                                value={dueDate}
                                onChange={(event) =>
                                  chooseComposerDueDate(event.target.value)
                                }
                                aria-label="Pick a due date"
                                autoFocus
                              />
                            ) : null}
                            {dueDate ? (
                              <>
                                <div className="lo-task-details-divider" />
                                <button
                                  type="button"
                                  className="lo-task-details-due-menu__item is-danger"
                                  role="menuitem"
                                  onClick={removeComposerDueDate}
                                >
                                  <img src="/icons/white/calendar-xmark.png" alt="" />
                                  <span>Remove due date</span>
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="lo-my-day-composer__tool-wrap">
                        <button
                          type="button"
                          className={composerReminderAt ? "is-active" : ""}
                          title="Remind me"
                          aria-label="Remind me"
                          aria-expanded={composerMenu === "reminder"}
                          onClick={() => toggleComposerMenu("reminder")}
                        >
                          <img src="/icons/white/alarm.png" alt="" />
                        </button>
                        {composerMenu === "reminder" ? (
                          <div className="lo-composer-menu" role="menu">
                            <div className="lo-task-details-due-menu__title">Reminder</div>
                            <div className="lo-task-details-divider" />
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() =>
                                chooseComposerReminder(composerLaterTodayReminder)
                              }
                            >
                              <img src="/icons/white/alarm.png" alt="" />
                              <span>Later today</span>
                              <span>{formatReminderHour(composerLaterTodayReminder)}</span>
                            </button>
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() =>
                                chooseComposerReminder(composerTomorrowReminder)
                              }
                            >
                              <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                              <span>Tomorrow</span>
                              <span>{formatReminderTime(composerTomorrowReminder)}</span>
                            </button>
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() =>
                                chooseComposerReminder(composerNextWeekReminder)
                              }
                            >
                              <img src="/icons/white/repeat.png" alt="" />
                              <span>Next week</span>
                              <span>{formatReminderTime(composerNextWeekReminder)}</span>
                            </button>
                            {composerReminderAt ? (
                              <>
                                <div className="lo-task-details-divider" />
                                <button
                                  type="button"
                                  className="lo-task-details-due-menu__item is-danger"
                                  role="menuitem"
                                  onClick={removeComposerReminder}
                                >
                                  <img src="/icons/white/alarm.png" alt="" />
                                  <span>Remove reminder</span>
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="lo-my-day-composer__tool-wrap">
                        <button
                          type="button"
                          className={composerRepeatRule ? "is-active" : ""}
                          title="Repeat"
                          aria-label="Repeat"
                          aria-expanded={composerMenu === "repeat"}
                          onClick={() => toggleComposerMenu("repeat")}
                        >
                          <img src="/icons/white/repeat.png" alt="" />
                        </button>
                        {composerMenu === "repeat" ? (
                          <div className="lo-composer-menu" role="menu">
                            <div className="lo-task-details-due-menu__title">Repeat</div>
                            <div className="lo-task-details-divider" />
                            {(
                              [
                                ["daily", "Daily", "/icons/white/day.png"],
                                ["weekdays", "Weekdays", PLAN_SIDEBAR_ICONS["my-day"]],
                                ["weekly", "Weekly", "/icons/white/repeat.png"],
                                ["monthly", "Monthly", PLAN_SIDEBAR_ICONS.planned],
                                ["yearly", "Yearly", "/icons/white/calendar.png"],
                              ] as Array<[TaskRepeatRule, string, string]>
                            ).map(([rule, label, icon]) => (
                              <button
                                key={rule}
                                type="button"
                                className="lo-task-details-due-menu__item"
                                role="menuitem"
                                onClick={() => chooseComposerRepeat(rule)}
                              >
                                <img src={icon} alt="" />
                                <span>{label}</span>
                              </button>
                            ))}
                            <div className="lo-task-details-divider" />
                            <button
                              type="button"
                              className="lo-task-details-due-menu__item"
                              role="menuitem"
                              onClick={() => chooseComposerRepeat("custom")}
                            >
                              <img src="/icons/white/setting.png" alt="" />
                              <span>Custom</span>
                            </button>
                            {composerRepeatRule ? (
                              <>
                                <div className="lo-task-details-divider" />
                                <button
                                  type="button"
                                  className="lo-task-details-due-menu__item is-danger"
                                  role="menuitem"
                                  onClick={removeComposerRepeat}
                                >
                                  <img src="/icons/white/repeat.png" alt="" />
                                  <span>Remove repeat</span>
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <Button onClick={submitMyDayTask} disabled={!canAddToSelectedList}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
          </>
        ) : (
          <>
        <Card className="toolbar-card">
          <div className="lo-toolbar">
            <div className="lo-plan-tasks-heading">
              <img src={getListIcon(selectedList)} alt="" />
              {renderSelectedListHeading()}
            </div>

            <div className="lo-plan-tasks-search">
              <img src="/icons/white/search.png" alt="" />
              <input
                className="lo-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search tasks"
              />
            </div>

            {renderToolbarActions()}
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
          </>
        )}

        {selectedList === "planned" ? (
          <div className="lo-planned-groups">
            {visiblePlannedGroups.map((group, index) => (
              <React.Fragment key={group.id}>
                {index > 0 ? (
                  <div className="lo-planned-groups__divider" aria-hidden="true" />
                ) : null}
                <PlannedTaskGroup
                  title={group.title}
                  tasks={group.tasks}
                  isOpen={plannedSectionsOpen[group.id]}
                  justAddedId={justAddedId}
                  onToggle={() => togglePlannedSection(group.id)}
                  onToggleDone={onToggleDone}
                  onRemove={onRemove}
                  onSetDue={onSetDue}
                  onSetPriority={onSetPriority}
                  onSetImportant={onSetImportant}
                  onOpenTaskMenu={openBoardTaskMenu}
                  onOpenTaskDetails={openTaskDetails}
                />
              </React.Fragment>
            ))}
          </div>
        ) : (
          <TaskSection
            title={labelForList(selectedList)}
            tasks={visibleTasks}
            justAddedId={justAddedId}
            onToggleDone={onToggleDone}
            onRemove={onRemove}
            onSetDue={onSetDue}
            onSetPriority={onSetPriority}
            onSetImportant={onSetImportant}
            onOpenTaskMenu={openBoardTaskMenu}
            onOpenTaskDetails={openTaskDetails}
          />
        )}

        {usesCompactComposer &&
          selectedList !== "planned" &&
          completedBoardTasks.length > 0 && (
          <section className="lo-plan-completed lo-stack">
            <button
              type="button"
              className="lo-plan-completed__toggle"
              aria-expanded={myDayCompletedOpen}
              onClick={() => setMyDayCompletedOpen((open) => !open)}
            >
              <span>Completed</span>
              <span className="lo-plan-completed__count">
                {completedBoardTasks.length}
              </span>
              <span
                className={`lo-plan-completed__chevron ${myDayCompletedOpen ? "is-open" : ""}`}
                aria-hidden="true"
              />
            </button>

            {myDayCompletedOpen && (
              <TaskSection
                title="Completed"
                showTitle={false}
                tasks={completedBoardTasks}
                justAddedId={justAddedId}
                onToggleDone={onToggleDone}
                onRemove={onRemove}
                onSetDue={onSetDue}
                onSetPriority={onSetPriority}
                onSetImportant={onSetImportant}
                onOpenTaskMenu={openBoardTaskMenu}
                onOpenTaskDetails={openTaskDetails}
              />
            )}
          </section>
        )}
      </div>
      {boardTaskMenu
        ? createPortal(
            <BoardTaskContextMenu
              ref={boardTaskMenuRef}
              menu={boardTaskMenu}
              todayISO={todayISO}
              customLists={customLists}
              onAction={runBoardTaskAction}
              onToggleMyDay={addOrRemoveMyDay}
              onToggleImportant={(task) => onSetImportant(task, !task.important)}
              onToggleCompleted={(task) =>
                onSetStatus(task, task.status === "done" ? "todo" : "done")
              }
              onDueToday={(task) => setBoardTaskDue(task, todayISO)}
              onDueTomorrow={(task) => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setBoardTaskDue(task, isoDate(tomorrow));
              }}
              onRemoveDue={removeBoardTaskDue}
              onCreateList={createListFromTask}
              onMoveToList={moveTaskToCustomList}
              onCopyToList={copyTaskToCustomList}
              onDelete={onRemove}
            />,
            document.body,
          )
        : null}
      {customListMenu
        ? createPortal(
            <CustomListContextMenu
              ref={customListMenuRef}
              menu={customListMenu}
              canMoveUp={customLists.indexOf(customListMenu.list) > 0}
              onAction={runCustomListAction}
              onMoveUp={moveCustomListUp}
              onDuplicate={duplicateCustomList}
              onPrint={printCustomList}
              onDelete={deleteCustomList}
            />,
            document.body,
          )
        : null}
      {suggestionsOpen && showSuggestionsButton
        ? createPortal(
            <SuggestionsPanel
              groups={suggestionGroups}
              onClose={() => setSuggestionsOpen(false)}
              onAddToMyDay={addTaskToMyDay}
              onComplete={(task) => onSetStatus(task, "done")}
            />,
            document.body,
          )
        : null}
      {selectedTask
        ? createPortal(
            <TaskDetailsPanel
              task={selectedTask}
              todayISO={todayISO}
              onClose={() => setSelectedTaskId(null)}
              onToggleDone={onToggleDone}
              onToggleImportant={(task) => onSetImportant(task, !task.important)}
              onToggleMyDay={addOrRemoveMyDay}
              onUpdateTitle={updateTaskTitle}
              onUpdateDueDate={updateTaskDueDate}
              onUpdateReminder={updateTaskReminder}
              onUpdateRepeat={updateTaskRepeat}
              onUpdateNotes={updateTaskNotes}
              onToggleTag={toggleTaskTag}
              onDelete={(task) => {
                onRemove(task);
                setSelectedTaskId(null);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function ReminderPopupStack({
  alerts,
  onDismiss,
  onSnooze,
  onComplete,
}: {
  alerts: ReminderAlert[];
  onDismiss: (key: string) => void;
  onSnooze: (alert: ReminderAlert) => void;
  onComplete: (alert: ReminderAlert) => void;
}) {
  if (typeof document === "undefined" || alerts.length === 0) return null;

  return createPortal(
    <div className="lo-reminder-popups" role="region" aria-label="Task reminders">
      {alerts.map((alert, index) => (
        <section
          key={alert.key}
          className="lo-reminder-popup"
          style={{ "--lo-reminder-index": index } as React.CSSProperties}
          aria-label={`Reminder for ${alert.title}`}
        >
          <div className="lo-reminder-popup__glow" aria-hidden="true" />
          <div className="lo-reminder-popup__icon" aria-hidden="true">
            <img src="/icons/white/alarm.png" alt="" />
          </div>
          <div className="lo-reminder-popup__body">
            <div className="lo-reminder-popup__eyebrow">
              <span>Reminder</span>
              <span>{formatReminderDisplay(alert.reminderAt) || "Now"}</span>
            </div>
            <h3>{alert.title}</h3>
            <p>{alert.listLabel}</p>
          </div>
          <div className="lo-reminder-popup__actions">
            <button type="button" onClick={() => onDismiss(alert.key)}>
              Dismiss
            </button>
            <button type="button" onClick={() => onSnooze(alert)}>
              Snooze
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => onComplete(alert)}
            >
              Done
            </button>
          </div>
        </section>
      ))}
    </div>,
    document.body,
  );
}

const CustomListContextMenu = React.forwardRef<
  HTMLDivElement,
  {
    menu: CustomListMenuState;
    canMoveUp: boolean;
    onAction: (action: () => void) => void;
    onMoveUp: (list: string) => void;
    onDuplicate: (list: string) => void;
    onPrint: (list: string) => void;
    onDelete: (list: string) => void;
  }
>(function CustomListContextMenu(
  {
    menu,
    canMoveUp,
    onAction,
    onMoveUp,
    onDuplicate,
    onPrint,
    onDelete,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className="lo-task-menu lo-custom-list-menu"
      role="menu"
      style={{
        position: "fixed",
        top: menu.y,
        left: menu.x,
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <BoardMenuButton
        icon={MOVE_UP_ICON}
        label="Move up"
        disabled={!canMoveUp}
        onClick={() => onAction(() => onMoveUp(menu.list))}
      />
      <BoardMenuButton
        icon={CUSTOM_LIST_ICON}
        label="Duplicate list"
        onClick={() => onAction(() => onDuplicate(menu.list))}
      />
      <BoardMenuButton
        icon={PRINT_LIST_ICON}
        label="Print list"
        onClick={() => onAction(() => onPrint(menu.list))}
      />

      <div className="lo-task-menu__divider" />

      <BoardMenuButton
        icon={DELETE_ICON}
        label="Delete list"
        isDanger
        onClick={() => onAction(() => onDelete(menu.list))}
      />
    </div>
  );
});

function SuggestionsPanel({
  groups,
  onClose,
  onAddToMyDay,
  onComplete,
}: {
  groups: {
    yesterday: Task[];
    later: Task[];
    recently: Task[];
  };
  onClose: () => void;
  onAddToMyDay: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  React.useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="lo-suggestions-shell" role="dialog" aria-label="Suggestions">
      <button
        type="button"
        className="lo-suggestions-backdrop"
        aria-label="Close suggestions"
        onClick={onClose}
      />

      <aside className="lo-suggestions-panel">
        <header className="lo-suggestions-panel__header">
          <div className="lo-suggestions-panel__title">
            <img src={SUGGESTIONS_ICON} alt="" />
            <h3>Suggestions</h3>
          </div>
          <button
            type="button"
            className="lo-suggestions-panel__close"
            aria-label="Close suggestions"
            onClick={onClose}
          >
            x
          </button>
        </header>

        <div className="lo-suggestions-panel__body">
          <SuggestionGroup
            title="Yesterday"
            tasks={groups.yesterday}
            onAddToMyDay={onAddToMyDay}
            onComplete={onComplete}
          />
          <SuggestionGroup
            title="Later"
            tasks={groups.later}
            onAddToMyDay={onAddToMyDay}
            onComplete={onComplete}
          />
          <SuggestionGroup
            title="Recently added"
            tasks={groups.recently}
            onAddToMyDay={onAddToMyDay}
            onComplete={onComplete}
          />
        </div>
      </aside>
    </div>
  );
}

function formatCreatedDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Created on unknown date";

  return `Created on ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function nextWholeHour(from = new Date()) {
  const date = new Date(from);
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
}

function atHourFromToday(daysFromToday: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function formatReminderTime(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
  }) + `, ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
  }).replace(":00", "")}`;
}

function formatReminderHour(date: Date) {
  return date
    .toLocaleTimeString(undefined, {
      hour: "numeric",
    })
    .replace(":00", "");
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatReminderDisplay(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return isSameDate(date, new Date())
    ? formatReminderHour(date)
    : formatReminderTime(date);
}

function formatDueDateDisplay(
  dateKey?: string | null,
  options: { overdue?: boolean } = {},
) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  const today = startOfToday();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (options.overdue) {
    const overdueLabel = isSameDate(date, yesterday)
      ? "Yesterday"
      : date.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

    return `Overdue, ${overdueLabel}`;
  }

  if (isSameDate(date, today)) return "Today";
  if (isSameDate(date, tomorrow)) return "Tomorrow";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dateInputValue(date: Date) {
  return isoDate(date);
}

function timeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function TaskDetailsPanel({
  task,
  todayISO,
  onClose,
  onToggleDone,
  onToggleImportant,
  onToggleMyDay,
  onUpdateTitle,
  onUpdateDueDate,
  onUpdateReminder,
  onUpdateRepeat,
  onUpdateNotes,
  onToggleTag,
  onDelete,
}: {
  task: Task;
  todayISO: string;
  onClose: () => void;
  onToggleDone: (task: Task) => void;
  onToggleImportant: (task: Task) => void;
  onToggleMyDay: (task: Task) => void;
  onUpdateTitle: (task: Task, title: string) => void;
  onUpdateDueDate: (task: Task, date: string) => void;
  onUpdateReminder: (task: Task, reminderAt: string) => void;
  onUpdateRepeat: (task: Task, repeatRule: TaskRepeatRule | "") => void;
  onUpdateNotes: (task: Task, notes: string) => void;
  onToggleTag: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const [titleDraft, setTitleDraft] = React.useState(task.title);
  const [dueMenuOpen, setDueMenuOpen] = React.useState(false);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [reminderMenuOpen, setReminderMenuOpen] = React.useState(false);
  const [reminderPickerOpen, setReminderPickerOpen] = React.useState(false);
  const [repeatMenuOpen, setRepeatMenuOpen] = React.useState(false);
  const defaultReminder = React.useMemo(() => nextWholeHour(), []);
  const [customReminderDate, setCustomReminderDate] = React.useState(() =>
    dateInputValue(defaultReminder),
  );
  const [customReminderTime, setCustomReminderTime] = React.useState(() =>
    timeInputValue(defaultReminder),
  );
  const titleTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const dueMenuRef = React.useRef<HTMLDivElement | null>(null);
  const reminderMenuRef = React.useRef<HTMLDivElement | null>(null);
  const reminderPickerRef = React.useRef<HTMLDivElement | null>(null);
  const repeatMenuRef = React.useRef<HTMLDivElement | null>(null);
  const isInMyDay = isTaskInMyDay(task, todayISO);
  const dueDate = getTaskDateKey(task) ?? "";
  const hasTag = (task.tags ?? []).includes("tagged");
  const reminderLabel = formatReminderDisplay(task.reminderAt);
  const repeatRule = task.repeatRule;
  const repeatRuleLabel = repeatLabel(repeatRule);
  const overdue = isTaskOverdue(task);
  const dueDateLabel = formatDueDateDisplay(dueDate, { overdue });
  const weekdayLabel = React.useCallback(
    (date: Date) =>
      date.toLocaleDateString(undefined, {
        weekday: "short",
      }),
    [],
  );
  const todayLabel = weekdayLabel(new Date());
  const laterTodayReminder = React.useMemo(() => nextWholeHour(), []);
  const tomorrowReminder = React.useMemo(() => atHourFromToday(1, 9), []);
  const nextWeekReminder = React.useMemo(() => atHourFromToday(7, 9), []);
  const reminderHours = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const hour = index + 7;
        const date = new Date();
        date.setHours(hour, 0, 0, 0);
        return {
          value: `${String(hour).padStart(2, "0")}:00`,
          label: date
            .toLocaleTimeString(undefined, {
              hour: "numeric",
            })
            .replace(":00", ""),
        };
      }),
    [],
  );
  const tomorrow = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return {
      date: isoDate(date),
      label: weekdayLabel(date),
    };
  }, [weekdayLabel]);
  const nextWeek = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return {
      date: isoDate(date),
      label: weekdayLabel(date),
    };
  }, [weekdayLabel]);

  React.useEffect(() => {
    if (!dueMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (dueMenuRef.current?.contains(target)) return;
      setDueMenuOpen(false);
      setShowDatePicker(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [dueMenuOpen]);

  React.useEffect(() => {
    if (!reminderMenuOpen && !reminderPickerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (reminderMenuRef.current?.contains(target)) return;
      if (reminderPickerRef.current?.contains(target)) return;
      setReminderMenuOpen(false);
      setReminderPickerOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [reminderMenuOpen, reminderPickerOpen]);

  React.useEffect(() => {
    if (!repeatMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (repeatMenuRef.current?.contains(target)) return;
      setRepeatMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [repeatMenuOpen]);

  React.useEffect(() => {
    setTitleDraft(task.title);
  }, [task.id, task.title]);

  React.useEffect(() => {
    const textarea = titleTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [titleDraft]);

  React.useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (dueMenuOpen) {
        setDueMenuOpen(false);
        return;
      }
      if (reminderMenuOpen || reminderPickerOpen) {
        setReminderMenuOpen(false);
        setReminderPickerOpen(false);
        return;
      }
      if (repeatMenuOpen) {
        setRepeatMenuOpen(false);
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [dueMenuOpen, reminderMenuOpen, reminderPickerOpen, repeatMenuOpen, onClose]);

  function chooseDueDate(date: string) {
    onUpdateDueDate(task, date);
    setDueMenuOpen(false);
    setShowDatePicker(false);
  }

  function chooseReminder(date: Date) {
    onUpdateReminder(task, date.toISOString());
    setReminderMenuOpen(false);
    setReminderPickerOpen(false);
  }

  function openCustomReminderPicker() {
    setReminderMenuOpen(false);
    setReminderPickerOpen(true);
  }

  function saveCustomReminder() {
    if (!customReminderDate || !customReminderTime) return;
    chooseReminder(new Date(`${customReminderDate}T${customReminderTime}:00`));
  }

  function openRepeatMenu() {
    setDueMenuOpen(false);
    setShowDatePicker(false);
    setReminderMenuOpen(false);
    setReminderPickerOpen(false);
    setRepeatMenuOpen((open) => !open);
  }

  function chooseRepeatOption(rule: TaskRepeatRule) {
    onUpdateRepeat(task, rule);
    setRepeatMenuOpen(false);
  }

  function clearRepeat(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onUpdateRepeat(task, "");
    setRepeatMenuOpen(false);
  }

  function clearMyDay(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!isInMyDay) return;
    onToggleMyDay(task);
  }

  function clearReminder(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onUpdateReminder(task, "");
    setReminderMenuOpen(false);
    setReminderPickerOpen(false);
  }

  function clearDueDate(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onUpdateDueDate(task, "");
    setDueMenuOpen(false);
    setShowDatePicker(false);
  }

  function clearTag(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!hasTag) return;
    onToggleTag(task);
  }

  return (
    <div
      className="lo-task-details-shell"
      role="dialog"
      aria-label="Task details"
    >
      <button
        type="button"
        className="lo-task-details-backdrop"
        aria-label="Close task details"
        onClick={onClose}
      />

      <aside className="lo-task-details-panel">
        <div className="lo-task-details-panel__body">
          <div className="lo-task-details-card">
            <div className="lo-task-details-panel__top">
            <button
              type="button"
              className={`lo-task-check lo-task-details-panel__check ${task.status === "done" ? "is-checked" : ""}`}
              onClick={() => onToggleDone(task)}
              aria-pressed={task.status === "done"}
              aria-label={task.status === "done" ? "Mark not done" : "Mark done"}
            >
              <img src="/icons/white/circle.png" alt="" />
            </button>

            <textarea
              ref={titleTextareaRef}
              className={`lo-task-details-panel__title ${task.status === "done" ? "is-done" : ""}`}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => onUpdateTitle(task, titleDraft)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              rows={2}
              aria-label="Task name"
            />

            <button
              type="button"
              className={`lo-task-important lo-task-details-panel__important ${task.important ? "is-active" : ""}`}
              onClick={() => onToggleImportant(task)}
              aria-label={task.important ? "Remove from Important" : "Mark important"}
              title={task.important ? "Remove from Important" : "Mark important"}
            >
              <img
                src={
                  task.important
                    ? "/icons/white/star-filled.png"
                    : "/icons/white/star.png"
                }
                alt=""
              />
            </button>
            </div>
          </div>

          <div className="lo-task-details-card">
            <div className={`lo-task-details-action-wrap ${isInMyDay ? "has-remove" : ""}`}>
              <button
                type="button"
                className={`lo-task-details-action lo-task-details-action--my-day ${isInMyDay ? "is-added lo-task-details-action--has-remove" : ""}`}
                onClick={() => onToggleMyDay(task)}
              >
                <span
                  className="lo-task-details-action__mask-icon"
                  style={{
                    WebkitMaskImage: `url(${PLAN_SIDEBAR_ICONS["my-day"]})`,
                    maskImage: `url(${PLAN_SIDEBAR_ICONS["my-day"]})`,
                  }}
                  aria-hidden="true"
                />
                <span>{isInMyDay ? "Added to My Day" : "Add to My Day"}</span>
              </button>
              {isInMyDay ? (
                <button
                  type="button"
                  className="lo-task-details-action-remove"
                  onClick={clearMyDay}
                  aria-label="Remove from My Day"
                  title="Remove from My Day"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          <div className="lo-task-details-card">
            <div className="lo-task-details-reminder-wrap" ref={reminderMenuRef}>
              <div className={`lo-task-details-action-wrap ${reminderLabel ? "has-remove" : ""}`}>
              <button
                type="button"
                className={`lo-task-details-action lo-task-details-action--reminder ${reminderLabel ? "is-set lo-task-details-action--has-remove" : ""}`}
                onClick={() => setReminderMenuOpen((open) => !open)}
                aria-expanded={reminderMenuOpen}
                aria-haspopup="menu"
              >
                <span
                  className="lo-task-details-action__mask-icon"
                  style={{
                    WebkitMaskImage: "url(/icons/white/alarm.png)",
                    maskImage: "url(/icons/white/alarm.png)",
                  }}
                  aria-hidden="true"
                />
                <span>{reminderLabel || "Remind me"}</span>
              </button>
              {reminderLabel ? (
                <button
                  type="button"
                  className="lo-task-details-action-remove"
                  onClick={clearReminder}
                  aria-label="Remove reminder"
                  title="Remove reminder"
                >
                  ×
                </button>
              ) : null}
              </div>

              {reminderMenuOpen ? (
                <div className="lo-task-details-reminder-menu" role="menu">
                  <div className="lo-task-details-due-menu__title">Reminder</div>
                  <div className="lo-task-details-divider" />
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseReminder(laterTodayReminder)}
                  >
                    <img src="/icons/white/alarm.png" alt="" />
                    <span>Later today</span>
                    <span>{formatReminderHour(laterTodayReminder)}</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseReminder(tomorrowReminder)}
                  >
                    <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                    <span>Tomorrow</span>
                    <span>{formatReminderTime(tomorrowReminder)}</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseReminder(nextWeekReminder)}
                  >
                    <img src="/icons/white/repeat.png" alt="" />
                    <span>Next week</span>
                    <span>{formatReminderTime(nextWeekReminder)}</span>
                  </button>
                  <div className="lo-task-details-divider" />
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={openCustomReminderPicker}
                  >
                    <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                    <span>Pick a Date & Time</span>
                  </button>
                </div>
              ) : null}
            </div>

            <div className="lo-task-details-divider" />

            <div className="lo-task-details-due-wrap" ref={dueMenuRef}>
              <div className={`lo-task-details-action-wrap ${dueDateLabel ? "has-remove" : ""}`}>
              <button
                type="button"
                className={`lo-task-details-action lo-task-details-action--date ${dueDateLabel ? "is-set lo-task-details-action--has-remove" : ""} ${overdue ? "is-overdue" : ""}`}
                onClick={() => setDueMenuOpen((open) => !open)}
                aria-expanded={dueMenuOpen}
                aria-haspopup="menu"
              >
                <span
                  className="lo-task-details-action__mask-icon"
                  style={{
                    WebkitMaskImage: `url(${PLAN_SIDEBAR_ICONS.planned})`,
                    maskImage: `url(${PLAN_SIDEBAR_ICONS.planned})`,
                  }}
                  aria-hidden="true"
                />
                <span>{dueDateLabel || "Add due date"}</span>
              </button>
              {dueDateLabel ? (
                <button
                  type="button"
                  className="lo-task-details-action-remove"
                  onClick={clearDueDate}
                  aria-label="Remove due date"
                  title="Remove due date"
                >
                  ×
                </button>
              ) : null}
              </div>

              {dueMenuOpen ? (
                <div className="lo-task-details-due-menu" role="menu">
                  <div className="lo-task-details-due-menu__title">Due</div>
                  <div className="lo-task-details-divider" />
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseDueDate(todayISO)}
                  >
                    <img src={PLAN_SIDEBAR_ICONS["my-day"]} alt="" />
                    <span>Today</span>
                    <span>{todayLabel}</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseDueDate(tomorrow.date)}
                  >
                    <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                    <span>Tomorrow</span>
                    <span>{tomorrow.label}</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseDueDate(nextWeek.date)}
                  >
                    <img src="/icons/white/repeat.png" alt="" />
                    <span>Next Week</span>
                    <span>{nextWeek.label}</span>
                  </button>
                  <div className="lo-task-details-divider" />
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => setShowDatePicker((show) => !show)}
                  >
                    <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                    <span>Pick a Date</span>
                  </button>
                  {showDatePicker ? (
                    <input
                      className="lo-task-details-due-menu__date"
                      type="date"
                      value={dueDate}
                      onChange={(event) => chooseDueDate(event.target.value)}
                      aria-label="Pick a due date"
                      autoFocus
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="lo-task-details-divider" />

            <div className="lo-task-details-repeat-wrap" ref={repeatMenuRef}>
              <div className={`lo-task-details-action-wrap ${repeatRule ? "has-remove" : ""}`}>
                <button
                  type="button"
                  className={`lo-task-details-action lo-task-details-action--repeat ${repeatRule ? "is-set lo-task-details-action--has-remove" : ""}`}
                  onClick={openRepeatMenu}
                  aria-expanded={repeatMenuOpen}
                  aria-haspopup="menu"
                >
                  <span
                    className="lo-task-details-action__mask-icon"
                    style={{
                      WebkitMaskImage: "url(/icons/white/repeat.png)",
                      maskImage: "url(/icons/white/repeat.png)",
                    }}
                    aria-hidden="true"
                  />
                  <span>{repeatRuleLabel || "Repeat"}</span>
                </button>
                {repeatRule ? (
                  <button
                    type="button"
                    className="lo-task-details-action-remove"
                    onClick={clearRepeat}
                    aria-label="Remove repeat"
                    title="Remove repeat"
                  >
                    ×
                  </button>
                ) : null}
              </div>

              {repeatMenuOpen ? (
                <div className="lo-task-details-repeat-menu" role="menu">
                  <div className="lo-task-details-due-menu__title">Repeat</div>
                  <div className="lo-task-details-divider" />
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseRepeatOption("daily")}
                  >
                    <img src="/icons/white/day.png" alt="" />
                    <span>Daily</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseRepeatOption("weekdays")}
                  >
                    <img src={PLAN_SIDEBAR_ICONS["my-day"]} alt="" />
                    <span>Weekdays</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseRepeatOption("weekly")}
                  >
                    <img src="/icons/white/repeat.png" alt="" />
                    <span>Weekly</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseRepeatOption("monthly")}
                  >
                    <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                    <span>Monthly</span>
                  </button>
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseRepeatOption("yearly")}
                  >
                    <img src="/icons/white/calendar.png" alt="" />
                    <span>Yearly</span>
                  </button>
                  <div className="lo-task-details-divider" />
                  <button
                    type="button"
                    className="lo-task-details-due-menu__item"
                    role="menuitem"
                    onClick={() => chooseRepeatOption("custom")}
                  >
                    <img src="/icons/white/setting.png" alt="" />
                    <span>Custom</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {reminderPickerOpen ? (
            <div
              ref={reminderPickerRef}
              className="lo-task-details-reminder-picker"
              role="dialog"
              aria-label="Pick reminder date and time"
            >
              <div className="lo-task-details-due-menu__title">Calendar</div>
              <input
                className="lo-task-details-reminder-picker__date"
                type="date"
                value={customReminderDate}
                onChange={(event) => setCustomReminderDate(event.target.value)}
                aria-label="Reminder date"
              />
              <div className="lo-task-details-divider" />
              <div className="lo-task-details-due-menu__title">Time Picker</div>
              <div className="lo-task-details-reminder-picker__times">
                {reminderHours.map((hour) => (
                  <button
                    key={hour.value}
                    type="button"
                    className={
                      customReminderTime === hour.value ? "is-active" : ""
                    }
                    onClick={() => setCustomReminderTime(hour.value)}
                  >
                    {hour.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="lo-task-details-reminder-picker__save"
                onClick={saveCustomReminder}
              >
                Save
              </button>
            </div>
          ) : null}

          <div className="lo-task-details-card">
            <div className={`lo-task-details-action-wrap ${hasTag ? "has-remove" : ""}`}>
              <button
                type="button"
                className={`lo-task-details-action ${hasTag ? "is-active lo-task-details-action--has-remove" : ""}`}
                onClick={() => onToggleTag(task)}
              >
                <img src="/icons/white/tags.png" alt="" />
                <span>Tag</span>
              </button>
              {hasTag ? (
                <button
                  type="button"
                  className="lo-task-details-action-remove"
                  onClick={clearTag}
                  aria-label="Remove tag"
                  title="Remove tag"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          <div className="lo-task-details-card">
            <button type="button" className="lo-task-details-action">
              <img src="/icons/white/clip.png" alt="" />
              <span>Add file</span>
            </button>
          </div>

          <textarea
            className="lo-task-details-note"
            value={task.notes ?? ""}
            onChange={(event) => onUpdateNotes(task, event.target.value)}
            placeholder="add note"
            aria-label="Task note"
          />
        </div>

        <footer className="lo-task-details-panel__footer">
          <button
            type="button"
            className="lo-task-details-footer-btn"
            onClick={onClose}
            aria-label="Hide details view"
            title="Hide details view"
          >
            <img src="/icons/white/hide.png" alt="" />
          </button>

          <span className="lo-task-details-created">
            {formatCreatedDate(task.createdAt)}
          </span>

          <button
            type="button"
            className="lo-task-details-footer-btn is-danger"
            onClick={() => onDelete(task)}
            aria-label="Delete task"
            title="Delete task"
          >
            <img src={DELETE_ICON} alt="" />
          </button>
        </footer>
      </aside>
    </div>
  );
}

function SuggestionGroup({
  title,
  tasks,
  onAddToMyDay,
  onComplete,
}: {
  title: string;
  tasks: Task[];
  onAddToMyDay: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  return (
    <section className="lo-suggestions-group">
      <h4>{title}</h4>
      {tasks.length === 0 ? (
        <p className="lo-suggestions-group__empty">No tasks</p>
      ) : (
        <div className="lo-suggestions-group__list">
          {tasks.map((task) => (
            <div key={task.id} className="lo-suggestion-row">
              <button
                type="button"
                className="lo-suggestion-row__complete"
                aria-label={`Complete ${task.title}`}
                onClick={() => onComplete(task)}
              >
                <img src={COMPLETE_ICON} alt="" />
              </button>

              <span className="lo-suggestion-row__title" title={task.title}>
                {task.title}
              </span>

              <button
                type="button"
                className="lo-suggestion-row__add"
                aria-label={`Add ${task.title} to My Day`}
                onClick={() => onAddToMyDay(task)}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const BoardTaskContextMenu = React.forwardRef<
  HTMLDivElement,
  {
    menu: BoardTaskMenuState;
    todayISO: string;
    customLists: string[];
    onAction: (action: () => void) => void;
    onToggleMyDay: (task: Task) => void;
    onToggleImportant: (task: Task) => void;
    onToggleCompleted: (task: Task) => void;
    onDueToday: (task: Task) => void;
    onDueTomorrow: (task: Task) => void;
    onRemoveDue: (task: Task) => void;
    onCreateList: (task: Task) => void;
    onMoveToList: (task: Task, list: string) => void;
    onCopyToList: (task: Task, list: string) => void;
    onDelete: (task: Task) => void;
  }
>(function BoardTaskContextMenu(
  {
    menu,
    todayISO,
    customLists,
    onAction,
    onToggleMyDay,
    onToggleImportant,
    onToggleCompleted,
    onDueToday,
    onDueTomorrow,
    onRemoveDue,
    onCreateList,
    onMoveToList,
    onCopyToList,
    onDelete,
  },
  ref,
) {
  const task = menu.task;
  const isInMyDay = isTaskInMyDay(task, todayISO);
  const hasDueDate = !!(task.dueDate || task.plannedFor || task.plannedStart || task.plannedEnd);

  return (
    <div
      ref={ref}
      className="lo-task-menu lo-board-task-menu"
      role="menu"
      style={{
        position: "fixed",
        top: menu.y,
        left: menu.x,
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <BoardMenuButton
        icon={PLAN_SIDEBAR_ICONS["my-day"]}
        label={isInMyDay ? "Remove from My Day" : "Add to My Day"}
        onClick={() => onAction(() => onToggleMyDay(task))}
      />
      <BoardMenuButton
        icon={PLAN_SIDEBAR_ICONS.important}
        label={task.important ? "Remove importance" : "Mark as important"}
        onClick={() => onAction(() => onToggleImportant(task))}
      />
      <BoardMenuButton
        icon={COMPLETE_ICON}
        label={task.status === "done" ? "Remove completed" : "Mark as completed"}
        onClick={() => onAction(() => onToggleCompleted(task))}
      />

      <div className="lo-task-menu__divider" />

      <BoardMenuButton
        icon={PLAN_SIDEBAR_ICONS.planned}
        label="Due today"
        onClick={() => onAction(() => onDueToday(task))}
      />
      <BoardMenuButton
        icon={PLAN_SIDEBAR_ICONS.planned}
        label="Due tomorrow"
        onClick={() => onAction(() => onDueTomorrow(task))}
      />
      {hasDueDate ? (
        <BoardMenuButton
          icon={REMOVE_DUE_ICON}
          label="Remove due date"
          onClick={() => onAction(() => onRemoveDue(task))}
        />
      ) : null}

      <div className="lo-task-menu__divider" />

      <BoardMenuButton
        icon={CUSTOM_LIST_ICON}
        label="Create new list from this task"
        onClick={() => onAction(() => onCreateList(task))}
      />

      <BoardMenuGroup
        icon={CUSTOM_LIST_ICON}
        label="Move task to..."
        emptyLabel="No custom lists yet"
        lists={customLists}
        onChoose={(list) => onAction(() => onMoveToList(task, list))}
      />

      <BoardMenuGroup
        icon={CUSTOM_LIST_ICON}
        label="Copy task to..."
        emptyLabel="No custom lists yet"
        lists={customLists}
        onChoose={(list) => onAction(() => onCopyToList(task, list))}
      />

      <div className="lo-task-menu__divider" />

      <BoardMenuButton
        icon={DELETE_ICON}
        label="Delete task"
        isDanger
        onClick={() => onAction(() => onDelete(task))}
      />
    </div>
  );
});

function BoardMenuButton({
  icon,
  label,
  isDanger = false,
  disabled = false,
  onClick,
}: {
  icon: string;
  label: string;
  isDanger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`lo-task-menu__item ${isDanger ? "is-danger" : ""}`}
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
    >
      <img className="lo-task-menu__icon" src={icon} alt="" />
      <span>{label}</span>
    </button>
  );
}

function BoardMenuGroup({
  icon,
  label,
  lists,
  emptyLabel,
  onChoose,
}: {
  icon: string;
  label: string;
  lists: string[];
  emptyLabel: string;
  onChoose: (list: string) => void;
}) {
  return (
    <div className="lo-task-menu__group lo-task-menu__group--submenu">
      <button type="button" className="lo-task-menu__submenu-trigger">
        <img className="lo-task-menu__icon" src={icon} alt="" />
        <span>{label}</span>
        <span className="lo-task-menu__submenu-caret" aria-hidden="true">
          {">"}
        </span>
      </button>
      <div className="lo-task-menu__submenu" role="menu">
        {lists.length > 0 ? (
          lists.map((list) => (
              <button
                key={list}
                type="button"
                className="lo-task-menu__item"
                role="menuitem"
                onClick={() => onChoose(list)}
              >
                <img className="lo-task-menu__icon" src={CUSTOM_LIST_ICON} alt="" />
                <span>{labelForList(list)}</span>
              </button>
            ))
        ) : (
          <div className="lo-task-menu__empty">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

function PlannedTaskGroup({
  title,
  tasks,
  isOpen,
  justAddedId,
  onToggle,
  onToggleDone,
  onRemove,
  onSetDue,
  onSetPriority,
  onSetImportant,
  onOpenTaskMenu,
  onOpenTaskDetails,
}: {
  title: string;
  tasks: Task[];
  isOpen: boolean;
  justAddedId: string | null;
  onToggle: () => void;
  onToggleDone: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSetDue: (task: Task, dueDate: string) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onSetImportant: (task: Task, important: boolean) => void;
  onOpenTaskMenu: (e: React.MouseEvent, task: Task) => void;
  onOpenTaskDetails: (task: Task) => void;
}) {
  return (
    <section className="lo-planned-group lo-stack">
      <button
        type="button"
        className="lo-planned-group__toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="lo-planned-group__count">{tasks.length}</span>
        <span
          className={`lo-planned-group__chevron ${isOpen ? "is-open" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <TaskSection
          title={title}
          showTitle={false}
          tasks={tasks}
          justAddedId={justAddedId}
          onToggleDone={onToggleDone}
          onRemove={onRemove}
          onSetDue={onSetDue}
          onSetPriority={onSetPriority}
          onSetImportant={onSetImportant}
          onOpenTaskMenu={onOpenTaskMenu}
          onOpenTaskDetails={onOpenTaskDetails}
        />
      ) : null}
    </section>
  );
}

function TaskSection({
  title,
  showTitle = true,
  tasks,
  justAddedId,
  onToggleDone,
  onRemove,
  onSetDue,
  onSetPriority,
  onSetImportant,
  onOpenTaskMenu,
  onOpenTaskDetails,
}: {
  title: string;
  showTitle?: boolean;
  tasks: Task[];
  justAddedId: string | null;
  onToggleDone: (task: Task) => void;
  onRemove: (task: Task) => void;
  onSetDue: (task: Task, dueDate: string) => void;
  onSetPriority: (task: Task, p: Priority) => void;
  onSetImportant: (task: Task, important: boolean) => void;
  onOpenTaskMenu: (e: React.MouseEvent, task: Task) => void;
  onOpenTaskDetails: (task: Task) => void;
}) {

  return (
    <section className="lo-stack">
      <div className="lo-tasklist lo-stack">
        {tasks.map((task) => {
          const isNew = task.id === justAddedId;
          const listLabel = labelForTaskList(task);
          const reminderLabel = formatReminderDisplay(task.reminderAt);
          const repeatRuleLabel = repeatLabel(task.repeatRule);
          const overdue = isTaskOverdue(task);
          const dueDateLabel = formatDueDateDisplay(getTaskDateKey(task), {
            overdue,
          });
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
              onClick={() => onOpenTaskDetails(task)}
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
                <button
                  type="button"
                  className={`lo-task-check ${task.status === "done" ? "is-checked" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDone(task);
                  }}
                  aria-pressed={task.status === "done"}
                  aria-label={
                    task.status === "done" ? "Mark not done" : "Mark done"
                  }
                >
                  <img src="/icons/white/circle.png" alt="" />
                </button>

                <div className="lo-task-title-wrap">
                  <div
                    className={`lo-task-title ${task.status === "done" ? "is-done" : ""}`}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                  {listLabel || dueDateLabel || reminderLabel || repeatRuleLabel ? (
                    <div className="lo-task-meta-subtitle">
                      {listLabel ? (
                        <span className="lo-task-list-subtitle">
                          {listLabel}
                        </span>
                      ) : null}
                      {listLabel && (dueDateLabel || reminderLabel || repeatRuleLabel) ? (
                        <span className="lo-task-meta-subtitle__dot" aria-hidden="true" />
                      ) : null}
                      {dueDateLabel ? (
                        <span className={`lo-task-due-subtitle ${overdue ? "is-overdue" : ""}`}>
                          <img src={PLAN_SIDEBAR_ICONS.planned} alt="" />
                          <span>{dueDateLabel}</span>
                        </span>
                      ) : null}
                      {dueDateLabel && (reminderLabel || repeatRuleLabel) ? (
                        <span className="lo-task-meta-subtitle__dot" aria-hidden="true" />
                      ) : null}
                      {reminderLabel ? (
                        <span className="lo-task-reminder-subtitle">
                          <img src="/icons/white/alarm.png" alt="" />
                          <span>{reminderLabel}</span>
                        </span>
                      ) : null}
                      {reminderLabel && repeatRuleLabel ? (
                        <span className="lo-task-meta-subtitle__dot" aria-hidden="true" />
                      ) : null}
                      {repeatRuleLabel ? (
                        <span
                          className="lo-task-repeat-subtitle"
                          aria-label={`Repeats ${repeatRuleLabel}`}
                          title={`Repeats ${repeatRuleLabel}`}
                        >
                          <img src="/icons/white/repeat.png" alt="" />
                        </span>
                      ) : null}
                    </div>
                  ) : null}
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
                  <img
                    src={
                      task.important
                        ? "/icons/white/star-filled.png"
                        : "/icons/white/star.png"
                    }
                    alt=""
                  />
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
            </Card>
          );
        })}
      </div>
    </section>
  );
}
