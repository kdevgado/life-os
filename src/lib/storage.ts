const LEGACY_KEY = "life_os_v1";
const KEY = "lifeos_planner_v1";

export type Stored<T> = {
  version: 1;
  updatedAt: string;
  data: T;
};

export function load<T>(fallback: T, key = KEY): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw && key === KEY) {
      return loadFromKey(LEGACY_KEY, fallback);
    }
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (parsed?.version !== 1) return fallback;
    return parsed.data ?? fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(data: T, key = KEY) {
  const payload: Stored<T> = { version: 1, updatedAt: new Date().toISOString(), data };
  localStorage.setItem(key, JSON.stringify(payload));
}

export function clear(key = KEY) {
  localStorage.removeItem(key);
}

export const STORAGE_KEY = KEY;
export const LEGACY_STORAGE_KEY = LEGACY_KEY;

export function plannerStorageKey(userId?: string | null) {
  return userId ? `${KEY}:${userId}` : KEY;
}

function loadFromKey<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (parsed?.version !== 1) return fallback;
    return parsed.data ?? fallback;
  } catch {
    return fallback;
  }
}
