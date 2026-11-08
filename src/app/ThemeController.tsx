import { useEffect } from "react";

import { useSettings } from "@/features/settings/api";
import { SETTINGS_KEYS } from "@/lib/constants";
import { resolveTheme, watchSystemTheme, type ThemeMode } from "@/lib/theme";
import { useUiStore } from "@/stores/uiStore";

/**
 * 把 SQLite 中的设置同步到运行时：
 * 主题三态、减少动效、以及系统主题变化监听。
 */
export function ThemeController() {
  const settings = useSettings();
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const syncResolvedTheme = useUiStore((state) => state.syncResolvedTheme);
  const setReduceMotion = useUiStore((state) => state.setReduceMotion);

  useEffect(() => {
    if (!settings.data) return;

    const storedMode = settings.data[SETTINGS_KEYS.themeMode];
    if (storedMode === "system" || storedMode === "dark" || storedMode === "light") {
      setThemeMode(storedMode);
    } else {
      // 数据库里没有用户选择时，默认为「跟随系统」
      setThemeMode("system");
    }

    setReduceMotion(settings.data[SETTINGS_KEYS.reduceMotion] === "on");
  }, [settings.data, setReduceMotion, setThemeMode]);

  useEffect(() => {
    const apply = () => {
      syncResolvedTheme(resolveTheme(themeMode as ThemeMode));
    };
    apply();

    if (themeMode !== "system") return;
    return watchSystemTheme(apply);
  }, [themeMode, syncResolvedTheme]);

  return null;
}
