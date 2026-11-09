import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Star, Trash2, X } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  useAddToCollection,
  useCaseAssets,
  useCaseTags,
  useCatalog,
  useCollections,
  useDeleteCase,
  useExportBundle,
  useImportAssets,
  useRenameCase,
  useSetCaseTags,
  useUpdatePayload,
} from "@/features/cases/api";
import { buildCaseJson, buildCaseMarkdown } from "@/features/cases/markdown";
import { PreviewPanel } from "@/features/preview/PreviewPanel";
import {
  CASE_KIND_LABELS,
  CONFIDENCE_LABELS,
  PLATFORM_LABELS,
  type CaseKind,
} from "@/lib/constants";
import { ipc, type AssetRecord, type CaseSummary } from "@/lib/ipc";
import {
  defaultPreviewSpec,
  parsePreviewSpec,
  serializePreview,
  type PreviewKind,
  type PreviewSpec,
} from "@/lib/preview";
import { cn, formatDateTime } from "@/lib/utils";

interface CaseDetailProps {
  item: CaseSummary;
  favoriteBusy: boolean;
  onToggleFavorite: (id: string) => void;
  onDeleted: () => void;
}

const PREVIEW_KINDS: PreviewKind[] = ["motion", "feedback", "component", "theme", "style"];

function normalizeKind(kind: string): PreviewKind {
  return (PREVIEW_KINDS as string[]).includes(kind) ? (kind as PreviewKind) : "motion";
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="shrink-0 text-meta text-ink-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-meta text-ink-soft">{value}</dd>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_LABELS: Record<Exclude<SaveState, "error">, string> = {
  idle: "参数未改动",
  saving: "保存中…",
  saved: "已保存",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 素材区：窗口级拖拽导入，按内容哈希去重；失败逐条可见 */
function AssetSection({ caseId }: { caseId: string }) {
  const assets = useCaseAssets(caseId);
  const importAssets = useImportAssets();
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const importRef = useRef(importAssets.mutate);

  useEffect(() => {
    importRef.current = importAssets.mutate;
  }, [importAssets.mutate]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const window_ = getCurrentWebviewWindow();
        const off = await window_.onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          const paths = event.payload.paths;
          if (!paths.length) return;
          importRef.current(
            { caseId, paths },
            {
              onSuccess: (rows) => {
                const failed = rows.filter((row) => !row.ok);
                const reused = rows.filter((row) => row.ok && row.reused).length;
                if (failed.length) {
                  setStatus({
                    tone: "error",
                    text: `${rows.length - failed.length} 个已入库（复用 ${reused}），${
                      failed.length
                    } 个失败：${failed
                      .map((row) => `${row.path} → ${row.error ?? "未知错误"}`)
                      .join("；")}`,
                  });
                } else {
                  setStatus({
                    tone: "ok",
                    text: `已导入 ${rows.length} 个文件（复用 ${reused} 个）。HTML 只存储并标记未清洗。`,
                  });
                }
              },
              onError: (error) => setStatus({ tone: "error", text: error.message }),
            },
          );
        });
        if (disposed) {
          off();
        } else {
          unlisten = off;
        }
      } catch {
        setStatus({
          tone: "error",
          text: "当前环境不支持文件拖拽；请在桌面应用窗口内拖入文件。",
        });
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [caseId]);

  const rows: AssetRecord[] = assets.data ?? [];

  return (
    <Card className="px-4 py-3">
      <div
        className="rounded-sm border border-dashed border-line-strong bg-sunken px-3 py-3 text-center"
        aria-label="拖拽文件到窗口以导入素材"
      >
        <p className="text-sm font-medium text-ink">拖文件到窗口即可导入</p>
        <p className="mt-1 text-xs leading-normal text-ink-faint">
          按 sha256 内容寻址存储，同一文件只存一份；单文件上限 32 MB。HTML 只保存并标记「未清洗」，不会执行。
        </p>
      </div>

      {status ? (
        <p
          role="status"
          className={cn(
            "mt-2 whitespace-pre-wrap break-words text-xs leading-normal",
            status.tone === "error" ? "text-danger" : "text-ink-soft",
          )}
        >
          {status.text}
        </p>
      ) : null}

      {rows.length ? (
        <ul className="mt-2 space-y-1.5">
          {rows.map((asset) => (
            <li
              key={asset.id}
              className="flex items-center justify-between gap-3 rounded-xs border border-line px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-meta text-ink">{asset.originalName}</div>
                <div className="truncate font-mono text-2xs text-ink-faint">
                  {asset.kind} · {formatBytes(asset.byteSize)} · {asset.sha256.slice(0, 10)}
                </div>
              </div>
              {asset.needsCleaning ? (
                <span className="shrink-0 rounded-xs border border-line px-1.5 py-0.5 text-2xs text-ink-faint">
                  未清洗
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-2xs text-ink-faint">这条案例还没有素材。</p>
      )}
    </Card>
  );
}

export function CaseDetail({
  item,
  favoriteBusy,
  onToggleFavorite,
  onDeleted,
}: CaseDetailProps) {
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [spec, setSpec] = useState<PreviewSpec>(
    () => parsePreviewSpec(item.payloadJson) ?? defaultPreviewSpec(normalizeKind(item.kind)),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [exportPaths, setExportPaths] = useState<{ markdown: string; json: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  const [collectionChoice, setCollectionChoice] = useState("");
  const [collectionMessage, setCollectionMessage] = useState<string | null>(null);

  const pendingPayload = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const renameCase = useRenameCase();
  const deleteCase = useDeleteCase();
  const updatePayload = useUpdatePayload();
  const exportBundle = useExportBundle();
  const catalog = useCatalog();
  const tagsQuery = useCaseTags(item.id);
  const setTags = useSetCaseTags();
  const collections = useCollections();
  const addToCollection = useAddToCollection();

  const categoryLabel =
    catalog.data
      ?.flatMap((domain) => domain.groups)
      .flatMap((group) => group.categories)
      .find((category) => category.id === item.categoryId)?.label ?? null;

  const kindLabel = CASE_KIND_LABELS[item.kind as CaseKind] ?? item.kind;
  const confidenceLabel = CONFIDENCE_LABELS[item.confidence] ?? item.confidence;
  const platformLabel = PLATFORM_LABELS[item.platform] ?? item.platform;
  const tagLabels = tagsQuery.data?.map((tag) => tag.label) ?? [];

  // 切走案例时把未落库的参数补写一次，避免拖完滑块直接切走丢改动
  useEffect(() => {
    const caseId = item.id;
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const pending = pendingPayload.current;
      if (pending) {
        pendingPayload.current = null;
        void ipc.casesUpdatePayload(caseId, pending).catch(() => {
          // 卸载阶段的补写失败不阻塞界面；下次进入该案例可重新保存
        });
      }
    };
  }, [item.id]);

  const commit = (payload: string) => {
    updatePayload.mutate(
      { id: item.id, payloadJson: payload },
      {
        onSuccess: () => {
          pendingPayload.current = null;
          setSaveState("saved");
          setSaveMessage(null);
          setSavedAt(new Date());
        },
        onError: (error) => {
          setSaveState("error");
          setSaveMessage(error.message);
        },
      },
    );
  };

  const handleSpecChange = (next: PreviewSpec) => {
    setSpec(next);
    const payload = serializePreview(item.payloadJson, next);
    pendingPayload.current = payload;
    setSaveState("saving");
    setSaveMessage(null);

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      commit(payload);
    }, 600);
  };

  const handleExport = () => {
    setExportError(null);
    setExportPaths(null);
    const updatedAt = formatDateTime(item.updatedAt);
    const markdown = buildCaseMarkdown({
      title: item.title,
      kindLabel,
      categoryLabel,
      confidenceLabel,
      updatedAt,
      spec,
    });
    const json = buildCaseJson({
      id: item.id,
      title: item.title,
      kind: item.kind,
      kindLabel,
      categoryId: item.categoryId,
      categoryLabel,
      confidence: item.confidence,
      confidenceLabel,
      platform: item.platform,
      tags: tagLabels,
      updatedAt,
      spec,
    });

    exportBundle.mutate(
      { title: item.title, markdown, json },
      {
        onSuccess: (bundle) =>
          setExportPaths({ markdown: bundle.markdownPath, json: bundle.jsonPath }),
        onError: (error) => setExportError(error.message),
      },
    );
  };

  const applyTags = (labels: string[], successText?: string) => {
    setTags.mutate(
      { caseId: item.id, labels },
      {
        onSuccess: () => {
          setTagMessage(successText ?? null);
          setTagDraft("");
        },
        onError: (error) => setTagMessage(error.message),
      },
    );
  };

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === item.title) return;

    renameCase.mutate(
      { id: item.id, title: trimmed },
      {
        onSuccess: () => setRenameError(null),
        onError: (error) => setRenameError(error.message),
      },
    );
  };

  const requestDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    deleteCase.mutate(item.id, {
      onSuccess: () => {
        setConfirming(false);
        onDeleted();
      },
      onError: (error) => {
        setDeleteError(error.message);
        setConfirming(false);
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-6 py-5">
        <div className="label-eyebrow">DETAIL / 案例详情</div>
        <div className="mt-2 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-xl font-semibold leading-tight tracking-tight text-ink">
            {item.title}
          </h2>
          <button
            type="button"
            aria-label={item.isFavorite ? "取消收藏" : "收藏"}
            aria-pressed={item.isFavorite}
            disabled={favoriteBusy}
            onClick={() => onToggleFavorite(item.id)}
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-line bg-raised transition-colors duration-[var(--motion-fast)] hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line disabled:opacity-40",
              item.isFavorite ? "text-accent" : "text-ink-faint hover:text-ink-soft",
            )}
          >
            <Star
              size={14}
              strokeWidth={1.9}
              fill={item.isFavorite ? "currentColor" : "none"}
              aria-hidden
            />
          </button>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-2xs text-ink-soft">
            {kindLabel}
          </span>
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-2xs text-ink-soft">
            {platformLabel}
          </span>
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-2xs text-ink-soft">
            置信度 · {confidenceLabel}
          </span>
          {categoryLabel ? (
            <span className="rounded-xs border border-accent-line bg-accent-soft px-1.5 py-0.5 text-2xs text-ink">
              类目 · {categoryLabel}
            </span>
          ) : null}
          <span className="font-mono text-2xs text-ink-faint">#{item.id.slice(0, 8)}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-6 py-5">
          <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div id="preview-heading" className="label-eyebrow">
                预览与参数
              </div>
              <span
                role="status"
                className={cn(
                  "font-mono text-2xs",
                  saveState === "error"
                    ? "text-danger"
                    : saveState === "saved"
                      ? "text-accent"
                      : "text-ink-faint",
                )}
              >
                {saveState === "error"
                  ? `保存失败：${saveMessage ?? "未知错误"}`
                  : saveState === "saved" && savedAt
                    ? `${SAVE_LABELS.saved} ${savedAt.toLocaleTimeString("zh-CN", { hour12: false })}`
                    : SAVE_LABELS[saveState]}
              </span>
            </div>
            <PreviewPanel spec={spec} onChange={handleSpecChange} />
          </section>

          <section aria-labelledby="tags-heading" className="flex flex-col gap-2">
            <div id="tags-heading" className="label-eyebrow">
              标签
            </div>
            <Card className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {tagLabels.length ? (
                  tagLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-xs border border-line bg-sunken px-1.5 py-0.5 text-2xs text-ink-soft"
                    >
                      {label}
                      <button
                        type="button"
                        aria-label={`移除标签 ${label}`}
                        onClick={() => applyTags(tagLabels.filter((entry) => entry !== label))}
                        className="text-ink-faint transition-colors hover:text-danger"
                      >
                        <X size={10} strokeWidth={2} aria-hidden />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-2xs text-ink-faint">还没有标签</span>
                )}
              </div>
              <form
                className="mt-2 flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const label = tagDraft.trim();
                  if (!label) return;
                  if (tagLabels.includes(label)) {
                    setTagMessage("该标签已存在。");
                    return;
                  }
                  applyTags([...tagLabels, label], `已添加标签：${label}`);
                }}
              >
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label="新标签"
                    value={tagDraft}
                    maxLength={24}
                    placeholder="输入标签后回车，例如「导航」「深色」"
                    onChange={(event) => {
                      setTagDraft(event.target.value);
                      if (tagMessage) setTagMessage(null);
                    }}
                  />
                </div>
                <Button type="submit" size="sm" disabled={setTags.isPending || !tagDraft.trim()}>
                  添加标签
                </Button>
              </form>
              {tagMessage ? (
                <p role="status" className="mt-1 text-2xs leading-normal text-ink-faint">
                  {tagMessage}
                </p>
              ) : null}
            </Card>
          </section>

          <section aria-labelledby="collection-heading" className="flex flex-col gap-2">
            <div id="collection-heading" className="label-eyebrow">
              合集
            </div>
            <Card className="flex flex-wrap items-end gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Select
                  aria-label="选择合集"
                  options={[
                    { value: "", label: "选择合集" },
                    ...(collections.data ?? []).map((entry) => ({
                      value: entry.id,
                      label: `${entry.name} · ${entry.count}`,
                    })),
                  ]}
                  value={collectionChoice}
                  onChange={(event) => setCollectionChoice(event.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={!collectionChoice || addToCollection.isPending}
                onClick={() => {
                  const target = collections.data?.find((entry) => entry.id === collectionChoice);
                  addToCollection.mutate(
                    { collectionId: collectionChoice, caseId: item.id },
                    {
                      onSuccess: () =>
                        setCollectionMessage(
                          `已加入合集${target ? `「${target.name}」` : ""}；重复加入不会产生副本。`,
                        ),
                      onError: (error) => setCollectionMessage(error.message),
                    },
                  );
                }}
              >
                加入合集
              </Button>
              {collectionMessage ? (
                <p role="status" className="w-full text-2xs leading-normal text-ink-faint">
                  {collectionMessage}
                </p>
              ) : null}
            </Card>
          </section>

          <section aria-labelledby="assets-heading" className="flex flex-col gap-2">
            <div id="assets-heading" className="label-eyebrow">
              素材
            </div>
            <AssetSection caseId={item.id} />
          </section>

          <section aria-labelledby="export-heading" className="flex flex-col gap-2">
            <div id="export-heading" className="label-eyebrow">
              导出
            </div>
            <Card className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">同时导出 Markdown + JSON</div>
                <p className="text-xs leading-normal text-ink-faint">
                  一次操作写出两份文件，文件名带版本与日期（v版本-YYYYMMDD），落到应用数据目录的
                  exports/。
                </p>
                {exportPaths ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="break-all font-mono text-2xs text-accent">
                      MD · {exportPaths.markdown}
                    </p>
                    <p className="break-all font-mono text-2xs text-accent">
                      JSON · {exportPaths.json}
                    </p>
                  </div>
                ) : null}
                {exportError ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {exportError}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Download size={12} strokeWidth={2} />}
                disabled={exportBundle.isPending}
                onClick={handleExport}
              >
                {exportBundle.isPending ? "导出中" : "导出"}
              </Button>
            </Card>
          </section>

          <section aria-labelledby="rename-heading" className="flex flex-col gap-2">
            <div id="rename-heading" className="label-eyebrow">
              基础信息
            </div>
            <form onSubmit={submitRename} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="案例标题"
                  value={draftTitle}
                  maxLength={120}
                  onChange={(event) => {
                    setDraftTitle(event.target.value);
                    if (renameError) setRenameError(null);
                  }}
                />
              </div>
              <Button
                type="submit"
                disabled={
                  renameCase.isPending ||
                  !draftTitle.trim() ||
                  draftTitle.trim() === item.title
                }
              >
                {renameCase.isPending ? "保存中" : "保存标题"}
              </Button>
            </form>
            {renameError ? (
              <p role="alert" className="text-xs text-danger">
                {renameError}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="meta-heading" className="flex flex-col gap-2">
            <div id="meta-heading" className="label-eyebrow">
              元数据
            </div>
            <Card className="px-4">
              <dl className="divide-y-0">
                <MetaRow label="主域 kind" value={item.kind} />
                <MetaRow label="类目 ID" value={item.categoryId ?? "未归类"} />
                <MetaRow label="平台" value={platformLabel} />
                <MetaRow label="组件层" value={item.componentLayer ?? "不适用"} />
                <MetaRow label="置信度" value={confidenceLabel} />
                <MetaRow label="创建时间" value={formatDateTime(item.createdAt)} />
                <MetaRow label="更新时间" value={formatDateTime(item.updatedAt)} />
                <MetaRow label="案例 ID" value={item.id} />
              </dl>
            </Card>
          </section>

          <section aria-labelledby="danger-heading" className="flex flex-col gap-2 pb-2">
            <div id="danger-heading" className="label-eyebrow">
              危险操作
            </div>
            <Card className="flex items-center justify-between gap-4 border-danger/25 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">软删除这条案例</div>
                <p className="text-xs leading-normal text-ink-faint">
                  写入 deleted_at，默认列表不再显示；回收站与恢复入口尚未实现。
                </p>
                {deleteError ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {deleteError}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {confirming ? (
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    取消
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={12} strokeWidth={2} />}
                  disabled={deleteCase.isPending}
                  onClick={requestDelete}
                >
                  {confirming ? "确认删除" : "删除"}
                </Button>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
