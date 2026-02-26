export type ProjectStatus = "active" | "paused" | "completed";

export type Project = {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};