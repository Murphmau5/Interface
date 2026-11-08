import { useState } from "react";
import { Layers, LayoutGrid, List, Search, X } from "lucide-react";

import { PanelLayout } from "@/components/layout/PanelLayout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CaseDetail } from "@/features/cases/CaseDetail";
import { CaseList } from "@/features/cases/CaseList";
import { CreateCaseForm } from "@/features/cases/CreateCaseForm";
import { useCases, useToggleFavorite, type CaseScope } from "@/features/cases/api";
import {
  CASE_KIND_DESCRIPTIONS,
  CASE_KIND_LABELS,
  type CaseKind,
} from "@/lib/constants";
import { findCategoryLabel, type NavSectionKey } from "@/lib/navigation";
import { useUiStore } from "@/stores/uiStore";

type CaseWorkspaceProps =
  | { scope: "all" }
  | { scope: "kind"; kind: CaseKind }
  | { scope: "favorites" }
  | { scope: "recent" };

const VIEW_OPTIONS = [
  { value: "grid", label: "网格", icon: <LayoutGrid size={12} strokeWidth={1.8} /> },
  { value: "table", label: "表格", icon: <List size={12} strokeWidth={1.8} /> },
] as const;

function workspaceCopy(props: CaseWorkspaceProps): {
  eyebrow: string;
  title: string;
  description: string;
} {
  if (props.scope === "kind") {
    return {
      eyebrow: `CONTENT / ${CASE_KIND_LABELS[props.kind].toUpperCase()}`,
      title: CASE_KIND_LABELS[props.kind],
      description: CASE_KIND_DESCRIPTIONS[props.kind],
    };
  }
  if (props.scope === "all") {
    return {
      eyebrow: "LIBRARY / 全部",
      title: "全部案例",
      description: "跨内容域的全部案例，按更新时间倒序；左栏与这里共用同一份 SQLite 数据。",
    };
  }
  if (props.scope === "favorites") {
    return {
      eyebrow: "LIBRARY / 收藏",
      title: "收藏",
      description: "跨内容域的收藏视图，状态写入本地 cases 表。",
    };
  }
  return {
    eyebrow: "LIBRARY / 最近使用",
    title: "最近使用",
    description: "按更新时间倒序排列，不区分内容域。",
  };
}

export function CaseWorkspace(props: CaseWorkspaceProps) {
  const scope: CaseScope = props.scope;
  const kind = props.scope === "kind" ? props.kind : undefined;
  const copy = workspaceCopy(props);
  const casesQuery = useCases(scope, kind);
  const toggleFavorite = useToggleFavorite();
  const sectionKey = props.scope === "kind" ? (props.kind as NavSectionKey) : null;
  const selectedCategory = useUiStore((state) =>
    sectionKey ? (state.categoryBySection[sectionKey] ?? null) : null,
  );
  const clearCategory = useUiStore((state) => state.clearCategory);
  const categoryLabel = sectionKey ? findCategoryLabel(sectionKey, selectedCategory) : null;

  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const cases = casesQuery.data ?? [];
  const filtered = cases.filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      item.title.toLowerCase().includes(needle) ||
      item.id.toLowerCase().includes(needle) ||
      item.summary.toLowerCase().includes(needle)
    );
  });

  const selected =
    cases.find((item) => item.id === selectedId) ?? filtered[0] ?? cases[0] ?? null;

  const handleToggleFavorite = (id: string) => {
    toggleFavorite.mutate(id, {
      onSuccess: () => setListError(null),
      onError: (error) => setListError(error.message),
    });
  };

  const handleCreated = (id: string) => {
    setSearch("");
    setSelectedId(id);
  };

  const favoriteBusyId =
    toggleFavorite.isPending && typeof toggleFavorite.variables === "string"
      ? toggleFavorite.variables
      : null;

  const middle = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-5 pb-4 pt-5">
        <div className="label-eyebrow">{copy.eyebrow}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <h1 className="text-display font-semibold tracking-tight text-ink">{copy.title}</h1>
          <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-2xs text-ink-faint">
            {filtered.length}
          </span>
        </div>
        <p className="mt-1 text-meta leading-normal text-ink-faint">{copy.description}</p>

        {sectionKey && categoryLabel ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-xs border border-accent-line bg-accent-soft px-1.5 py-0.5 text-2xs text-ink">
              类目 · {categoryLabel}
            </span>
            <span className="text-2xs text-ink-faint">类目字段 Phase 2 接入，暂不参与筛选</span>
            <button
              type="button"
              aria-label="清除已选类目"
              onClick={() => clearCategory(sectionKey)}
              className="flex h-4 w-4 items-center justify-center rounded-xs text-ink-faint hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
            >
              <X size={10} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="mt-3.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="搜索案例"
              value={search}
              placeholder="按标题 / ID 过滤"
              onChange={(event) => setSearch(event.target.value)}
              trailing={<Search size={13} strokeWidth={1.8} aria-hidden />}
            />
          </div>
          <SegmentedControl
            label="列表视图"
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
        </div>
      </header>

      <div
        id="content-list"
        tabIndex={-1}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 focus-visible:outline-none"
      >
        {scope === "kind" && kind ? (
          <CreateCaseForm kind={kind} onCreated={handleCreated} />
        ) : null}

        {listError ? (
          <div
            role="alert"
            className="flex items-start justify-between gap-2 rounded-sm border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            <span className="min-w-0">{listError}</span>
            <button
              type="button"
              onClick={() => setListError(null)}
              className="shrink-0 text-2xs text-danger underline-offset-2 hover:underline"
            >
              关闭
            </button>
          </div>
        ) : null}

        {casesQuery.isPending ? <LoadingState /> : null}

        {casesQuery.isError ? (
          <EmptyState
            title="读取案例失败"
            description={casesQuery.error.message}
            action={
              <Button size="sm" onClick={() => void casesQuery.refetch()}>
                重试
              </Button>
            }
          />
        ) : null}

        {!casesQuery.isPending && !casesQuery.isError && filtered.length === 0 ? (
          <EmptyState
            compact
            title={search.trim() ? "没有匹配的案例" : "这里还没有案例"}
            description={
              search.trim()
                ? "清空搜索词，或换一个关键词。"
                : scope === "kind"
                  ? "用上方表单写入第一条案例，数据会落到本地 SQLite。"
                  : "先去内容域创建案例并收藏，再回到这里查看。"
            }
            action={
              search.trim() ? (
                <Button size="sm" variant="ghost" onClick={() => setSearch("")}>
                  清空搜索
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {!casesQuery.isPending && !casesQuery.isError && filtered.length > 0 ? (
          <CaseList
            cases={filtered}
            selectedId={selected?.id ?? null}
            view={view}
            favoriteBusyId={favoriteBusyId}
            onSelect={setSelectedId}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : null}

        {!casesQuery.isPending && !casesQuery.isError && cases.length > 0 ? (
          <p className="px-1 pt-1 font-mono text-2xs text-ink-faint">
            本地 SQLite · {cases.length} 条 · 重启后保留
          </p>
        ) : null}
      </div>
    </div>
  );

  const detail = selected ? (
    <CaseDetail
      key={selected.id}
      item={selected}
      favoriteBusy={favoriteBusyId === selected.id}
      onToggleFavorite={handleToggleFavorite}
      onDeleted={() => setSelectedId(null)}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-8">
      <EmptyState
        icon={<Layers size={16} strokeWidth={1.7} />}
        title="选择一条案例"
        description="中栏负责浏览与筛选，右栏负责详情与参数。拖动两栏之间的分割线可调整宽度。"
        className="max-w-md"
      />
    </div>
  );

  return <PanelLayout label={copy.title} middle={middle} detail={detail} />;
}
