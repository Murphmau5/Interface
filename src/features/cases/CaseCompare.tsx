import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Pause, Play, Repeat, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useCatalog } from "@/features/cases/api";
import { PreviewStage } from "@/features/preview/PreviewStage";
import {
  CASE_KIND_LABELS,
  CONFIDENCE_LABELS,
  PLATFORM_LABELS,
  type CaseKind,
} from "@/lib/constants";
import type { CaseSummary } from "@/lib/ipc";
import {
  defaultPreviewSpec,
  describePreview,
  parsePreviewSpec,
  previewFields,
  type PreviewField,
  type PreviewKind,
  type PreviewSpec,
} from "@/lib/preview";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface CaseCompareProps {
  left: CaseSummary;
  right: CaseSummary;
  onExit: () => void;
}

const PREVIEW_KINDS: PreviewKind[] = ["motion", "feedback", "component", "theme", "style"];

function specFor(item: CaseSummary): PreviewSpec {
  const kind = (PREVIEW_KINDS as string[]).includes(item.kind)
    ? (item.kind as PreviewKind)
    : "motion";
  return parsePreviewSpec(item.payloadJson) ?? defaultPreviewSpec(kind);
}

function rawValue(spec: PreviewSpec, key: string): string | number | undefined {
  const value = (spec as unknown as Record<string, string | number | undefined>)[key];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/** select 字段显示中文选项名，数值字段带单位；一边没有这个字段时显示破折号 */
function displayValue(field: PreviewField, value: string | number | undefined): string {
  if (value === undefined) return "—";
  if (field.type === "select") {
    return field.options?.find((option) => option.value === value)?.label ?? String(value);
  }
  return `${value}${field.unit ?? ""}`;
}

function sameValue(left: string | number | undefined, right: string | number | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return String(left) === String(right);
}

interface CompareRow {
  key: string;
  label: string;
  leftText: string;
  rightText: string;
  differs: boolean;
}

export function CaseCompare({ left, right, onExit }: CaseCompareProps) {
  const catalog = useCatalog();
  const userReduceMotion = useUiStore((state) => state.reduceMotion);
  const systemReduceMotion = usePrefersReducedMotion();
  const reducedMotion = userReduceMotion || systemReduceMotion;

  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [revision, setRevision] = useState({ left: 0, right: 0 });
  const [showSame, setShowSame] = useState(false);

  const leftSpec = useMemo(() => specFor(left), [left]);
  const rightSpec = useMemo(() => specFor(right), [right]);

  // 对比是覆盖层：Esc 只关它，不再触发下面的类目清除 / 返回一级
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (useUiStore.getState().onboardingOpen) return;
      event.preventDefault();
      event.stopPropagation();
      onExit();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onExit]);

  const replayAll = () => {
    setRevision((prev) => ({ left: prev.left + 1, right: prev.right + 1 }));
    setPlaying(true);
  };

  const replaySide = (side: "left" | "right") => {
    setRevision((prev) => ({ ...prev, [side]: prev[side] + 1 }));
    setPlaying(true);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    replayAll();
  };

  const rows = useMemo<CompareRow[]>(() => {
    const fields = new Map<string, PreviewField>();
    for (const field of previewFields(leftSpec)) fields.set(field.key, field);
    for (const field of previewFields(rightSpec)) {
      if (!fields.has(field.key)) fields.set(field.key, field);
    }
    return [...fields.values()].map((field) => {
      const leftValue = rawValue(leftSpec, field.key);
      const rightValue = rawValue(rightSpec, field.key);
      return {
        key: field.key,
        label: field.label,
        leftText: displayValue(field, leftValue),
        rightText: displayValue(field, rightValue),
        differs: !sameValue(leftValue, rightValue),
      };
    });
  }, [leftSpec, rightSpec]);

  const diffRows = rows.filter((row) => row.differs);
  const sameRows = rows.filter((row) => !row.differs);

  const categoryLabel = (categoryId: string | null): string | null =>
    catalog.data
      ?.flatMap((domain) => domain.groups)
      .flatMap((group) => group.categories)
      .find((category) => category.id === categoryId)?.label ?? null;

  const leftConfidence = CONFIDENCE_LABELS[left.confidence] ?? left.confidence;
  const rightConfidence = CONFIDENCE_LABELS[right.confidence] ?? right.confidence;
  const confidenceDiffers = left.confidence !== right.confidence;
  const hasVerified = [left.confidence, right.confidence].includes("verified");
  const hasEstimated = [left.confidence, right.confidence].includes("estimated");

  const side = (item: CaseSummary, spec: PreviewSpec, which: "left" | "right") => {
    const category = categoryLabel(item.categoryId);
    return (
      <section
        aria-label={`对比${which === "left" ? "左" : "右"}侧：${item.title}`}
        data-compare-side={which}
        className="flex min-w-0 flex-col rounded-sm border border-line bg-surface"
      >
        <div className="flex items-start gap-2 border-b border-line px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <div className="label-eyebrow">{which === "left" ? "左" : "右"}</div>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-ink" title={item.title}>
              {item.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="chip">{CASE_KIND_LABELS[item.kind as CaseKind] ?? item.kind}</span>
              <span className="chip">
                {PLATFORM_LABELS[item.platform] ?? item.platform}
              </span>
              <span
                className="chip"
                data-compare-confidence={item.confidence}
                data-confidence-diff={confidenceDiffers ? "true" : "false"}
              >
                <span className="confidence-dot" data-tone={item.confidence} />
                {CONFIDENCE_LABELS[item.confidence] ?? item.confidence}
              </span>
              {category ? (
                <span className="chip" data-tone="accent">
                  {category}
                </span>
              ) : null}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            data-compare-replay={which}
            title="只重播这一侧"
            icon={<RotateCcw size={12} strokeWidth={1.9} aria-hidden />}
            onClick={() => replaySide(which)}
          >
            重播
          </Button>
        </div>

        <div className="relative" style={{ height: 232 }}>
          <PreviewStage
            spec={spec}
            playing={playing}
            loop={loop && !reducedMotion}
            revision={revision[which]}
            interactive
          />
        </div>

        <div className="flex items-center gap-2 border-t border-line px-2.5 py-1.5">
          <span className="min-w-0 truncate text-2xs text-ink-faint">{describePreview(spec)}</span>
          <span className="ml-auto shrink-0 font-mono text-2xs text-ink-faint">
            {playing ? (loop && !reducedMotion ? "LOOP" : "PLAYING") : "PAUSED"}
          </span>
        </div>
      </section>
    );
  };

  return (
    <div data-compare-view className="absolute inset-0 z-40 flex min-h-0 flex-col bg-bg">
      <header className="shrink-0 border-b border-line px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <ArrowLeftRight size={14} strokeWidth={1.8} aria-hidden className="text-accent" />
          <h1 className="text-sm font-semibold text-ink">并排对比</h1>
          <span className="text-2xs text-ink-faint">
            只高亮值不同的字段，相同项默认折叠
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-2xs text-ink-faint">Esc 退出</span>
            <Button
              size="sm"
              variant="ghost"
              data-compare-exit
              icon={<X size={13} strokeWidth={1.8} aria-hidden />}
              onClick={onExit}
            >
              返回列表
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {confidenceDiffers ? (
          <p
            role="status"
            data-compare-confidence-warning={hasVerified && hasEstimated ? "trust" : "diff"}
            className={cn(
              "mb-2 rounded-sm border px-2.5 py-2 text-2xs leading-relaxed",
              hasVerified && hasEstimated
                ? "border-danger/25 bg-danger/10 text-danger"
                : "border-line-strong bg-sunken text-ink-soft",
            )}
          >
            置信度不同：左「{leftConfidence}」、右「{rightConfidence}」。
            {hasVerified && hasEstimated
              ? "左边有可核对的原始规格，右边是从页面推测的值，不要把两者当成同等可信。"
              : "两边可信程度不同，引用前先看各自的来源。"}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            data-compare-play
            aria-pressed={playing}
            icon={
              playing ? (
                <Pause size={12} strokeWidth={2} aria-hidden />
              ) : (
                <Play size={12} strokeWidth={2} aria-hidden />
              )
            }
            onClick={togglePlay}
          >
            {playing ? "同时暂停" : "同时播放"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-compare-replay-all
            icon={<RotateCcw size={12} strokeWidth={2} aria-hidden />}
            onClick={replayAll}
          >
            同时重播
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-compare-loop
            aria-pressed={loop && !reducedMotion}
            disabled={reducedMotion}
            icon={<Repeat size={12} strokeWidth={2} aria-hidden />}
            onClick={() => setLoop((value) => !value)}
          >
            循环
          </Button>
          <span className="ml-auto font-mono text-2xs text-ink-faint">
            {reducedMotion ? "减少动效" : loop ? "两侧同帧 · 循环" : "两侧同帧 · 单次"}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2.5">
          {side(left, leftSpec, "left")}
          {side(right, rightSpec, "right")}
        </div>

        <section
          data-compare-table
          aria-label="参数对比"
          className="mt-2.5 overflow-hidden rounded-sm border border-line bg-surface"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-2.5 py-2">
            <span className="label-eyebrow">参数差异</span>
            <span className="text-2xs text-ink-faint">
              {diffRows.length} 项不同 · {sameRows.length} 项相同
            </span>
            {leftSpec.kind !== rightSpec.kind ? (
              <span className="text-2xs text-ink-faint">
                两侧内容域不同，只列出同名字段
              </span>
            ) : null}
          </div>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col" className="w-24">
                  字段
                </th>
                <th scope="col" className="truncate" title={left.title}>
                  {left.title}
                </th>
                <th scope="col" className="truncate" title={right.title}>
                  {right.title}
                </th>
              </tr>
            </thead>
            <tbody>
              {diffRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-ink-faint">
                    两侧参数完全一致，没有需要标注的差异。
                  </td>
                </tr>
              ) : (
                diffRows.map((row) => (
                  <tr key={row.key} data-compare-row="diff" data-compare-diff="true">
                    <th scope="row">{row.label}</th>
                    <td>{row.leftText}</td>
                    <td>{row.rightText}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {sameRows.length > 0 ? (
            <>
              <button
                type="button"
                data-compare-same-toggle
                aria-expanded={showSame}
                onClick={() => setShowSame((value) => !value)}
                className="flex w-full items-center gap-2 border-t border-line px-2.5 py-1.5 text-left text-2xs text-ink-faint transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
              >
                {showSame ? "收起相同的项" : `展开相同的 ${sameRows.length} 项`}
                <span aria-hidden className="ml-auto font-mono">
                  {showSame ? "−" : "+"}
                </span>
              </button>
              {showSame ? (
                <table className="compare-table">
                  <tbody>
                    {sameRows.map((row) => (
                      <tr key={row.key} data-compare-row="same" data-compare-diff="false">
                        <th scope="row">{row.label}</th>
                        <td>{row.leftText}</td>
                        <td>{row.rightText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
