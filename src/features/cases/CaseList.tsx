import { useEffect, useRef, useState, type MutableRefObject } from "react";
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
  selectedIds: Set<string>;
  view: "grid" | "table";
  favoriteBusyId: string | null;
  onSelect: (id: string) => void;
  onToggleMulti: (id: string) => void;
  onMarqueeSelect: (ids: string[], additive: boolean) => void;
  onClearMulti: () => void;
  onToggleFavorite: (id: string) => void;
}

const GRID_GAP = 10;
const CARD_BODY_HEIGHT = 62;
const CARD_PADDING = 12;
const TABLE_ROW_HEIGHT = 36;
const OVERSCAN = 6;

function kindLabel(kind: string): string {
  return CASE_KIND_LABELS[kind as CaseKind] ?? kind;
}

/**
 * 固定行高虚拟滚动：滚动容器沿用 #content-list，只渲染视口 ± overscan。
 * total 为「行数」；网格按列数把条目切成行后传入。
 */
function useWindowedRange(
  total: number,
  rowHeight: number,
  anchorRef: MutableRefObject<HTMLDivElement | null>,
) {
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
  }, [total, rowHeight, anchorRef]);

  return range;
}

/** 测量网格容器宽度，决定 1 / 2 / 3 列；窗口与面板拖动都会触发 */
function useContainerWidth(ref: MutableRefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const apply = () => setWidth(Math.round(element.getBoundingClientRect().width));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

function FavoriteButton({
  item,
  busy,
  overlay = false,
  onToggle,
}: {
  item: CaseSummary;
  busy: boolean;
  overlay?: boolean;
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
      data-on={overlay ? item.isFavorite : undefined}
      className={cn(
        overlay
          ? "list-card-fav"
          : "flex h-5 w-5 shrink-0 items-center justify-center rounded-xs transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line disabled:opacity-40",
        !overlay &&
          (item.isFavorite
            ? "text-accent"
            : "text-ink-faint hover:bg-surface hover:text-ink-soft"),
        !overlay && busy && "opacity-40",
      )}
    >
      <Star
        size={overlay ? 11 : 12}
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
  multiSelected,
  busy,
  poster,
  thumbHeight,
  onSelect,
  onToggleMulti,
  onToggleFavorite,
}: {
  item: CaseSummary;
  selected: boolean;
  multiSelected: boolean;
  busy: boolean;
  poster: string | null;
  thumbHeight: number;
  onSelect: (id: string) => void;
  onToggleMulti: (id: string) => void;
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
      title={`${item.title} · 更新 ${formatDateTime(item.updatedAt)}`}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          onToggleMulti(item.id);
          return;
        }
        onSelect(item.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) onToggleMulti(item.id);
          else onSelect(item.id);
        }
      }}
      {...cardHandlers}
      data-case-id={item.id}
      data-selected={selected}
      data-multi-selected={multiSelected}
      className="list-card group h-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
    >
      <div ref={thumbRef} className="list-card-thumb" style={{ height: thumbHeight }}>
        {spec && poster ? (
          <img src={poster} alt="" draggable={false} loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-2xs tracking-[0.1em] text-ink-faint">
            无预览规格
          </div>
        )}
        {spec ? <span className="list-card-hint">预览</span> : null}
      </div>

      <FavoriteButton
        item={item}
        busy={busy}
        overlay
        onToggle={onToggleFavorite}
      />

      <div className="list-card-body" style={{ minHeight: CARD_BODY_HEIGHT }}>
        <span className="list-card-title">{item.title}</span>
        <div className="list-card-meta">
          <span className="list-card-kind">{kindLabel(item.kind)}</span>
          <span aria-hidden className="text-ink-faint">
            /
          </span>
          <span className="truncate">{PLATFORM_LABELS[item.platform] ?? item.platform}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
            <span className="confidence-dot" data-tone={item.confidence} />
            <span className="truncate">
              {CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function CardList({
  cases,
  selectedId,
  selectedIds,
  favoriteBusyId,
  onSelect,
  onToggleMulti,
  onMarqueeSelect,
  onClearMulti,
  onToggleFavorite,
}: Omit<CaseListProps, "view">) {
  const theme = useUiStore((state) => state.resolvedTheme);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; additive: boolean; moved: boolean } | null>(null);
  const width = useContainerWidth(anchorRef);
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const columns = width >= 540 ? 3 : width >= 330 ? 2 : 1;
  const cardWidth = width > 0 ? (width - GRID_GAP * (columns - 1)) / columns : 0;
  const thumbWidth = Math.max(cardWidth - CARD_PADDING - 2, 0);
  const thumbHeight =
    columns === 1
      ? Math.min(Math.max(thumbWidth * 0.42, 96), 132)
      : Math.max(Math.round(thumbWidth / 1.6), 88);
  const cardHeight = CARD_PADDING + thumbHeight + CARD_BODY_HEIGHT;
  const rowHeight = cardHeight + GRID_GAP;
  const rows = Math.ceil(cases.length / columns);

  const { start, end } = useWindowedRange(rows, rowHeight, anchorRef);

  // 框选：从空白处按下拖动，松手时收集与选框相交的卡片
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-case-id]")) return;
    if (target.closest("button, input, a, summary")) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const anchor = anchorRef.current;
    if (!drag || !anchor) return;
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.x) < 4 && Math.abs(event.clientY - drag.y) < 4) return;
      drag.moved = true;
      document.body.style.userSelect = "none";
    }
    const anchorRect = anchor.getBoundingClientRect();
    setMarquee({
      left: Math.min(drag.x, event.clientX) - anchorRect.left,
      top: Math.min(drag.y, event.clientY) - anchorRect.top,
      width: Math.abs(event.clientX - drag.x),
      height: Math.abs(event.clientY - drag.y),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const anchor = anchorRef.current;
    dragRef.current = null;
    setMarquee(null);
    document.body.style.userSelect = "";
    if (!drag || !anchor) return;
    if (!drag.moved) {
      onClearMulti();
      return;
    }
    const box = {
      left: Math.min(drag.x, event.clientX),
      right: Math.max(drag.x, event.clientX),
      top: Math.min(drag.y, event.clientY),
      bottom: Math.max(drag.y, event.clientY),
    };
    const hits: string[] = [];
    anchor.querySelectorAll<HTMLElement>("[data-case-id]").forEach((element) => {
      const rect = element.getBoundingClientRect();
      const intersects =
        rect.right > box.left &&
        rect.left < box.right &&
        rect.bottom > box.top &&
        rect.top < box.bottom;
      if (intersects && element.dataset.caseId) hits.push(element.dataset.caseId);
    });
    onMarqueeSelect(hits, drag.additive);
  };

  if (width === 0) {
    return <div ref={anchorRef} className="relative w-full" />;
  }

  return (
    <div
      ref={anchorRef}
      className="relative w-full"
      style={{ height: Math.max(rows * rowHeight - GRID_GAP, 0) }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {Array.from({ length: Math.max(end - start, 0) }, (_, offset) => {
        const row = start + offset;
        const slice = cases.slice(row * columns, (row + 1) * columns);
        return (
          <div
            key={row}
            className="case-grid-row"
            style={{
              top: row * rowHeight,
              height: cardHeight,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {slice.map((item) => {
              const spec = parsePreviewSpec(item.payloadJson);
              return (
                <CaseCard
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  multiSelected={selectedIds.has(item.id)}
                  busy={favoriteBusyId === item.id}
                  poster={spec ? getPosterUri(spec, theme) : null}
                  thumbHeight={thumbHeight}
                  onSelect={onSelect}
                  onToggleMulti={onToggleMulti}
                  onToggleFavorite={onToggleFavorite}
                />
              );
            })}
          </div>
        );
      })}

      {marquee ? (
        <div
          aria-hidden
          data-marquee
          className="pointer-events-none absolute z-20 rounded-xs border border-accent-line bg-accent/10"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      ) : null}
    </div>
  );
}

function TableList({
  cases,
  selectedId,
  selectedIds,
  favoriteBusyId,
  onSelect,
  onToggleMulti,
  onToggleFavorite,
}: Omit<CaseListProps, "view" | "onMarqueeSelect" | "onClearMulti">) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const { start, end } = useWindowedRange(cases.length, TABLE_ROW_HEIGHT, anchorRef);
  const visible = cases.slice(start, end);

  return (
    <div ref={anchorRef} className="table-shell">
      <table className="list-table w-full table-fixed">
        <thead>
          <tr>
            <th>标题</th>
            <th className="w-[36px]">类型</th>
            <th className="w-[54px]">平台</th>
            <th className="w-[68px]">置信度</th>
            <th className="w-[74px]">更新</th>
            <th className="w-[24px]" aria-label="收藏" />
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
            const multiSelected = selectedIds.has(item.id);
            return (
              <tr
                key={item.id}
                data-case-id={item.id}
                data-selected={selected}
                data-multi-selected={multiSelected}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    onToggleMulti(item.id);
                  }
                }}
              >
                <td data-primary="true">
                  <button
                    type="button"
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();
                        onToggleMulti(item.id);
                        return;
                      }
                      onSelect(item.id);
                    }}
                    className="cell-title w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
                  >
                    {item.title}
                  </button>
                </td>
                <td>{kindLabel(item.kind)}</td>
                <td>{PLATFORM_LABELS[item.platform] ?? item.platform}</td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="confidence-dot" data-tone={item.confidence} />
                    {CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
                  </span>
                </td>
                <td className="font-mono text-2xs text-ink-faint">
                  {formatDateTime(item.updatedAt)}
                </td>
                <td className="px-1">
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
        selectedIds={props.selectedIds}
        favoriteBusyId={props.favoriteBusyId}
        onSelect={props.onSelect}
        onToggleMulti={props.onToggleMulti}
        onToggleFavorite={props.onToggleFavorite}
      />
    );
  }

  return (
    <CardList
      cases={props.cases}
      selectedId={props.selectedId}
      selectedIds={props.selectedIds}
      favoriteBusyId={props.favoriteBusyId}
      onSelect={props.onSelect}
      onToggleMulti={props.onToggleMulti}
      onMarqueeSelect={props.onMarqueeSelect}
      onClearMulti={props.onClearMulti}
      onToggleFavorite={props.onToggleFavorite}
    />
  );
}
