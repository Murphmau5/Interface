import { create } from "zustand";

import { DEFAULT_LAYOUT } from "@/lib/constants";
import type { NavSectionKey } from "@/lib/navigation";
import {
  applyTheme,
  cacheThemeMode,
  readCachedThemeMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

interface UiState {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  reduceMotion: boolean;
  leftWidth: number;
  middleWidth: number;
  navOpen: boolean;
  activeSection: NavSectionKey | null;
  categoryBySection: Partial<Record<NavSectionKey, string>>;
  setThemeMode: (mode: ThemeMode) => void;
  syncResolvedTheme: (resolved: ResolvedTheme) => void;
  setReduceMotion: (value: boolean) => void;
  setLeftWidth: (width: number) => void;
  setMiddleWidth: (width: number) => void;
  resetLayout: () => void;
  openNavSection: (section: NavSectionKey) => void;
  closeNavSection: () => void;
  selectCategory: (section: NavSectionKey, categoryId: string) => void;
  clearCategory: (section: NavSectionKey) => void;
}

const cachedMode = readCachedThemeMode();
const initialResolved =
  (document.documentElement.dataset.theme as ResolvedTheme | undefined) ?? resolveTheme(cachedMode);

export const useUiStore = create<UiState>((set, get) => ({
  themeMode: cachedMode,
  resolvedTheme: initialResolved,
  reduceMotion: false,
  leftWidth: DEFAULT_LAYOUT.leftWidth,
  middleWidth: DEFAULT_LAYOUT.middleWidth,
  navOpen: false,
  activeSection: null,
  categoryBySection: {},

  setThemeMode: (mode) => {
    const resolved = resolveTheme(mode);
    applyTheme(resolved);
    cacheThemeMode(mode);
    set({ themeMode: mode, resolvedTheme: resolved });
  },

  syncResolvedTheme: (resolved) => {
    if (get().resolvedTheme === resolved) return;
    applyTheme(resolved);
    set({ resolvedTheme: resolved });
  },

  setReduceMotion: (value) => {
    document.documentElement.dataset.reduceMotion = value ? "on" : "off";
    set({ reduceMotion: value });
  },

  setLeftWidth: (width) => set({ leftWidth: width }),
  setMiddleWidth: (width) => set({ middleWidth: width }),
  resetLayout: () => set({ leftWidth: DEFAULT_LAYOUT.leftWidth, middleWidth: DEFAULT_LAYOUT.middleWidth }),

  openNavSection: (section) => set({ navOpen: true, activeSection: section }),
  closeNavSection: () => set({ navOpen: false }),
  selectCategory: (section, categoryId) =>
    set((state) => ({
      categoryBySection: { ...state.categoryBySection, [section]: categoryId },
    })),
  clearCategory: (section) =>
    set((state) => {
      const next = { ...state.categoryBySection };
      delete next[section];
      return { categoryBySection: next };
    }),
}));
