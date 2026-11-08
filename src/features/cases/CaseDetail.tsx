import { useState, type FormEvent } from "react";
import { SlidersHorizontal, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import { useDeleteCase, useRenameCase } from "@/features/cases/api";
import { PreviewPanel } from "@/features/preview/PreviewPanel";
import {
  CASE_KIND_LABELS,
  CONFIDENCE_LABELS,
  type CaseKind,
} from "@/lib/constants";
import type { CaseSummary } from "@/lib/ipc";
import { parsePreviewSpec } from "@/lib/preview";
import { cn, formatDateTime } from "@/lib/utils";

interface CaseDetailProps {
  item: CaseSummary;
  favoriteBusy: boolean;
  onToggleFavorite: (id: string) => void;
  onDeleted: () => void;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="shrink-0 text-meta text-ink-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-meta text-ink-soft">{value}</dd>
    </div>
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
  const renameCase = useRenameCase();
  const deleteCase = useDeleteCase();

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
            {CASE_KIND_LABELS[item.kind as CaseKind] ?? item.kind}
          </span>
          <span className="rounded-xs border border-line px-1.5 py-0.5 text-2xs text-ink-soft">
            置信度 · {CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
          </span>
          <span className="font-mono text-2xs text-ink-faint">#{item.id.slice(0, 8)}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-6 py-5">
          <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
            <div id="preview-heading" className="label-eyebrow">
              预览
            </div>
            <PreviewPanel spec={parsePreviewSpec(item.payloadJson)} payloadJson={item.payloadJson} />
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
                <MetaRow label="置信度" value={CONFIDENCE_LABELS[item.confidence] ?? item.confidence} />
                <MetaRow label="创建时间" value={formatDateTime(item.createdAt)} />
                <MetaRow label="更新时间" value={formatDateTime(item.updatedAt)} />
                <MetaRow label="案例 ID" value={item.id} />
              </dl>
            </Card>
          </section>

          <section aria-labelledby="payload-heading" className="flex flex-col gap-2">
            <div id="payload-heading" className="label-eyebrow">
              参数面板
            </div>
            <EmptyState
              compact
              icon={<SlidersHorizontal size={14} strokeWidth={1.7} />}
              title="payload 为空"
              description="当前案例只保存了最小壳（标题 / 类型 / 置信度）。参数编辑与置信度芯片将在 Phase 2 接入。"
              action={
                <Tooltip content="Phase 2 才提供参数编辑，当前按钮不执行任何操作">
                  <span tabIndex={0}>
                    <Button size="sm" disabled>
                      添加参数
                    </Button>
                  </span>
                </Tooltip>
              }
            />
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
