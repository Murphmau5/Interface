import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Blocks,
  Bot,
  ChevronLeft,
  History,
  Palette,
  Radar,
  Settings,
  Star,
  SwatchBook,
  type LucideIcon,
} from "lucide-react";

import { Resizer } from "@/components/ui/Resizer";
import { ThemeController } from "@/app/ThemeController";
import { useAppInfo, useSettings, useSetSetting } from "@/features/settings/api";
import { useCaseCounts } from "@/features/cases/api";
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
  const settings = useSettings();
  const setSetting = useSetSetting();
  const counts = useCaseCounts();
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

  // Esc / Alt+← 返回；栈深上限 2 层，二级面板内不再推入
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || (event.altKey && event.key === "ArrowLeft")) {
        event.preventDefault();
        closeNavSection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen, closeNavSection]);

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

  const countFor = (key: NavSectionKey): number | null => {
    const kind = NAV_SECTIONS[key].kind;
    if (!kind) return null;
    return kindCounts?.[kind] ?? 0;
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-ink">
      <ThemeController />
      <aside style={{ width: leftWidth }} className="flex min-h-0 shrink-0 flex-col bg-surface">
        <div className="nav-stack">
          {/* 一级层：内容域 + 工具位 + 收藏/最近 */}
          <div
            className="nav-layer"
            data-state={navOpen ? "root-out" : "active"}
            inert={navOpen}
            aria-hidden={navOpen}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
              <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xs border border-accent-line bg-sunken">
                <span className="block h-2.5 w-2.5 rounded-xs border border-accent bg-accent-soft" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-[0.12em] text-ink">界序</div>
                <div className="font-mono text-2xs tracking-[0.18em] text-ink-faint">INTERFACE</div>
              </div>
            </div>

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

            <div className="border-t border-line px-2 py-2">
              {[
                { to: "/favorites", label: "收藏", icon: Star },
                { to: "/recent", label: "最近使用", icon: History },
              ].map(({ to, label, icon: Icon }) => (
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
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-accent" />
              <span className="text-2xs text-ink-faint">SQLite · 本地模式</span>
              <span className="ml-auto font-mono text-2xs text-ink-faint">
                v{appInfo.data?.appVersion ?? "1.0.0"}
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
              {section?.kind ? (
                <span className="mt-3 shrink-0 font-mono text-2xs text-ink-faint">
                  {counts.data?.[section.kind] ?? 0} 条
                </span>
              ) : section?.unavailable ? (
                <span className="mt-3 shrink-0 rounded-xs border border-line px-1 py-0.5 font-mono text-2xs text-ink-faint">
                  规划中
                </span>
              ) : null}
            </div>

            <div ref={secondaryNavRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              {section?.groups.map((group) => (
                <div key={group.label} className="mb-4">
                  <div className="label-eyebrow px-2 pb-1.5">{group.label}</div>
                  <div className="flex flex-col gap-0.5">
                    {group.categories.map((category) => {
                      const selected =
                        activeSection !== null &&
                        categoryBySection[activeSection] === category.id;
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
                          <span className="ml-auto font-mono text-2xs text-ink-faint">0</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-line px-3 py-2.5">
              <p className="text-2xs leading-normal text-ink-faint">{section?.footnote}</p>
              <p className="mt-1 text-2xs leading-normal text-ink-faint">
                栈深上限 2 层：选择类目会直接聚焦中栏列表，不再推入。
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
  );
}
