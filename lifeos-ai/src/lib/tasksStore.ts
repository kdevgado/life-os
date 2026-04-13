import type { Task } from "../types/task";

const KEY = "lifeos_tasks_v1";

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix = "t") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseTaskInput(input: string) {
  const matches = input.match(/@\w+/g) ?? [];
  const commands = matches.map((m) => m.slice(1).toLowerCase());

  const cleanTitle = input.replace(/@\w+/g, "").trim();

  let list = "inbox";
  let plannedFor: string | undefined;
  let focus = false;
  let priority: 1 | 2 | 3 = 2;
  const tags: string[] = [];

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayISO = `${yyyy}-${mm}-${dd}`;

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  for (const cmd of commands) {
    if (cmd === "work" || cmd === "personal" || cmd === "planner" || cmd === "home") {
      list = cmd;
      tags.push(cmd);
      continue;
    }

    if (cmd === "today") {
      plannedFor = todayISO;
      tags.push(cmd);
      continue;
    }

    if (cmd === "tomorrow") {
      plannedFor = tomorrowISO;
      tags.push(cmd);
      continue;
    }

    if (cmd === "focus") {
      focus = true;
      tags.push(cmd);
      continue;
    }

    if (cmd === "high") {
      priority = 1;
      tags.push(cmd);
      continue;
    }

    if (cmd === "low") {
      priority = 3;
      tags.push(cmd);
      continue;
    }

    tags.push(cmd);
  }

  return {
    title: cleanTitle,
    list,
    tags,
    focus,
    plannedFor,
    priority,
  };
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]) {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}

export function createTask(
  partial: Pick<Task, "title"> & Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>
): Task {
  const parsed = parseTaskInput(partial.title);
  const existing = loadTasks();

  const task: Task = {
    id: uid(),
    title: parsed.title || partial.title.trim(),
    notes: partial.notes ?? "",
    status: partial.status ?? "todo",
    priority: partial.priority ?? parsed.priority,
    dueDate: partial.dueDate ?? parsed.plannedFor,
    projectId: partial.projectId ?? null,
    list: partial.list ?? parsed.list,
    tags: partial.tags ?? parsed.tags,
    focus: partial.focus ?? parsed.focus,
    plannedFor: partial.plannedFor ?? parsed.plannedFor,
    sortOrder:
      partial.sortOrder ??
      (existing.length ? Math.max(...existing.map((t) => t.sortOrder ?? 0)) + 1 : 1),

    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  existing.unshift(task);
  saveTasks(existing);
  return task;
}

export function updateTask(id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): Task | null {
  const tasks = loadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const updated: Task = { ...tasks[idx], ...patch, updatedAt: nowISO() };
  tasks[idx] = updated;
  saveTasks(tasks);
  return updated;
}

export function deleteTask(id: string) {
  const tasks = loadTasks().filter(t => t.id !== id);
  saveTasks(tasks);
}

export function searchTasks(query: string): Task[] {
  const tasks = loadTasks();
  const q = query.toLowerCase().trim();

  if (!q) return tasks;

  const normalized = q.startsWith("@") ? q.slice(1) : q;

  return tasks.filter((t) => {
    const inTitle = t.title.toLowerCase().includes(normalized);
    const inList = (t.list ?? "").toLowerCase().includes(normalized);
    const inTags = (t.tags ?? []).some((tag) => tag.toLowerCase().includes(normalized));
    const inNotes = (t.notes ?? "").toLowerCase().includes(normalized);

    return inTitle || inList || inTags || inNotes;
  });
}