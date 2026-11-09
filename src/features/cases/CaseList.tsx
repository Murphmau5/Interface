import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

import { useCardPreview } from "@/features/preview/useCardPreview";
import { getPosterUri } from "@/features/preview/poster";
import { CASE_KIND_LABELS, CONFIDENCE_LABELS, PLATFORM_LABELS, type CaseKind } from "@/lib/constants";
import type { CaseSummary } from "@/lib/ipc";
import { parsePreviewSpec } from "@/lib/preview";
import { cn, formatDateTime } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";

interface CaseListProps {
  cases: CaseSummary[];
  selectedId: string | null;
  view: "grid" | "table";
  favoriteBusyId: string | null;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const GRID_ROW_HEIGHT = 168;
const GRID_GAP = 8;
const TABLE_ROW_HEIGHT = 37;
const OVERSCAN = 6;

function kindLabel(kind: string): string {
  return CASE_KIND_LABELS[kind as CaseKind] ?? kind;
}

/**
 * 固定行高虚拟滚动：滚动容器沿用 #content-list，只渲染视口 ± overscan。
 * 监听 scroll（rAF 合并）+ ResizeObserver，卸载时全部解绑。
 */
function useWindowedRange(total: number, rowHeight: number) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(total, 24) });

  useEffect(() => {
    const scroller = document.getElementById("content-list");
    const anchor = anchorRef.current;
    if (!scroller || !anchor) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const scrollerRect = scroller.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const anchorTop = anchorRect.top - scrollerRect.top + scroller.scrollTop;
      const relative = scroller.scrollTop - anchorTop;

      const start = Math.max(0, Math.floor(relative / rowHeight) - OVERSCAN);
      const visibleRows = Math.ceil(scroller.clientHeight / rowHeight) + OVERSCAN * 2;
      const end = Math.min(total, start + visibleRows);

      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(anchor);

    return () => {
      scroller.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [total, rowHeight]);

  return { anchorRef, ...range };
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
  poster,
  onSelect,
  onToggleFavorite,
}: {
  item: CaseSummary;
  selected: boolean;
  busy: boolean;
  poster: string | null;
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
        "group flex h-full cursor-pointer flex-col rounded-md border bg-raised p-2.5 text-left shadow-ambient transition-colors duration-[var(--motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line",
        selected
          ? "border-accent-line bg-accent-soft"
          : "border-line hover:border-line-strong hover:bg-surface",
      )}
    >
      <div
        ref={thumbRef}
        className="relative mb-2.5 h-[72px] shrink-0 overflow-hidden rounded-xs border border-line bg-sunken"
      >
        {spec && poster ? (
          <img
            src={poster}
            alt=""
            draggable={false}
            loading="lazy"
            className="h-full w-full object-cover"
          />
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

      <div className="flex min-h-0 items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug text-ink">{item.title}</span>
        <FavoriteButton item={item} busy={busy} onToggle={onToggleFavorite} />
      </div>
      <div className="mt-auto flex items-center gap-2 pt-2 text-2xs text-ink-faint">
        <span className="rounded-xs border border-line px-1.5 py-0.5 text-ink-soft">
          {kindLabel(item.kind)}
        </span>
        <span className="rounded-xs border border-line px-1.5 py-0.5 text-ink-soft">
          {PLATFORM_LABELS[item.platform] ?? item.platform}
        </span>
        <span aria-hidden className="h-0.5 w-0.5 rounded-pill bg-ink-faint" />
        <span className="truncate">{CONFIDENCE_LABELS[item.confidence] ?? item.confidence}</span>
        <span className="ml-auto shrink-0 font-mono">{formatDateTime(item.updatedAt)}</span>
      </div>
    </div>
  );
}

function CardList({
  cases,
  selectedId,
  favoriteBusyId,
  onSelect,
  onToggleFavorite,
}: Omit<CaseListProps, "view">) {
  const theme = useUiStore((state) => state.resolvedTheme);
  const { anchorRef, start, end } = useWindowedRange(cases.length, GRID_ROW_HEIGHT);
  const visible = cases.slice(start, end);

  return (
    <div
      ref={anchorRef}
      className="relative w-full"
      style={{ height: cases.length * GRID_ROW_HEIGHT }}
    >
      {visible.map((item, offset) => {
        const index = start + offset;
        const spec = parsePreviewSpec(item.payloadJson);
        return (
          <div
            key={item.id}
            className="absolute left-0 right-0"
            style={{
              top: index * GRID_ROW_HEIGHT,
              height: GRID_ROW_HEIGHT - GRID_GAP,
            }}
          >
            <CaseCard
              item={item}
              selected={item.id === selectedId}
              busy={favoriteBusyId === item.id}
              poster={spec ? getPosterUri(spec, theme) : null}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
            />
          </div>
        );
      })}
    </div>
  );
}

function TableList({
  cases,
  selectedId,
  favoriteBusyId,
  onSelect,
  onToggleFavorite,
}: Omit<CaseListProps, "view">) {
  const { anchorRef, start, end } = useWindowedRange(cases.length, TABLE_ROW_HEIGHT);
  const visible = cases.slice(start, end);

  return (
    <div ref={anchorRef} className="overflow-x-auto rounded-md border border-line bg-raised">
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
              平台
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
          {start > 0 ? (
            <tr aria-hidden style={{ height: start * TABLE_ROW_HEIGHT }}>
              <td colSpan={6} className="p-0" />
            </tr>
          ) : null}

          {visible.map((item) => {
            const selected = item.id === selectedId;
            return (
              <tr
                key={item.id}
                className={cn(
                  "h-[37px] border-b border-line last:border-b-0",
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
                  {PLATFORM_LABELS[item.platform] ?? item.platform}
                </td>
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

          {end < cases.length ? (
            <tr aria-hidden style={{ height: (cases.length - end) * TABLE_ROW_HEIGHT }}>
              <td colSpan={6} className="p-0" />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function CaseList(props: CaseListProps) {
  if (props.view === "table") {
    return (
      <TableList
        cases={props.cases}
        selectedId={props.selectedId}
        favoriteBusyId={props.favoriteBusyId}
        onSelect={props.onSelect}
        onToggleFavorite={props.onToggleFavorite}
      />
    );
  }

  return (
    <CardList
      cases={props.cases}
      selectedId={props.selectedId}
      favoriteBusyId={props.favoriteBusyId}
      onSelect={props.onSelect}
      onToggleFavorite={props.onToggleFavorite}
    />
  );
}
