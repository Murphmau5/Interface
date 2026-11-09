import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, Download, Eye, Pencil, Star, Trash2, X } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { Button } from "@/components/ui/Button";
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
import { caseActions } from "@/lib/caseActions";
import {
  CASE_KIND_LABELS,
  CONFIDENCE_LABELS,
  PLATFORM_LABELS,
  type CaseKind,
} from "@/lib/constants";
import {
  ipc,
  type AssetRecord,
  type CaseSummary,
  type SanitizeReport,
} from "@/lib/ipc";
import {
  buildPreviewPrompt,
  defaultPreviewSpec,
  PARAM_KEY_LABELS,
  PARAM_SOURCE_LABELS,
  parseCasePrompt,
  parseParamSources,
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
    <div className="property-row">
      <dt className="property-key">{label}</dt>
      <dd className="property-value" title={value}>
        {value}
      </dd>
    </div>
  );
}

function SectionHead({
  id,
  title,
  aside,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="detail-section-head">
      <span id={id} className="label-eyebrow">
        {title}
      </span>
      <span aria-hidden className="h-px flex-1 bg-line" />
      {aside}
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

function parseSanitizeReport(raw: string | null): SanitizeReport | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SanitizeReport;
  } catch {
    return null;
  }
}

function sanitizeBadge(asset: AssetRecord): {
  label: string;
  title: string;
  tone: "ok" | "error" | "muted";
} | null {
  if (asset.kind !== "html") return null;
  const report = parseSanitizeReport(asset.sanitizeReport);

  if (asset.sanitizeState === "cleaned") {
    const summary = report
      ? `已清洗：移除 ${report.removedTags} 个标签、${report.removedAttributes} 个属性、${report.removedUrls} 个外部引用`
      : "已清洗";
    return { label: "已清洗", title: summary, tone: "ok" };
  }
  if (asset.sanitizeState === "rejected") {
    const reasons = report?.issues
      .map((issue) => `第 ${issue.line} 行：${issue.message}`)
      .join("\n");
    return {
      label: "清洗失败",
      title: reasons || "清洗失败，不会进入预览",
      tone: "error",
    };
  }
  return { label: "未清洗", title: "尚未清洗，不会进入预览", tone: "muted" };
}

/** 素材区：窗口级拖拽导入，按内容哈希去重；失败逐条可见 */
function AssetSection({ caseId }: { caseId: string }) {
  const assets = useCaseAssets(caseId);
  const importAssets = useImportAssets();
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [openingPreview, setOpeningPreview] = useState<string | null>(null);
  const importRef = useRef(importAssets.mutate);

  const openPreview = (assetId: string) => {
    setOpeningPreview(assetId);
    ipc
      .previewOpenHtml(assetId)
      .catch((error: Error) =>
        setStatus({ tone: "error", text: `预览打开失败：${error.message}` }),
      )
      .finally(() => setOpeningPreview(null));
  };

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
                      .map((row) => {
                        const reasons = row.sanitize?.issues
                          .slice(0, 3)
                          .map((issue) => `第 ${issue.line} 行 ${issue.message}`)
                          .join("；");
                        return `${row.path} → ${row.error ?? "未知错误"}${
                          reasons ? `（${reasons}）` : ""
                        }`;
                      })
                      .join("；")}`,
                  });
                } else {
                  setStatus({
                    tone: "ok",
                    text: `已导入 ${rows.length} 个文件（复用 ${reused} 个）。HTML 已按白名单清洗，清洗失败的条目不会进入预览。`,
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
  const [open, setOpen] = useState(false);
  const headingId = `assets-heading-${caseId}`;

  return (
    <section aria-labelledby={headingId} className="detail-section">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${headingId}-body`}
        onClick={() => setOpen((value) => !value)}
        className="detail-section-head w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
      >
        <span id={headingId} className="label-eyebrow">
          素材
        </span>
        <span className="rail-count ml-0">{rows.length}</span>
        <span aria-hidden className="h-px flex-1 bg-line" />
        <span className="inline-flex items-center gap-1 text-2xs text-ink-faint">
          {open ? "收起" : "展开"}
          <ChevronDown
            size={12}
            strokeWidth={1.8}
            aria-hidden
            className={cn("transition-transform duration-[var(--motion-fast)]", open && "rotate-180")}
          />
        </span>
      </button>

      {open ? (
        <div id={`${headingId}-body`} className="detail-panel px-3 py-3">
          <div
            className="detail-inset px-3 py-2.5 text-center"
            aria-label="拖拽文件到窗口以导入素材"
          >
            <p className="text-2xs font-medium text-ink">拖文件到窗口即可导入</p>
            <p className="mt-0.5 text-2xs leading-relaxed text-ink-faint">
              sha256 内容寻址 · 单文件上限 32 MB · HTML 入库即按白名单清洗
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
          {rows.map((asset) => {
            const badge = sanitizeBadge(asset);
            return (
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
                <div className="flex shrink-0 items-center gap-1.5">
                  {badge ? (
                    <span
                      title={badge.title}
                      className={cn(
                        "rounded-xs border px-1.5 py-0.5 text-2xs",
                        badge.tone === "error"
                          ? "border-danger/40 text-danger"
                          : badge.tone === "ok"
                            ? "border-line text-ink-soft"
                            : "border-line text-ink-faint",
                      )}
                    >
                      {badge.label}
                    </span>
                  ) : null}
                  {asset.kind === "html" && asset.sanitizeState === "cleaned" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Eye size={14} />}
                      disabled={openingPreview === asset.id}
                      onClick={() => openPreview(asset.id)}
                      title="在隔离窗口中预览清洗后的 HTML"
                    >
                      预览
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-2xs text-ink-faint">这条案例还没有素材。</p>
      )}
        </div>
      ) : null}
    </section>
  );
}

export function CaseDetail({
  item,
  favoriteBusy,
  onToggleFavorite,
  onDeleted,
}: CaseDetailProps) {
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [renaming, setRenaming] = useState(false);
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
  const [promptCopied, setPromptCopied] = useState(false);

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
  const paramSources = parseParamSources(item.payloadJson);
  const casePrompt = parseCasePrompt(item.payloadJson) ?? buildPreviewPrompt(spec);

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

  // 全局 Ctrl+E 与命令面板通过登记处调用导出，避免把导出状态提到上层。
  // 不写依赖数组：handleExport 每次渲染都会变，登记处跟着指向最新闭包即可。
  useEffect(() => {
    caseActions.exportCurrent = handleExport;
    return () => {
      caseActions.exportCurrent = undefined;
    };
  });

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
        onSuccess: () => {
          setRenameError(null);
          setRenaming(false);
        },
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
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="label-eyebrow">DETAIL / 案例</div>
        <div className="mt-1 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form onSubmit={submitRename} className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label="案例标题"
                    className="h-8"
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
                  size="sm"
                  variant="primary"
                  disabled={
                    renameCase.isPending ||
                    !draftTitle.trim() ||
                    draftTitle.trim() === item.title
                  }
                >
                  {renameCase.isPending ? "保存中" : "保存"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenaming(false);
                    setDraftTitle(item.title);
                    setRenameError(null);
                  }}
                >
                  取消
                </Button>
              </form>
            ) : (
              <div className="flex items-start gap-1.5">
                <h2
                  className="line-clamp-2 min-w-0 flex-1 text-lg font-semibold leading-snug tracking-tight text-ink"
                  title={item.title}
                >
                  {item.title}
                </h2>
                <button
                  type="button"
                  aria-label="重命名案例"
                  title="重命名"
                  onClick={() => setRenaming(true)}
                  className="stage-tool mt-0.5 shrink-0"
                >
                  <Pencil size={12} strokeWidth={1.9} aria-hidden />
                </button>
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="chip">{kindLabel}</span>
              <span className="chip">{platformLabel}</span>
              <span className="chip">
                <span className="confidence-dot" data-tone={item.confidence} />
                {confidenceLabel}
              </span>
              {categoryLabel ? (
                <span className="chip" data-tone="accent">
                  {categoryLabel}
                </span>
              ) : null}
              <span className="ml-auto font-mono text-2xs text-ink-faint">
                #{item.id.slice(0, 8)}
              </span>
            </div>
            {renameError ? (
              <p role="alert" className="mt-1 text-2xs leading-normal text-danger">
                {renameError}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={item.isFavorite ? "取消收藏" : "收藏"}
            aria-pressed={item.isFavorite}
            disabled={favoriteBusy}
            onClick={() => onToggleFavorite(item.id)}
            data-on={item.isFavorite}
            className={cn(
              "stage-tool mt-0.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line",
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
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 py-4">
          <section aria-labelledby="preview-heading" className="detail-section">
            <SectionHead
              id="preview-heading"
              title="预览与参数"
              aside={
                <span
                  role="status"
                  className={cn(
                    "shrink-0 font-mono text-2xs",
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
              }
            />
            <PreviewPanel spec={spec} onChange={handleSpecChange} />
            {paramSources ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-2xs text-ink-faint">参数来源</span>
                {Object.entries(paramSources).map(([key, level]) => (
                  <span
                    key={key}
                    className="chip"
                    title={`${key} · ${PARAM_SOURCE_LABELS[level]}`}
                  >
                    <span className="confidence-dot" data-tone={level} />
                    {PARAM_KEY_LABELS[key] ?? key} · {PARAM_SOURCE_LABELS[level]}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section aria-labelledby="prompt-heading" className="detail-section">
            <SectionHead
              id="prompt-heading"
              title="提示词"
              aside={
                <button
                  type="button"
                  className="text-2xs text-ink-faint transition-colors hover:text-ink"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(casePrompt)
                      .then(() => {
                        setPromptCopied(true);
                        window.setTimeout(() => setPromptCopied(false), 1600);
                      })
                      .catch(() => setPromptCopied(false));
                  }}
                >
                  {promptCopied ? "已复制" : "复制"}
                </button>
              }
            />
            <details className="detail-panel px-3 py-2.5">
              <summary className="cursor-pointer select-none text-2xs text-ink-soft">
                展开条目提示词
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-2xs leading-relaxed text-ink-soft">
                {casePrompt}
              </pre>
            </details>
          </section>

          <section aria-labelledby="tags-heading" className="detail-section">
            <SectionHead
              id="tags-heading"
              title="标签"
              aside={<span className="font-mono text-2xs text-ink-faint">{tagLabels.length}</span>}
            />
            <div className="detail-panel px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {tagLabels.length ? (
                  tagLabels.map((label) => (
                    <span key={label} className="chip">
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
                className="mt-2 flex items-center gap-1.5"
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
                    className="h-8"
                    value={tagDraft}
                    maxLength={24}
                    placeholder="输入标签后回车，例如「导航」「深色」"
                    onChange={(event) => {
                      setTagDraft(event.target.value);
                      if (tagMessage) setTagMessage(null);
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={setTags.isPending || !tagDraft.trim()}
                >
                  添加
                </Button>
              </form>
              {tagMessage ? (
                <p role="status" className="mt-1 text-2xs leading-normal text-ink-faint">
                  {tagMessage}
                </p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="collection-heading" className="detail-section">
            <SectionHead id="collection-heading" title="合集" />
            <div className="detail-panel flex flex-wrap items-center gap-1.5 p-2.5">
              <Select
                aria-label="选择合集"
                className="filter-select w-full"
                wrapperClassName="min-w-0 flex-1"
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
              <Button
                size="sm"
                variant="primary"
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
                加入
              </Button>
              {collectionMessage ? (
                <p role="status" className="w-full text-2xs leading-normal text-ink-faint">
                  {collectionMessage}
                </p>
              ) : null}
            </div>
          </section>

          <AssetSection caseId={item.id} />

          <section aria-labelledby="export-heading" className="detail-section">
            <SectionHead id="export-heading" title="导出" />
            <div className="detail-panel flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-meta font-medium text-ink">Markdown + JSON</div>
                <p className="mt-0.5 text-2xs leading-normal text-ink-faint">
                  一次写出两份文件，落到 exports/，文件名带版本与日期（v版本-YYYYMMDD）。
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
                  <p role="alert" className="mt-1 text-2xs text-danger">
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
            </div>
          </section>

          <section aria-labelledby="meta-heading" className="detail-section">
            <SectionHead id="meta-heading" title="属性" />
            <dl className="detail-panel">
              <MetaRow label="主域 kind" value={item.kind} />
              <MetaRow label="类目 ID" value={item.categoryId ?? "未归类"} />
              <MetaRow label="平台" value={platformLabel} />
              <MetaRow label="组件层" value={item.componentLayer ?? "不适用"} />
              <MetaRow label="置信度" value={confidenceLabel} />
              <MetaRow label="创建时间" value={formatDateTime(item.createdAt)} />
              <MetaRow label="更新时间" value={formatDateTime(item.updatedAt)} />
              <MetaRow label="案例 ID" value={item.id} />
            </dl>
          </section>

          <details className="detail-section group pb-2">
            <summary className="detail-section-head cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line [&::-webkit-details-marker]:hidden">
              <span className="label-eyebrow">更多操作</span>
              <span aria-hidden className="h-px flex-1 bg-line" />
              <span className="inline-flex items-center gap-1 text-2xs text-ink-faint">
                删除与恢复说明
                <ChevronDown
                  size={12}
                  strokeWidth={1.8}
                  aria-hidden
                  className="transition-transform duration-[var(--motion-fast)] group-open:rotate-180"
                />
              </span>
            </summary>
            <div className="detail-panel flex items-center justify-between gap-3 border-danger/25 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-meta font-medium text-ink">软删除这条案例</div>
                <p className="mt-0.5 text-2xs leading-normal text-ink-faint">
                  写入 deleted_at，默认列表不再显示；回收站与恢复入口尚未实现。
                </p>
                {deleteError ? (
                  <p role="alert" className="mt-1 text-2xs text-danger">
                    {deleteError}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
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
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
