import { useState } from "react";
import { Play, RotateCcw, Square } from "lucide-react";

import { PreviewStage } from "@/features/preview/PreviewStage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { describePreview, PREVIEW_TYPE_LABELS, type PreviewSpec } from "@/lib/preview";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useUiStore } from "@/stores/uiStore";

interface PreviewPanelProps {
  spec: PreviewSpec | null;
  payloadJson: string;
}

export function PreviewPanel({ spec, payloadJson }: PreviewPanelProps) {
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [revision, setRevision] = useState(0);
  const userReduceMotion = useUiStore((state) => state.reduceMotion);
  const systemReduceMotion = usePrefersReducedMotion();
  const reducedMotion = userReduceMotion || systemReduceMotion;

  if (!spec) {
    const hasPreviewNode = payloadJson.trim().startsWith("{") && payloadJson.includes("preview");
    return (
      <Card className="instrument-grid relative min-h-56 overflow-hidden bg-sunken p-4">
        <EmptyState
          compact
          title="这条案例没有可播放的预览"
          description={
            hasPreviewNode
              ? "payload 里的 preview 字段不合法（类型 / 时长 / 缓动未通过校验），所以不播放。"
              : "Phase 1 只内置了三条示例案例带预览规格；自建案例的 payload 为空，这里不会播放假动画。"
          }
        />
      </Card>
    );
  }

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setRevision((value) => value + 1);
    setPlaying(true);
  };

  const replay = () => {
    setRevision((value) => value + 1);
    setPlaying(true);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Card className="relative overflow-hidden bg-sunken">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <span className="font-mono text-2xs tracking-[0.12em] text-ink-faint">
            PREVIEW / {PREVIEW_TYPE_LABELS[spec.type]}
          </span>
          <span className="font-mono text-2xs text-ink-faint">
            {playing ? (loop && !reducedMotion ? "LOOP" : "PLAYING") : "FRAME 00"}
          </span>
        </div>
        <div className="relative h-56">
          <PreviewStage spec={spec} playing={playing} loop={loop && !reducedMotion} revision={revision} />
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
        <span className="ml-auto font-mono text-2xs text-ink-faint">{describePreview(spec)}</span>
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

      {reducedMotion ? (
        <Tooltip content="来自系统 prefers-reduced-motion 或设置中的「减少动效」">
          <span tabIndex={0} className="w-fit text-2xs text-ink-faint underline-offset-2">
            减少动效已生效
          </span>
        </Tooltip>
      ) : null}
    </div>
  );
}
