import type { Task } from "../types/task";

const KEY = "lifeos_tasks_v1";

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix = "t") {
  return `${prefix}_${crypto.randomUUID()}`;
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

export function createTask(partial: Pick<Task, "title"> & Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Task {
  const task: Task = {
    id: uid(),
    title: partial.title.trim(),
    notes: partial.notes ?? "",
    status: partial.status ?? "todo",
    priority: partial.priority ?? 2,
    dueDate: partial.dueDate,
    projectId: partial.projectId ?? null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  const tasks = loadTasks();
  tasks.unshift(task);
  saveTasks(tasks);
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