import { Star } from "lucide-react";

import { PreviewStage } from "@/features/preview/PreviewStage";
import { useCardPreview } from "@/features/preview/useCardPreview";
import { CASE_KIND_LABELS, CONFIDENCE_LABELS, type CaseKind } from "@/lib/constants";
import type { CaseSummary } from "@/lib/ipc";
import { parsePreviewSpec } from "@/lib/preview";
import { cn, formatDateTime } from "@/lib/utils";

interface CaseListProps {
  cases: CaseSummary[];
  selectedId: string | null;
  view: "grid" | "table";
  favoriteBusyId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

function kindLabel(kind: string): string {
  return CASE_KIND_LABELS[kind as CaseKind] ?? kind;
}

function FavoriteButton({
  item,
  busy,
  onToggle,
}: {
  item: CaseSummary;
  busy: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={item.isFavorite ? "取消收藏" : "收藏"}
      aria-pressed={item.isFavorite}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(item.id);
      }}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-xs transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line disabled:opacity-40",
        item.isFavorite ? "text-accent" : "text-ink-faint hover:bg-surface hover:text-ink-soft",
      )}
    >
      <Star
        size={12}
        strokeWidth={1.9}
        fill={item.isFavorite ? "currentColor" : "none"}
        aria-hidden
      />
    </button>
  );
}

function CaseCard({
  item,
  selected,
  busy,
  onSelect,
  onToggleFavorite,
}: {
  item: CaseSummary;
  selected: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const spec = parsePreviewSpec(item.payloadJson);
  const { cardRef, thumbRef, cardHandlers } = useCardPreview(item.id, spec);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${item.title}（${kindLabel(item.kind)}）`}
      onClick={() => onSelect(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.id);
        }
      }}
      {...cardHandlers}
      className={cn(
        "group cursor-pointer rounded-md border bg-raised p-2.5 text-left shadow-ambient transition-colors duration-[var(--motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line",
        selected
          ? "border-accent-line bg-accent-soft"
          : "border-line hover:border-line-strong hover:bg-surface",
      )}
    >
      <div
        ref={thumbRef}
        className="relative mb-2.5 h-[72px] overflow-hidden rounded-xs border border-line bg-sunken"
      >
        {spec ? (
          <PreviewStage spec={spec} playing={false} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-2xs tracking-[0.1em] text-ink-faint">
            无预览规格
          </div>
        )}
        {spec ? (
          <span className="absolute right-1.5 top-1.5 rounded-xs border border-line bg-surface px-1 py-0.5 font-mono text-2xs text-ink-faint">
            悬停播放
          </span>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug text-ink">{item.title}</span>
        <FavoriteButton item={item} busy={busy} onToggle={onToggleFavorite} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-2xs text-ink-faint">
        <span className="rounded-xs border border-line px-1.5 py-0.5 text-ink-soft">
          {kindLabel(item.kind)}
        </span>
        <span aria-hidden className="h-0.5 w-0.5 rounded-pill bg-ink-faint" />
        <span>{CONFIDENCE_LABELS[item.confidence] ?? item.confidence}</span>
        <span className="ml-auto font-mono">{formatDateTime(item.updatedAt)}</span>
      </div>
    </div>
  );
}

export function CaseList({
  cases,
  selectedId,
  view,
  favoriteBusyId,
  onSelect,
  onToggleFavorite,
}: CaseListProps) {
  if (view === "table") {
    return (
      <div className="overflow-x-auto rounded-md border border-line bg-raised">
        <table className="w-full min-w-[300px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-sunken text-left">
              <th className="px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                标题
              </th>
              <th className="px-2 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                类型
              </th>
              <th className="px-2 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                置信度
              </th>
              <th className="px-2 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                更新
              </th>
              <th className="w-8 px-1 py-2" aria-label="收藏" />
            </tr>
          </thead>
          <tbody>
            {cases.map((item) => {
              const selected = item.id === selectedId;
              return (
                <tr
                  key={item.id}
                  className={cn(
                    "border-b border-line last:border-b-0",
                    selected ? "bg-accent-soft" : "hover:bg-surface",
                  )}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className="block w-full truncate text-left text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                    >
                      {item.title}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-meta text-ink-soft">{kindLabel(item.kind)}</td>
                  <td className="px-2 py-2 text-meta text-ink-soft">
                    {CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-2xs text-ink-faint">
                    {formatDateTime(item.updatedAt)}
                  </td>
                  <td className="px-1 py-2">
                    <FavoriteButton
                      item={item}
                      busy={favoriteBusyId === item.id}
                      onToggle={onToggleFavorite}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {cases.map((item) => (
        <CaseCard
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          busy={favoriteBusyId === item.id}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
