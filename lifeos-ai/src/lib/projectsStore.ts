import type { Project } from "../types/project";

const KEY = "lifeos_projects_v1";

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix = "p") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Project[];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function createProject(name: string, description = ""): Project {
  const project: Project = {
    id: uid(),
    name: name.trim(),
    description,
    status: "active",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  const projects = loadProjects();
  projects.unshift(project);
  saveProjects(projects);
  return project;
}

export function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Project | null {
  const projects = loadProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const updated: Project = { ...projects[idx], ...patch, updatedAt: nowISO() };
  projects[idx] = updated;
  saveProjects(projects);
  return updated;
}

export function deleteProject(id: string) {
  saveProjects(loadProjects().filter(p => p.id !== id));
}