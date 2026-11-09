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
import { useAppInfo, useSettings, useSetSetting } from "@/features/settings/api";
import { useCaseCounts, useCatalog, useCollections, useCreateCollection, useViewCounts } from "@/features/cases/api";
import { PANEL_LIMITS, SETTINGS_KEYS } from "@/lib/constants";
import {
  CONTENT_SECTION_KEYS,
  NAV_SECTIONS,
  TOOL_SECTION_KEYS,
  type NavSectionKey,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";
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
      className={cn(
        "group relative flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line",
        active ? "bg-accent-soft text-ink" : "text-ink-soft hover:bg-surface hover:text-ink",
      )}
    >
      {active ? (
        <span aria-hidden className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 rounded-pill bg-accent" />
      ) : null}
      <Icon
        aria-hidden
        size={15}
        strokeWidth={1.7}
        className={active ? "text-accent" : "text-ink-faint group-hover:text-ink-soft"}
      />
      <span className="truncate">{section.label}</span>
      {section.unavailable ? (
        <span className="ml-auto rounded-xs border border-line px-1 py-0.5 font-mono text-2xs text-ink-faint">
          未接入
        </span>
      ) : count !== null ? (
        <span className="ml-auto font-mono text-2xs text-ink-faint">{count}</span>
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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <ThemeController />
      <TitleBar />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <aside style={{ width: leftWidth }} className="flex min-h-0 shrink-0 flex-col bg-surface">
        <div className="nav-stack">
          {/* 一级层：内容域 + 工具位 + 收藏/最近 */}
          <div
            className="nav-layer"
            data-state={navOpen ? "root-out" : "active"}
            inert={navOpen}
            aria-hidden={navOpen}
          >
            <div ref={rootNavRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
              <div className="flex flex-col gap-0.5">
                <div className="label-eyebrow px-2.5 pb-1.5">内容域</div>
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

              <div className="mt-5 flex flex-col gap-0.5">
                <div className="label-eyebrow px-2.5 pb-1.5">工具位</div>
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

            <div className="border-t border-line px-2 pb-2 pt-1.5">
              <div className="flex items-center justify-between px-2.5 pb-1">
                <span className="label-eyebrow">合集</span>
                <button
                  type="button"
                  aria-label={addingCollection ? "收起新建合集" : "新建合集"}
                  aria-expanded={addingCollection}
                  onClick={() => {
                    setAddingCollection((value) => !value);
                    setCollectionError(null);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-xs text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
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

              <div className="max-h-24 overflow-y-auto">
                {collections.data?.length ? (
                  collections.data.map((entry) => {
                    const selected = entry.id === activeCollectionId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => openCollection(entry.id)}
                        className={cn(
                          "flex h-7 w-full items-center gap-2 rounded-sm px-2.5 text-left text-meta transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line",
                          selected
                            ? "bg-accent-soft text-ink"
                            : "text-ink-soft hover:bg-surface hover:text-ink",
                        )}
                      >
                        <span className="truncate">{entry.name}</span>
                        <span className="ml-auto font-mono text-2xs text-ink-faint">
                          {entry.count}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-2.5 py-1 text-2xs text-ink-faint">还没有合集</p>
                )}
              </div>

              <div className="mt-1.5 border-t border-line pt-1.5">
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
                    className={({ isActive }) =>
                      cn(
                        "flex h-7 items-center gap-2.5 rounded-sm px-2.5 text-meta transition-colors duration-[var(--motion-fast)]",
                        isActive
                          ? "bg-accent-soft text-ink"
                          : "text-ink-soft hover:bg-surface hover:text-ink",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          aria-hidden
                          size={13}
                          strokeWidth={1.7}
                          className={isActive ? "text-accent" : "text-ink-faint"}
                        />
                        <span className="truncate">{label}</span>
                        {count !== null ? (
                          <span className="ml-auto font-mono text-2xs text-ink-faint">{count}</span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-accent" />
              <span className="text-2xs text-ink-faint">SQLite · 本地模式</span>
              <span className="ml-auto font-mono text-2xs text-ink-faint">
                v{appInfo.data?.appVersion ?? "1.0.3"}
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
            <div className="flex items-start gap-2 border-b border-line px-3 py-3">
              <button
                type="button"
                onClick={closeNavSection}
                className="mt-0.5 inline-flex h-6 items-center gap-1 rounded-xs px-1.5 text-meta text-ink-soft transition-colors duration-[var(--motion-fast)] hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
              >
                <ChevronLeft size={13} strokeWidth={2} aria-hidden /> 返回
              </button>
              <div className="min-w-0 flex-1">
                <div className="label-eyebrow">导航 · 二级</div>
                <div className="mt-0.5 truncate text-sm font-semibold text-ink">
                  {section?.label ?? "—"}
                </div>
              </div>
              {sectionTotal !== null ? (
                <span className="mt-3 shrink-0 font-mono text-2xs text-ink-faint">
                  {sectionTotal} 条
                </span>
              ) : section?.unavailable ? (
                <span className="mt-3 shrink-0 rounded-xs border border-line px-1 py-0.5 font-mono text-2xs text-ink-faint">
                  规划中
                </span>
              ) : null}
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
                <div key={group.label} className="mb-4">
                  <div className="label-eyebrow px-2 pb-1.5">{group.label}</div>
                  <div className="flex flex-col gap-0.5">
                    {group.categories.map((category) => {
                      const selected =
                        activeSection !== null &&
                        categoryBySection[activeSection] === category.id;
                      const count =
                        "count" in category ? (category as { count: number }).count : null;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => activeSection && chooseCategory(activeSection, category.id)}
                          className={cn(
                            "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-meta transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line",
                            selected
                              ? "bg-accent-soft text-ink"
                              : "text-ink-soft hover:bg-surface hover:text-ink",
                          )}
                        >
                          <span className="truncate">{category.label}</span>
                          <span className="ml-auto font-mono text-2xs text-ink-faint">
                            {count ?? "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {activeSection && !catalog.isLoading && secondaryGroups.length === 0 ? (
                <p className="px-2 py-1 text-meta text-ink-faint">该域暂无类目。</p>
              ) : null}
            </div>

            <div className="border-t border-line px-3 py-2.5">
              <p className="text-2xs leading-normal text-ink-faint">{section?.footnote}</p>
              <p className="mt-1 text-2xs leading-normal text-ink-faint">
                栈深上限 2 层：选择类目直接筛选中栏；Esc 先清类目，再按一次返回域。
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
    </div>
  );
}
