import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Blocks,
  Bot,
  ChevronLeft,
  FolderPlus,
  History,
  Palette,
  Radar,
  Settings,
  Star,
  SwatchBook,
  type LucideIcon,
} from "lucide-react";

import { Resizer } from "@/components/ui/Resizer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TitleBar } from "@/components/layout/TitleBar";
import { ThemeController } from "@/app/ThemeController";
import { CommandPalette } from "@/features/commands/CommandPalette";
import { OnboardingGate } from "@/features/onboarding/OnboardingGuide";
import { useAppInfo, useSettings, useSetSetting } from "@/features/settings/api";
import { useCaseCounts, useCatalog, useCollections, useCreateCollection, useViewCounts } from "@/features/cases/api";
import { runCaseAction } from "@/lib/caseActions";
import { PANEL_LIMITS, SETTINGS_KEYS, type CaseKind } from "@/lib/constants";
import {
  CONTENT_SECTION_KEYS,
  NAV_SECTIONS,
  TOOL_SECTION_KEYS,
  type NavSectionKey,
} from "@/lib/navigation";
import { isEditableTarget } from "@/lib/shortcuts";
import { useUiStore } from "@/stores/uiStore";

const SECTION_ICONS: Record<NavSectionKey, LucideIcon> = {
  style: Palette,
  motion: Activity,
  feedback: Bell,
  component: Blocks,
  theme: SwatchBook,
  workspace: Bot,
  discovery: Radar,
  settings: Settings,
};

function readStoredWidth(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function SectionButton({
  sectionKey,
  active,
  count,
  onOpen,
}: {
  sectionKey: NavSectionKey;
  active: boolean;
  count: number | null;
  onOpen: (key: NavSectionKey) => void;
}) {
  const section = NAV_SECTIONS[sectionKey];
  const Icon = SECTION_ICONS[sectionKey];

  return (
    <button
      type="button"
      onClick={() => onOpen(sectionKey)}
      aria-current={active ? "page" : undefined}
      data-active={active}
      className="rail-item focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
    >
      <Icon aria-hidden size={15} strokeWidth={1.7} className="rail-icon" />
      <span className="truncate">{section.label}</span>
      {section.unavailable ? (
        <span className="rail-badge">未接入</span>
      ) : count !== null ? (
        <span className="rail-count">{count}</span>
      ) : null}
    </button>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const leftWidth = useUiStore((state) => state.leftWidth);
  const setLeftWidth = useUiStore((state) => state.setLeftWidth);
  const navOpen = useUiStore((state) => state.navOpen);
  const activeSection = useUiStore((state) => state.activeSection);
  const categoryBySection = useUiStore((state) => state.categoryBySection);
  const openNavSection = useUiStore((state) => state.openNavSection);
  const closeNavSection = useUiStore((state) => state.closeNavSection);
  const paletteOpen = useUiStore((state) => state.paletteOpen);
  const selectCategory = useUiStore((state) => state.selectCategory);
  const clearCategory = useUiStore((state) => state.clearCategory);
  const settings = useSettings();
  const setSetting = useSetSetting();
  const counts = useCaseCounts();
  const catalog = useCatalog();
  const viewCounts = useViewCounts();
  const collections = useCollections();
  const createCollection = useCreateCollection();
  const activeCollectionId = useUiStore((state) => state.activeCollectionId);
  const setActiveCollection = useUiStore((state) => state.setActiveCollection);
  const [addingCollection, setAddingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const appInfo = useAppInfo();
  const hydrated = useRef(false);
  const rootNavRef = useRef<HTMLDivElement | null>(null);
  const secondaryNavRef = useRef<HTMLDivElement | null>(null);
  const savedScrollRef = useRef(0);

  useEffect(() => {
    if (hydrated.current || !settings.data) return;
    hydrated.current = true;
    setLeftWidth(
      readStoredWidth(
        settings.data[SETTINGS_KEYS.leftWidth],
        leftWidth,
        PANEL_LIMITS.left.min,
        PANEL_LIMITS.left.max,
      ),
    );
  }, [leftWidth, setLeftWidth, settings.data]);

  // 返回时还原一级导航的滚动位置
  useEffect(() => {
    if (navOpen) return;
    const nav = rootNavRef.current;
    if (nav) nav.scrollTop = savedScrollRef.current;
  }, [navOpen]);

  // 进入二级面板时，二级列表从顶部开始
  useEffect(() => {
    if (!navOpen) return;
    const nav = secondaryNavRef.current;
    if (nav) nav.scrollTop = 0;
  }, [navOpen, activeSection]);

  // Esc / Alt+← 返回：先清类目，再关面板；栈深上限 2 层，二级面板内不再推入
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (useUiStore.getState().onboardingOpen) return;
      if (event.key === "Escape" || (event.altKey && event.key === "ArrowLeft")) {
        event.preventDefault();
        if (activeSection && categoryBySection[activeSection]) {
          clearCategory(activeSection);
          return;
        }
        closeNavSection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen, activeSection, categoryBySection, clearCategory, closeNavSection]);

  // 全局快捷键：命令面板、聚焦搜索、新建与导出
  useEffect(() => {
    const focusSearch = (): boolean => {
      const target = document.querySelector<HTMLInputElement>("[data-search-input]");
      if (target) {
        target.focus();
        target.select();
        return true;
      }
      // 当前页没有搜索框时落到案例库，等挂载后再聚焦
      navigate("/library");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const late = document.querySelector<HTMLInputElement>("[data-search-input]");
          late?.focus();
          late?.select();
        });
      });
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // 引导是模态遮罩，键位交给它自己处理
      if (useUiStore.getState().onboardingOpen) return;

      if (modifier && key === "k") {
        event.preventDefault();
        const store = useUiStore.getState();
        if (store.paletteOpen) store.closePalette();
        else store.openPalette();
        return;
      }

      // 面板打开时所有按键由面板自己处理
      if (useUiStore.getState().paletteOpen) return;

      if (modifier && key === "f") {
        if (focusSearch()) event.preventDefault();
        return;
      }

      if (!modifier && !event.altKey && !event.shiftKey && event.key === "/") {
        if (isEditableTarget(event.target)) return;
        if (focusSearch()) event.preventDefault();
        return;
      }

      if (modifier && key === "n") {
        event.preventDefault();
        if (runCaseAction("createCase")) return;
        const filterKind = useUiStore.getState().filters.kind;
        const kind = (filterKind === "all" ? "style" : filterKind) as CaseKind;
        useUiStore.getState().requestCreate(kind);
        navigate(NAV_SECTIONS[kind as NavSectionKey].route);
        return;
      }

      if (modifier && key === "e") {
        if (runCaseAction("exportCurrent")) event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const commitLeftWidth = (width: number) => {
    setSetting.mutate(
      { key: SETTINGS_KEYS.leftWidth, value: String(width) },
      {
        onError: (error) => {
          console.warn("左栏宽度未能写入 settings：", error.message);
        },
      },
    );
  };

  const openSection = (key: NavSectionKey) => {
    const nav = rootNavRef.current;
    savedScrollRef.current = nav ? nav.scrollTop : 0;
    const section = NAV_SECTIONS[key];
    if (location.pathname !== section.route) navigate(section.route);
    // 设置页自带分组栏，再展开二级导航会变成三层，直接留在设置页
    if (key === "settings") {
      closeNavSection();
      return;
    }
    openNavSection(key);
  };

  const chooseCategory = (sectionKey: NavSectionKey, categoryId: string) => {
    selectCategory(sectionKey, categoryId);
    // 第三层不推入：直接落到中栏列表
    window.requestAnimationFrame(() => {
      document.getElementById("content-list")?.focus();
    });
  };

  const section = activeSection ? NAV_SECTIONS[activeSection] : null;
  const kindCounts = counts.data;
  const domainCatalog = activeSection
    ? catalog.data?.find((domain) => domain.domain === NAV_SECTIONS[activeSection]?.kind)
    : undefined;
  const secondaryGroups = domainCatalog?.groups ?? section?.groups ?? [];
  const sectionTotal = domainCatalog?.total
    ?? (section?.kind ? kindCounts?.[section.kind] ?? 0 : null);

  const countFor = (key: NavSectionKey): number | null => {
    const kind = NAV_SECTIONS[key].kind;
    if (!kind) return null;
    return kindCounts?.[kind] ?? 0;
  };

  const openCollection = (id: string) => {
    setActiveCollection(id);
    closeNavSection();
    if (location.pathname !== "/library") navigate("/library");
    window.requestAnimationFrame(() => {
      document.getElementById("content-list")?.focus();
    });
  };

  const submitCollection = (event: React.FormEvent) => {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name) return;
    createCollection.mutate(name, {
      onSuccess: (row) => {
        setCollectionName("");
        setAddingCollection(false);
        setCollectionError(null);
        openCollection(row.id);
      },
      onError: (error) => setCollectionError(error.message),
    });
  };

  const groupTotal = (keys: NavSectionKey[]) =>
    keys.reduce((sum, key) => sum + (countFor(key) ?? 0), 0);
  const contentTotal = groupTotal(CONTENT_SECTION_KEYS);
  const toolTotal = groupTotal(TOOL_SECTION_KEYS);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <ThemeController />
      <TitleBar railWidth={leftWidth} />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <aside style={{ width: leftWidth }} className="flex min-h-0 shrink-0 flex-col bg-raised">
        <div className="nav-stack">
          {/* 一级层：内容域 + 工具位 + 收藏/最近 */}
          <div
            className="nav-layer"
            data-state={navOpen ? "root-out" : "active"}
            inert={navOpen}
            aria-hidden={navOpen}
          >
            <div ref={rootNavRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              <div className="rail-group">
                <div className="rail-group-label">
                  <span className="label-eyebrow">内容域</span>
                  {contentTotal > 0 ? (
                    <span className="rail-group-total">{contentTotal} 条</span>
                  ) : null}
                </div>
                {CONTENT_SECTION_KEYS.map((key) => (
                  <SectionButton
                    key={key}
                    sectionKey={key}
                    active={location.pathname === NAV_SECTIONS[key].route}
                    count={countFor(key)}
                    onOpen={openSection}
                  />
                ))}
              </div>

              <div className="rail-divider" />

              <div className="rail-group">
                <div className="rail-group-label">
                  <span className="label-eyebrow">工具位</span>
                  {toolTotal > 0 ? <span className="rail-group-total">{toolTotal} 条</span> : null}
                </div>
                {TOOL_SECTION_KEYS.map((key) => (
                  <SectionButton
                    key={key}
                    sectionKey={key}
                    active={location.pathname === NAV_SECTIONS[key].route}
                    count={countFor(key)}
                    onOpen={openSection}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-line px-2 pb-2 pt-2">
              <div className="flex items-center gap-2 px-2.5 pb-1.5">
                <span className="label-eyebrow">合集</span>
                <span className="rail-group-total">{collections.data?.length ?? 0}</span>
                <button
                  type="button"
                  aria-label={addingCollection ? "收起新建合集" : "新建合集"}
                  aria-expanded={addingCollection}
                  onClick={() => {
                    setAddingCollection((value) => !value);
                    setCollectionError(null);
                  }}
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded-xs text-ink-faint transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                >
                  <FolderPlus size={12} strokeWidth={1.8} aria-hidden />
                </button>
              </div>

              {addingCollection ? (
                <form onSubmit={submitCollection} className="flex items-center gap-1.5 px-1.5 pb-1.5">
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label="合集名称"
                      value={collectionName}
                      maxLength={24}
                      placeholder="合集名称"
                      onChange={(event) => {
                        setCollectionName(event.target.value);
                        if (collectionError) setCollectionError(null);
                      }}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createCollection.isPending || !collectionName.trim()}
                  >
                    建
                  </Button>
                </form>
              ) : null}

              {collectionError ? (
                <p role="alert" className="px-2.5 pb-1 text-2xs leading-normal text-danger">
                  {collectionError}
                </p>
              ) : null}

              <div className="max-h-28 overflow-y-auto">
                {collections.data?.length ? (
                  collections.data.map((entry) => {
                    const selected = entry.id === activeCollectionId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={selected}
                        data-active={selected}
                        onClick={() => openCollection(entry.id)}
                        className="rail-item rail-item-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                      >
                        <span className="truncate">{entry.name}</span>
                        <span className="rail-count">{entry.count}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-2.5 py-1 text-2xs text-ink-faint">还没有合集</p>
                )}
              </div>

              <div className="mt-2">
                <div className="quick-grid">
                  {[
                    {
                      to: "/favorites",
                      label: "收藏",
                      icon: Star,
                      count: viewCounts.data?.favorites ?? null,
                    },
                    {
                      to: "/recent",
                      label: "最近使用",
                      icon: History,
                      count: viewCounts.data?.recent ?? null,
                    },
                  ].map(({ to, label, icon: Icon, count }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end
                      onClick={closeNavSection}
                      className="quick-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                    >
                      <span className="quick-tile-head">
                        <Icon className="quick-tile-icon" aria-hidden size={12} strokeWidth={1.8} />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="quick-tile-value">{count ?? "—"}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-line px-3 py-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-accent" />
              <span className="text-2xs text-ink-faint">本地库 · SQLite</span>
              <span className="ml-auto font-mono text-2xs text-ink-faint">
                v{appInfo.data?.appVersion ?? "1.0.9"}
              </span>
            </div>
          </div>

          {/* 二级层：域名 + 分组类目（栈深上限 2） */}
          <div
            className="nav-layer"
            data-state={navOpen ? "active" : "secondary-out"}
            inert={!navOpen}
            aria-hidden={!navOpen}
          >
            <div className="border-b border-line px-2.5 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeNavSection}
                  className="rail-item rail-item-sm w-auto pr-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                >
                  <ChevronLeft size={13} strokeWidth={2} aria-hidden className="rail-icon" />
                  <span>返回</span>
                </button>
                {sectionTotal !== null ? (
                  <span className="rail-count ml-auto">{sectionTotal}</span>
                ) : section?.unavailable ? (
                  <span className="rail-badge ml-auto">规划中</span>
                ) : null}
              </div>
              <div className="mt-2 flex items-baseline gap-2 px-1">
                <span className="label-eyebrow">二级导航</span>
                <span className="truncate text-sm font-semibold text-ink">
                  {section?.label ?? "—"}
                </span>
              </div>
            </div>

            <div ref={secondaryNavRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              {activeSection && NAV_SECTIONS[activeSection].kind && catalog.isLoading ? (
                <p className="px-2 py-1 text-meta text-ink-faint">类目加载中…</p>
              ) : null}
              {activeSection && NAV_SECTIONS[activeSection].kind && catalog.isError ? (
                <div className="px-2 py-1">
                  <p className="text-meta text-danger">类目加载失败</p>
                  <button
                    type="button"
                    onClick={() => void catalog.refetch()}
                    className="mt-1 text-meta text-ink-soft underline decoration-line-strong underline-offset-2 hover:text-ink"
                  >
                    重试
                  </button>
                </div>
              ) : null}

              {secondaryGroups.map((group) => (
                <div key={group.label} className="rail-group mb-4">
                  <div className="rail-group-label">
                    <span className="label-eyebrow">{group.label}</span>
                  </div>
                  {group.categories.map((category) => {
                    const selected =
                      activeSection !== null &&
                      categoryBySection[activeSection] === category.id;
                    const count =
                      "count" in category ? (category as { count: number }).count : null;
                    const note =
                      "note" in category
                        ? (category as { note?: string }).note
                        : undefined;
                    return (
                      <div key={category.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          data-active={selected}
                          onClick={() =>
                            activeSection && chooseCategory(activeSection, category.id)
                          }
                          className="rail-item rail-item-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                        >
                          <span className="truncate">{category.label}</span>
                          <span className="rail-count">{count ?? "—"}</span>
                        </button>
                        {count === 0 && note ? (
                          <p className="px-2 pb-1.5 text-2xs leading-snug text-ink-faint">
                            {note}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}

              {activeSection && !catalog.isLoading && secondaryGroups.length === 0 ? (
                <p className="px-2 py-1 text-meta text-ink-faint">该域暂无类目。</p>
              ) : null}
            </div>

            <div className="border-t border-line px-3 py-2.5">
              <p className="text-2xs leading-normal text-ink-faint">{section?.footnote}</p>
              <p className="mt-1 text-2xs leading-normal text-ink-faint">
                Esc 逐级返回 · 类目直接筛选中栏
              </p>
            </div>
          </div>
        </div>
      </aside>

      <Resizer
        label="左栏宽度"
        value={leftWidth}
        min={PANEL_LIMITS.left.min}
        max={PANEL_LIMITS.left.max}
        onChange={setLeftWidth}
        onCommit={commitLeftWidth}
      />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
      {paletteOpen ? <CommandPalette /> : null}
      <OnboardingGate />
    </div>
  );
}