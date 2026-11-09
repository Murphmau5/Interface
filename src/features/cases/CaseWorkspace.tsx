import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, LayoutGrid, List, Plus, RotateCcw, Search, X } from "lucide-react";

import { PanelLayout } from "@/components/layout/PanelLayout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { useDiscoveryFetchUrl, useDiscoverySearch } from "@/features/candidates/api";
import { CaseDetail } from "@/features/cases/CaseDetail";
import { CaseList } from "@/features/cases/CaseList";
import { CreateCaseForm } from "@/features/cases/CreateCaseForm";
import {
  useCaseFacets,
  useCaseQuery,
  useCollections,
  useToggleFavorite,
} from "@/features/cases/api";
import { useAiSettings } from "@/features/settings/api";
import {
  CASE_KIND_DESCRIPTIONS,
  CASE_KIND_LABELS,
  COMPONENT_LAYER_OPTIONS,
  CONFIDENCE_OPTIONS,
  PLATFORM_OPTIONS,
  SORT_OPTIONS,
  type CaseKind,
} from "@/lib/constants";
import type { CaseQueryInput } from "@/lib/ipc";
import type { NavSectionKey } from "@/lib/navigation";
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

const SCOPE_OPTIONS = [
  { value: "local", label: "本地" },
  { value: "online", label: "联网" },
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
      description: "跨内容域的全部案例；搜索与筛选都在 SQL 里执行，计数为真实统计。",
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
    description: "最近 30 天内更新过的案例，按更新时间倒序。",
  };
}

function withCounts(
  options: readonly { value: string; label: string }[],
  counts: Record<string, number> | undefined,
  allLabel: string,
): { value: string; label: string }[] {
  return [
    { value: "all", label: allLabel },
    ...options.map((option) => ({
      value: option.value,
      label: `${option.label} · ${counts?.[option.value] ?? 0}`,
    })),
  ];
}

export function CaseWorkspace(props: CaseWorkspaceProps) {
  const copy = workspaceCopy(props);
  const navigate = useNavigate();
  const toggleFavorite = useToggleFavorite();
  const sectionKey = props.scope === "kind" ? (props.kind as NavSectionKey) : null;
  const selectedCategory = useUiStore((state) =>
    sectionKey ? (state.categoryBySection[sectionKey] ?? null) : null,
  );
  const clearCategory = useUiStore((state) => state.clearCategory);
  const filters = useUiStore((state) => state.filters);
  const setFilter = useUiStore((state) => state.setFilter);
  const resetFilters = useUiStore((state) => state.resetFilters);
  const view = useUiStore((state) => state.viewMode);
  const setView = useUiStore((state) => state.setViewMode);
  const activeCollectionId = useUiStore((state) => state.activeCollectionId);
  const setActiveCollection = useUiStore((state) => state.setActiveCollection);
  const collections = useCollections();
  const aiSettings = useAiSettings();
  const discoveryFetchUrl = useDiscoveryFetchUrl();
  const discoverySearch = useDiscoverySearch();

  const collection =
    props.scope === "all"
      ? (collections.data?.find((entry) => entry.id === activeCollectionId) ?? null)
      : null;

  const scope: CaseQueryInput["scope"] =
    props.scope === "kind"
      ? "kind"
      : props.scope === "favorites"
        ? "favorites"
        : props.scope === "recent"
          ? "recent"
          : activeCollectionId
            ? "collection"
            : "all";

  const queryInput: CaseQueryInput = useMemo(
    () => ({
      scope,
      kind:
        props.scope === "kind"
          ? props.kind
          : filters.kind !== "all"
            ? filters.kind
            : undefined,
      platform: filters.platform !== "all" ? filters.platform : undefined,
      confidence: filters.confidence !== "all" ? filters.confidence : undefined,
      layer: filters.layer !== "all" ? filters.layer : undefined,
      categoryId: selectedCategory ?? undefined,
      collectionId: collection?.id ?? undefined,
      search: filters.search.trim() || undefined,
      sort: filters.sort,
      limit: 1000,
    }),
    [scope, props, filters, selectedCategory, collection?.id],
  );

  const facetInput: CaseQueryInput = useMemo(
    () => ({
      scope,
      categoryId: selectedCategory ?? undefined,
      collectionId: collection?.id ?? undefined,
      search: filters.search.trim() || undefined,
    }),
    [scope, selectedCategory, collection?.id, filters.search],
  );

  const casesQuery = useCaseQuery(queryInput);
  const facets = useCaseFacets(facetInput);

  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [onlineMessage, setOnlineMessage] = useState<string | null>(null);

  // 220ms 防抖后再把输入写入唯一筛选状态，查询由 SQL 执行
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft !== filters.search) setFilter("search", searchDraft);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search, setFilter]);

  const items = casesQuery.data?.items ?? [];
  const total = casesQuery.data?.total ?? 0;

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const searchConfigured = Boolean(aiSettings.data?.searchCredential.configured);

  const handleToggleFavorite = (id: string) => {
    toggleFavorite.mutate(id, {
      onSuccess: () => setListError(null),
      onError: (error) => setListError(error.message),
    });
  };

  const handleCreated = (id: string) => {
    setSearchDraft("");
    setFilter("search", "");
    setSelectedId(id);
    setCreating(false);
  };

  const captureKind: CaseKind = props.scope === "kind" ? props.kind : "style";

  const handleUrlSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const url = urlDraft.trim();
    if (!url) return;
    discoveryFetchUrl.mutate(
      { url, kind: captureKind },
      {
        onSuccess: (result) => {
          const item = result.items[0];
          if (!item) {
            setOnlineMessage(`${result.code} ${result.message}`.trim());
            return;
          }
          if (item.outcome === "created") {
            setUrlDraft("");
            setOnlineMessage(`已入候选池待审核：${item.title ?? item.url}`);
          } else if (item.outcome === "duplicate") {
            setOnlineMessage("该网址已有候选，未重复创建");
          } else {
            setOnlineMessage(`抓取失败：${item.code ?? ""} ${item.message ?? ""}`.trim());
          }
        },
        onError: (error) => setOnlineMessage(error.message),
      },
    );
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = queryDraft.trim();
    if (!query) return;
    discoverySearch.mutate(
      { query, kind: captureKind },
      {
        onSuccess: (result) => {
          setOnlineMessage(
            `检索完成：请求 ${result.requested} · 新增 ${result.created} · 重复 ${result.duplicates} · 失败 ${result.failed}`,
          );
        },
        onError: (error) => setOnlineMessage(error.message),
      },
    );
  };

  const favoriteBusyId =
    toggleFavorite.isPending && typeof toggleFavorite.variables === "string"
      ? toggleFavorite.variables
      : null;

  const kindOptions = useMemo(
    () =>
      withCounts(
        Object.entries(CASE_KIND_LABELS).map(([value, label]) => ({ value, label })),
        facets.data?.kinds,
        "全部类型",
      ),
    [facets.data?.kinds],
  );
  const platformOptions = useMemo(
    () => withCounts(PLATFORM_OPTIONS, facets.data?.platforms, "全部平台"),
    [facets.data?.platforms],
  );
  const confidenceOptions = useMemo(
    () => withCounts(CONFIDENCE_OPTIONS, facets.data?.confidences, "全部置信度"),
    [facets.data?.confidences],
  );
  const layerOptions = useMemo(
    () => withCounts(COMPONENT_LAYER_OPTIONS, facets.data?.layers, "全部组件层"),
    [facets.data?.layers],
  );

  const filtersActive =
    filters.kind !== "all" ||
    filters.platform !== "all" ||
    filters.confidence !== "all" ||
    filters.layer !== "all" ||
    filters.search.trim() !== "";

  const title = collection?.name ?? copy.title;
  const eyebrow = collection ? "LIBRARY / 合集" : copy.eyebrow;

  const middle = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="label-eyebrow">{eyebrow}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h1>
              <span title="总数来自 SQL COUNT" className="rail-count ml-0">
                {total}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-2xs leading-normal text-ink-faint">
              {collection
                ? "合集是视图，不是分类；条目仍保留原本的内容域与类目。"
                : copy.description}
            </p>
          </div>
          {props.scope === "kind" ? (
            creating ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<X size={13} strokeWidth={1.8} aria-hidden />}
                onClick={() => setCreating(false)}
              >
                取消
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<Plus size={13} strokeWidth={1.8} aria-hidden />}
                onClick={() => setCreating(true)}
              >
                新建
              </Button>
            )
          ) : null}
        </div>

        {sectionKey && selectedCategory ? (
          <nav aria-label="类目路径" className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => clearCategory(sectionKey)}
              className="chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
            >
              {CASE_KIND_LABELS[props.scope === "kind" ? props.kind : "style"]}
            </button>
            <span aria-hidden className="text-2xs text-ink-faint">
              ›
            </span>
            <span className="chip" data-tone="accent">
              类目视图
            </span>
            <span className="ml-auto text-2xs text-ink-faint">Esc 先清类目</span>
          </nav>
        ) : null}

        {collection ? (
          <button
            type="button"
            onClick={() => setActiveCollection(null)}
            className="chip mt-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
          >
            退出合集视图
          </button>
        ) : null}

        <div className="mt-2.5">
          <Input
            aria-label="搜索案例"
            value={searchDraft}
            placeholder="搜标题 / 摘要 / 拼音，2 字即可命中"
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === "Enter") {
                event.preventDefault();
                setOnlineMessage(null);
                setFilter("scope", "online");
              }
            }}
            trailing={<Search size={13} strokeWidth={1.8} aria-hidden />}
          />
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <SegmentedControl
            label="搜索作用域"
            options={SCOPE_OPTIONS}
            value={filters.scope}
            onChange={(value) => {
              setOnlineMessage(null);
              setFilter("scope", value);
            }}
          />
          <span className="ml-auto" />
          <SegmentedControl
            label="列表视图"
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
          />
        </div>

        {filters.scope === "online" ? (
          <div className="detail-inset mt-2 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs font-medium text-ink">联网作用域</span>
              <button
                type="button"
                onClick={() => {
                  setOnlineMessage(null);
                  setFilter("scope", "local");
                }}
                className="text-2xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
              >
                回到本地
              </button>
            </div>
            <form onSubmit={handleUrlSubmit} className="mt-1.5 flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="粘贴网址"
                  value={urlDraft}
                  placeholder="https://example.com/article"
                  onChange={(event) => setUrlDraft(event.target.value)}
                />
              </div>
              <Button size="sm" type="submit" disabled={discoveryFetchUrl.isPending}>
                {discoveryFetchUrl.isPending ? "抓取中…" : "抓取"}
              </Button>
            </form>
            <p className="mt-1 leading-normal text-2xs text-ink-faint">
              粘贴公开 http/https 网址即可抓取，不需要 Key；内网与本机地址会被拒绝。
            </p>
            {searchConfigured ? (
              <form onSubmit={handleSearchSubmit} className="mt-1.5 flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label="检索关键词"
                    value={queryDraft}
                    placeholder="检索关键词，例如：玻璃拟态导航栏"
                    onChange={(event) => setQueryDraft(event.target.value)}
                  />
                </div>
                <Button size="sm" type="submit" disabled={discoverySearch.isPending}>
                  {discoverySearch.isPending ? "检索中…" : "检索"}
                </Button>
              </form>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs leading-normal text-ink-faint">
                <span>搜索服务未配置（需要 Key）</span>
                <Button size="sm" variant="ghost" onClick={() => navigate("/settings")}>
                  去设置
                </Button>
              </div>
            )}
            {onlineMessage ? (
              <p className="mt-1.5 leading-normal text-2xs text-ink-soft">{onlineMessage}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {props.scope !== "kind" ? (
            <Select
              aria-label="按类型筛选"
              className="filter-select w-full"
              options={kindOptions}
              value={filters.kind}
              onChange={(event) => setFilter("kind", event.target.value)}
            />
          ) : null}
          <Select
            aria-label="按平台筛选"
            className="filter-select w-full"
            options={platformOptions}
            value={filters.platform}
            onChange={(event) => setFilter("platform", event.target.value)}
          />
          <Select
            aria-label="按置信度筛选"
            className="filter-select w-full"
            options={confidenceOptions}
            value={filters.confidence}
            onChange={(event) => setFilter("confidence", event.target.value)}
          />
          <Select
            aria-label="按组件层筛选"
            className="filter-select w-full"
            options={layerOptions}
            value={filters.layer}
            onChange={(event) => setFilter("layer", event.target.value)}
          />
          <Select
            aria-label="排序"
            className="filter-select w-full"
            options={[...SORT_OPTIONS]}
            value={filters.sort}
            onChange={(event) => setFilter("sort", event.target.value as typeof filters.sort)}
          />
          {filtersActive ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-2xs"
              icon={<RotateCcw size={12} strokeWidth={1.8} aria-hidden />}
              onClick={() => {
                resetFilters();
                setSearchDraft("");
              }}
            >
              重置
            </Button>
          ) : null}
        </div>
      </header>

      <div
        id="content-list"
        tabIndex={-1}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3 focus-visible:outline-none"
      >
        {props.scope === "kind" && creating ? (
          <CreateCaseForm
            kind={props.kind}
            categoryId={selectedCategory}
            onCreated={handleCreated}
            onCancel={() => setCreating(false)}
          />
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

        {!casesQuery.isPending && !casesQuery.isError && total === 0 && !creating ? (
          <EmptyState
            compact
            title={filters.search.trim() ? "没有匹配的案例" : "这里还没有案例"}
            description={
              filters.search.trim()
                ? "换一个关键词，或试试拼音全拼 / 首字母。"
                : selectedCategory
                  ? "该类目还没有案例，点右上角「新建」写第一条并自动归类。"
                  : props.scope === "kind"
                    ? "点右上角「新建」写入第一条案例，数据会落到本地 SQLite。"
                    : "先去内容域创建案例并收藏，再回到这里查看。"
            }
            action={
              filtersActive ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    resetFilters();
                    setSearchDraft("");
                  }}
                >
                  清空筛选
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {!casesQuery.isPending && !casesQuery.isError && total > 0 ? (
          <CaseList
            cases={items}
            selectedId={selected?.id ?? null}
            view={view}
            favoriteBusyId={favoriteBusyId}
            onSelect={setSelectedId}
            onToggleFavorite={handleToggleFavorite}
          />
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

  return <PanelLayout label={title} middle={middle} detail={detail} />;
}
