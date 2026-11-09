import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { useCatalog } from "@/features/cases/api";
import { useSetSetting } from "@/features/settings/api";
import { caseActions, runCaseAction } from "@/lib/caseActions";
import { CASE_KIND_LABELS, SETTINGS_KEYS, type CaseKind } from "@/lib/constants";
import { ipc, type CaseSummary } from "@/lib/ipc";
import { CONTENT_SECTION_KEYS, NAV_SECTIONS, type NavSectionKey } from "@/lib/navigation";
import { useUiStore } from "@/stores/uiStore";

type CommandGroup = "案例" | "操作" | "导航" | "类目" | "视图" | "主题";

const GROUP_ORDER: CommandGroup[] = ["案例", "操作", "导航", "类目", "视图", "主题"];

const THEME_COMMANDS: { mode: "system" | "dark" | "light"; label: string; hint: string }[] = [
  { mode: "system", label: "主题：跟随系统", hint: "system" },
  { mode: "dark", label: "主题：深色", hint: "dark" },
  { mode: "light", label: "主题：浅色", hint: "light" },
];

interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

function matches(command: Command, query: string): boolean {
  const haystack = [command.label, command.hint ?? "", command.keywords ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function CommandPalette() {
  const closePalette = useUiStore((state) => state.closePalette);
  const view = useUiStore((state) => state.viewMode);
  const setViewMode = useUiStore((state) => state.setViewMode);
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setActiveCollection = useUiStore((state) => state.setActiveCollection);
  const resetFilters = useUiStore((state) => state.resetFilters);
  const clearCategory = useUiStore((state) => state.clearCategory);
  const requestOpenCase = useUiStore((state) => state.requestOpenCase);
  const requestCreate = useUiStore((state) => state.requestCreate);
  const openNavSection = useUiStore((state) => state.openNavSection);
  const selectCategory = useUiStore((state) => state.selectCategory);

  const navigate = useNavigate();
  const catalog = useCatalog();
  const { mutate: setSetting } = useSetSetting();

  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 160);
    return () => window.clearTimeout(timer);
  }, [query]);

  const caseResults = useQuery({
    queryKey: ["cases", "palette", searchTerm],
    queryFn: () => ipc.casesQuery({ scope: "all", search: searchTerm, limit: 6 }),
    enabled: searchTerm.length > 0,
  });

  // 面板随打开挂载，这里只负责首帧聚焦与关闭时归还焦点
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      const active = document.activeElement;
      const focusStillHere =
        !active || active === document.body || (dialog?.contains(active) ?? false);
      if (focusStillHere && previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const openCase = useCallback(
    (item: CaseSummary) => {
      const sectionKey = item.kind as NavSectionKey;
      const route = NAV_SECTIONS[sectionKey]?.route ?? "/library";
      // 先清筛选与合集，否则目标案例可能不在中栏列表里，选中后详情也读不到
      resetFilters();
      clearCategory(sectionKey);
      setActiveCollection(null);
      requestOpenCase(item.id);
      navigate(route);
    },
    [resetFilters, clearCategory, setActiveCollection, requestOpenCase, navigate],
  );

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];

    if (searchTerm) {
      for (const item of caseResults.data?.items ?? []) {
        const kindLabel = CASE_KIND_LABELS[item.kind as CaseKind] ?? item.kind;
        list.push({
          id: `case:${item.id}`,
          group: "案例",
          label: item.title,
          hint: `${kindLabel}${item.summary ? ` · ${item.summary}` : ""}`,
          keywords: item.summary,
          run: () => openCase(item),
        });
      }
    }

    list.push({
      id: "action.create",
      group: "操作",
      label: "新建案例",
      hint: "Ctrl N",
      run: () => {
        if (runCaseAction("createCase")) return;
        const filterKind = useUiStore.getState().filters.kind;
        const kind = (filterKind === "all" ? "style" : filterKind) as CaseKind;
        requestCreate(kind);
        navigate(NAV_SECTIONS[kind as NavSectionKey].route);
      },
    });

    // 没有选中案例时详情页不会登记导出动作，这里就不放这条命令
    if (caseActions.exportCurrent) {
      list.push({
        id: "action.export",
        group: "操作",
        label: "导出当前案例",
        hint: "Ctrl E",
        run: () => {
          runCaseAction("exportCurrent");
        },
      });
    }

    list.push({
      id: "nav.library",
      group: "导航",
      label: "全部案例",
      hint: "库",
      run: () => {
        setActiveCollection(null);
        navigate("/library");
      },
    });

    for (const key of CONTENT_SECTION_KEYS) {
      list.push({
        id: `nav.${key}`,
        group: "导航",
        label: NAV_SECTIONS[key].label,
        hint: "内容域",
        keywords: NAV_SECTIONS[key].route,
        run: () => navigate(NAV_SECTIONS[key].route),
      });
    }

    list.push(
      {
        id: "nav.favorites",
        group: "导航",
        label: "收藏",
        hint: "视图",
        run: () => navigate("/favorites"),
      },
      {
        id: "nav.recent",
        group: "导航",
        label: "最近使用",
        hint: "视图",
        run: () => navigate("/recent"),
      },
      {
        id: "nav.settings",
        group: "导航",
        label: "设置",
        hint: "工具位",
        run: () => navigate("/settings"),
      },
    );

    for (const domain of catalog.data ?? []) {
      const sectionKey = domain.domain as NavSectionKey;
      if (!NAV_SECTIONS[sectionKey]) continue;
      for (const group of domain.groups) {
        for (const category of group.categories) {
          list.push({
            id: `category:${category.id}`,
            group: "类目",
            label: category.label,
            hint: `${NAV_SECTIONS[sectionKey].label} · ${group.label} · ${category.count}`,
            keywords: `${category.id} ${domain.domain}`,
            run: () => {
              openNavSection(sectionKey);
              selectCategory(sectionKey, category.id);
              navigate(NAV_SECTIONS[sectionKey].route);
            },
          });
        }
      }
    }

    list.push(
      {
        id: "view.grid",
        group: "视图",
        label: "切换为网格视图",
        hint: view === "grid" ? "当前" : undefined,
        run: () => setViewMode("grid"),
      },
      {
        id: "view.table",
        group: "视图",
        label: "切换为表格视图",
        hint: view === "table" ? "当前" : undefined,
        run: () => setViewMode("table"),
      },
    );

    for (const entry of THEME_COMMANDS) {
      list.push({
        id: `theme.${entry.mode}`,
        group: "主题",
        label: entry.label,
        hint: themeMode === entry.mode ? "当前" : entry.hint,
        run: () => {
          setThemeMode(entry.mode);
          setSetting({ key: SETTINGS_KEYS.themeMode, value: entry.mode });
        },
      });
    }

    return list;
  }, [
    searchTerm,
    caseResults.data,
    catalog.data,
    view,
    themeMode,
    openCase,
    navigate,
    setSetting,
    setViewMode,
    setThemeMode,
    setActiveCollection,
    requestCreate,
    openNavSection,
    selectCategory,
  ]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? commands.filter((entry) => matches(entry, normalized))
      : commands;
    return [...filtered].sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
    );
  }, [commands, query]);

  const active = visible.length ? Math.min(activeIndex, visible.length - 1) : -1;
  const activeId = active >= 0 ? `command-option-${active}` : undefined;

  // 键盘移动后把选中项滚进视口
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`command-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const execute = (command: Command | undefined) => {
    if (!command) return;
    closePalette();
    command.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) {
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
      return;
    }
    // 面板自己吞掉 Ctrl+K，这样打开状态下再按一次是关闭而不是被忽略
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (!visible.length) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const base = Math.min(current, visible.length - 1);
        return (base + delta + visible.length) % visible.length;
      });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(event.key === "Home" ? 0 : visible.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      execute(visible[active]);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // 其余按键留给输入框本身，但不允许冒泡到全局快捷键
    event.stopPropagation();
  };

  let lastGroup: CommandGroup | null = null;

  return (
    <div
      className="command-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        className="command-dialog"
        onKeyDown={onKeyDown}
      >
        <div className="command-search">
          <Search size={15} strokeWidth={1.8} aria-hidden className="command-search-icon" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="command-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="搜索案例、类目或命令"
            placeholder="搜索案例、类目、视图或命令…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <kbd className="command-kbd">Esc</kbd>
        </div>

        <div id="command-listbox" role="listbox" aria-label="可执行命令" className="command-list">
          {visible.length === 0 ? (
            <p className="command-empty">没有匹配的命令。换个关键词，或先导入案例。</p>
          ) : (
            visible.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <div key={command.id}>
                  {header ? <div className="command-group-label">{header}</div> : null}
                  <div
                    id={`command-option-${index}`}
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    className="command-item"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => execute(command)}
                  >
                    <span className="command-item-label">{command.label}</span>
                    {command.hint ? (
                      <span className="command-item-hint">{command.hint}</span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="command-foot">
          <span>↑ ↓ 选择</span>
          <span>Enter 执行</span>
          <span>Esc 关闭</span>
          <span className="ml-auto">{visible.length} 条可用</span>
        </div>
      </div>
    </div>
  );
}
