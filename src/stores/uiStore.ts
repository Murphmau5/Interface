import { create } from "zustand";

import {
  DEFAULT_FILTERS,
  DEFAULT_LAYOUT,
  type CaseFilters,
  type CaseKind,
  type ListView,
} from "@/lib/constants";
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
  filters: CaseFilters;
  viewMode: ListView;
  activeCollectionId: string | null;
  paletteOpen: boolean;
  /** 命令面板跨路由打开案例的一次性请求 */
  pendingCaseId: string | null;
  /** 命令面板跨路由新建案例的一次性请求 */
  pendingCreateKind: CaseKind | null;
  setThemeMode: (mode: ThemeMode) => void;
  syncResolvedTheme: (resolved: ResolvedTheme) => void;
  setReduceMotion: (value: boolean) => void;
  setLeftWidth: (width: number) => void;
  setMiddleWidth: (width: number) => void;
  resetLayout: () => void;
  setFilter: <K extends keyof CaseFilters>(key: K, value: CaseFilters[K]) => void;
  resetFilters: () => void;
  setViewMode: (view: ListView) => void;
  setActiveCollection: (id: string | null) => void;
  openPalette: () => void;
  closePalette: () => void;
  requestOpenCase: (id: string) => void;
  clearPendingCase: () => void;
  requestCreate: (kind: CaseKind) => void;
  clearPendingCreate: () => void;
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
  filters: DEFAULT_FILTERS,
  viewMode: "grid",
  activeCollectionId: null,
  paletteOpen: false,
  pendingCaseId: null,
  pendingCreateKind: null,

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

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setViewMode: (view) => set({ viewMode: view }),
  setActiveCollection: (id) => set({ activeCollectionId: id }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  requestOpenCase: (id) => set({ pendingCaseId: id }),
  clearPendingCase: () => set({ pendingCaseId: null }),
  requestCreate: (kind) => set({ pendingCreateKind: kind }),
  clearPendingCreate: () => set({ pendingCreateKind: null }),

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
