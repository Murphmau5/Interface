import { memo } from "react";

import { PreviewRenderer } from "@/features/preview/renderers";
import {
  PREVIEW_KIND_LABELS,
  previewTitle,
  type PreviewSpec,
} from "@/lib/preview";
import { cn } from "@/lib/utils";

interface PreviewStageProps {
  spec: PreviewSpec;
  /** true = 播放；false = 静态海报 */
  playing: boolean;
  /** 悬停微预览与右栏预览共用同一套播放参数，只是传参不同 */
  loop?: boolean;
  /** 递增即重新开始一次播放 */
  revision?: number;
  /** 右栏为 true；缩略图与悬停层为 false */
  interactive?: boolean;
  className?: string;
}

function PreviewStageBase({
  spec,
  playing,
  loop = false,
  revision = 0,
  interactive = false,
  className,
}: PreviewStageProps) {
  return (
    <div
      className={cn("preview-stage h-full w-full", className)}
      data-mode={playing ? "live" : "poster"}
      data-kind={spec.kind}
    >
      <div className="pv-grid" aria-hidden />
      <div key={revision} className="absolute inset-0">
        <div className="pv-scene" data-bench={interactive ? "true" : "false"}>
          {interactive ? (
            <div className="pv-scene-bar" aria-hidden>
              <span className="pv-scene-title">{previewTitle(spec)}</span>
              <span className="pv-scene-readout">{PREVIEW_KIND_LABELS[spec.kind]}</span>
            </div>
          ) : null}
          <div className="pv-scene-body">
            <PreviewRenderer
              spec={spec}
              playing={playing}
              loop={loop}
              revision={revision}
              interactive={interactive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const PreviewStage = memo(PreviewStageBase);
