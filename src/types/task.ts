export type TaskStatus = "todo" | "doing" | "done";

export type TaskPriority = 1 | 2 | 3; // 1=High, 2=Med, 3=Low

export type Task = {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string; // ISO date: "2026-02-26"
  projectId?: string | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
};