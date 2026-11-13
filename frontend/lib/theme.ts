import type { Theme } from "./theme-store";

/** Resolves the effective light/dark theme for a stored theme preference. */
export function getEffectiveTheme(theme: Theme): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

/** Applies the resolved theme to the document root via data-theme attribute. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = getEffectiveTheme(theme);
}
