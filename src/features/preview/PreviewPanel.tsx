import { useState } from "react";
import { Pause, Play, Repeat, RotateCcw } from "lucide-react";

import { ParamPanel } from "@/features/preview/ParamPanel";
import { PreviewStage } from "@/features/preview/PreviewStage";
import {
  describePreview,
  PREVIEW_KIND_LABELS,
  type ParamEvidence,
  type PreviewSpec,
} from "@/lib/preview";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useUiStore } from "@/stores/uiStore";

interface PreviewPanelProps {
  spec: PreviewSpec;
  onChange: (next: PreviewSpec) => void;
  /** 对比覆盖层打开时暂停预览，释放动画与合成层，DOM 不卸载 */
  paused?: boolean;
  evidence?: ParamEvidence | null;
}

export function PreviewPanel({ spec, onChange, paused = false, evidence = null }: PreviewPanelProps) {
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [revision, setRevision] = useState(0);
  const userReduceMotion = useUiStore((state) => state.reduceMotion);
  const systemReduceMotion = usePrefersReducedMotion();
  const reducedMotion = userReduceMotion || systemReduceMotion;
  const active = playing && !paused;

  const replay = () => {
    setRevision((value) => value + 1);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    replay();
  };

  const updateAndReplay = (next: PreviewSpec) => {
    onChange(next);
    setRevision((value) => value + 1);
    setPlaying(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="stage-shell">
        <div className="stage-toolbar">
          <button
            type="button"
            className="stage-tool"
            data-on={active}
            aria-label={active ? "暂停预览" : "播放预览"}
            aria-pressed={active}
            onClick={togglePlay}
          >
            {active ? (
              <Pause size={12} strokeWidth={2} aria-hidden />
            ) : (
              <Play size={12} strokeWidth={2} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="stage-tool"
            aria-label="重播预览"
            onClick={replay}
          >
            <RotateCcw size={12} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className="stage-tool"
            data-on={loop && !reducedMotion}
            aria-label="循环播放"
            aria-pressed={loop && !reducedMotion}
            disabled={reducedMotion}
            onClick={() => setLoop((value) => !value)}
          >
            <Repeat size={12} strokeWidth={2} aria-hidden />
          </button>

          <span aria-hidden className="mx-1 h-3 w-px bg-line" />
          <span className="truncate font-mono text-2xs tracking-[0.12em] text-ink-faint">
            {PREVIEW_KIND_LABELS[spec.kind]}
          </span>
          <span className="ml-auto font-mono text-2xs text-ink-faint">
            {paused ? "PAUSED" : playing ? (loop && !reducedMotion ? "LOOP" : "PLAYING") : "PAUSED"}
          </span>
        </div>

        <div className="relative" style={{ height: "var(--stage-height)" }}>
          <PreviewStage
            spec={spec}
            playing={active}
            loop={loop && !reducedMotion}
            revision={revision}
            interactive
          />
        </div>

        <div className="stage-status">
          <span className="min-w-0 truncate">{describePreview(spec)}</span>
          <span className="ml-auto shrink-0">
            {reducedMotion ? "减少动效" : loop ? "循环" : "单次"}
          </span>
        </div>
      </div>

      <div className="detail-panel px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="label-eyebrow">参数</span>
          <span className="font-mono text-2xs text-ink-faint">改值即时生效</span>
        </div>
        <ParamPanel spec={spec} onChange={updateAndReplay} evidence={evidence} />
      </div>
    </div>
  );
}
