const KEY = "life_os_v1";

export type Stored<T> = {
  version: 1;
  updatedAt: string;
  data: T;
};

export function load<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (parsed?.version !== 1) return fallback;
    return parsed.data ?? fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(data: T) {
  const payload: Stored<T> = { version: 1, updatedAt: new Date().toISOString(), data };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function clear() {
  localStorage.removeItem(KEY);
}

export const STORAGE_KEY = KEY;