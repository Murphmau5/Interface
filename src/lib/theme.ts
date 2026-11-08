export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export const THEME_MODE_STORAGE_KEY = "ui.themeMode";

export function systemPrefersLight(): boolean {
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersLight() ? "light" : "dark";
  return mode;
}

export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function readCachedThemeMode(): ThemeMode {
  try {
    const cached = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (cached === "dark" || cached === "light" || cached === "system") return cached;
  } catch {
    // localStorage 不可用时回退到跟随系统，不构成错误
  }
  return "system";
}

export function cacheThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // 缓存仅用于首屏防闪，写入失败不影响数据库中的真实值
  }
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: light)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
