// /src/scripts/theme.ts
const KEY = "lifeos_theme";
export type Theme = "duna" | "nebula";

export function getTheme(): Theme {
  const systemTheme =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "nebula"
      : "duna";
  const t = (localStorage.getItem(KEY) || systemTheme) as Theme;
  return t === "nebula" ? "nebula" : "duna";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);

  // optional: let other scripts react instantly
  window.dispatchEvent(new CustomEvent("lifeos:theme", { detail: { theme } }));
}

export function setTheme(theme: string) {
  const t: Theme = theme === "nebula" ? "nebula" : "duna";
  localStorage.setItem(KEY, t);
  applyTheme(t);
}

// run on load (important when navigating pages)
if (typeof window !== "undefined") {
  applyTheme(getTheme());
}

export function applyThemeOnLoad() {
  applyTheme(getTheme());
}
