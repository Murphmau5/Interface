import { useState } from "react";
import { Play, RotateCcw, Square } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { ParamPanel } from "@/features/preview/ParamPanel";
import { PreviewStage } from "@/features/preview/PreviewStage";
import { describePreview, PREVIEW_KIND_LABELS, type PreviewSpec } from "@/lib/preview";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useUiStore } from "@/stores/uiStore";

interface PreviewPanelProps {
  spec: PreviewSpec;
  onChange: (next: PreviewSpec) => void;
}

export function PreviewPanel({ spec, onChange }: PreviewPanelProps) {
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [revision, setRevision] = useState(0);
  const userReduceMotion = useUiStore((state) => state.reduceMotion);
  const systemReduceMotion = usePrefersReducedMotion();
  const reducedMotion = userReduceMotion || systemReduceMotion;

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
    <div className="flex flex-col gap-2.5">
      <Card className="relative overflow-hidden bg-sunken">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <span className="font-mono text-2xs tracking-[0.12em] text-ink-faint">
            PREVIEW / {PREVIEW_KIND_LABELS[spec.kind]}
          </span>
          <span className="font-mono text-2xs text-ink-faint">
            {playing ? (loop && !reducedMotion ? "LOOP" : "PLAYING") : "PAUSED"}
          </span>
        </div>
        <div className="relative h-56">
          <PreviewStage
            spec={spec}
            playing={playing}
            loop={loop && !reducedMotion}
            revision={revision}
            interactive
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={playing ? "secondary" : "primary"}
          icon={playing ? <Square size={12} strokeWidth={2} /> : <Play size={12} strokeWidth={2} />}
          onClick={togglePlay}
        >
          {playing ? "停止" : "播放"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw size={12} strokeWidth={2} />}
          onClick={replay}
        >
          重播
        </Button>
        <span className="ml-auto min-w-0 truncate font-mono text-2xs text-ink-faint">
          {describePreview(spec)}
        </span>
      </div>

      <Switch
        checked={loop && !reducedMotion}
        disabled={reducedMotion}
        onChange={setLoop}
        label="循环播放"
        description={
          reducedMotion
            ? "已开启「减少动效」：预览只播放一次，不循环。"
            : "循环仅作用于右栏完整预览；悬停微预览始终自动播放。"
        }
      />

      <Card className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="label-eyebrow">参数</span>
          <span className="font-mono text-2xs text-ink-faint">改值即时生效 · 无需应用</span>
        </div>
        <ParamPanel spec={spec} onChange={updateAndReplay} />
      </Card>
    </div>
  );
}
