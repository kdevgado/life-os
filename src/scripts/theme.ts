const KEY = "lifeos_theme";

export function getTheme(): string {
  return localStorage.getItem(KEY) || "duna";
}

export function setTheme(theme: string) {
  localStorage.setItem(KEY, theme);

  // default is duna (no attribute)
  if (theme === "duna") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}