import type { CSSProperties } from "react";

import type { PreviewSpec } from "@/lib/preview";
import { cn } from "@/lib/utils";

interface PreviewStageProps {
  spec: PreviewSpec;
  /** true = 播放；false = 静态首帧（海报态） */
  playing: boolean;
  /** 悬停微预览与右栏预览共用这一套播放参数，只是传参不同 */
  loop?: boolean;
  /** 递增即重新开始一次播放 */
  revision?: number;
  className?: string;
}

function stageVars(spec: PreviewSpec, playing: boolean, loop: boolean): CSSProperties {
  return {
    "--pv-duration": `${spec.durationMs}ms`,
    "--pv-easing": spec.easing,
    "--pv-iterations": playing && loop ? "infinite" : "1",
    "--pv-stagger": `${spec.staggerMs}ms`,
  } as CSSProperties;
}

function StaggerScene() {
  return (
    <div className="pv-rows">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          data-pv-anim
          className="pv-row"
          style={{ "--pv-index": index } as CSSProperties}
        >
          <span className="pv-row-dot" aria-hidden />
          <span className="pv-row-bar" data-width="long" aria-hidden />
          <span className="pv-row-bar" data-width="short" aria-hidden />
        </div>
      ))}
    </div>
  );
}

function PressScene() {
  return (
    <div className="pv-press-wrap">
      <div data-pv-anim className="pv-press">
        提交
      </div>
      <div className="pv-press-caption">PRESS / 640ms</div>
    </div>
  );
}

function CrossfadeScene() {
  return (
    <div className="pv-fade">
      <div data-pv-anim data-tone="dark" className="pv-fade-layer">
        <span className="pv-fade-bar" aria-hidden />
        <span className="pv-fade-card" aria-hidden />
        <span className="pv-fade-card" aria-hidden />
      </div>
      <div data-pv-anim data-tone="light" className="pv-fade-layer">
        <span className="pv-fade-bar" aria-hidden />
        <span className="pv-fade-card" aria-hidden />
        <span className="pv-fade-card" aria-hidden />
      </div>
    </div>
  );
}

export function PreviewStage({
  spec,
  playing,
  loop = false,
  revision = 0,
  className,
}: PreviewStageProps) {
  return (
    <div
      className={cn("preview-stage h-full w-full", className)}
      data-mode={playing ? "live" : "poster"}
      data-preview-type={spec.type}
      style={stageVars(spec, playing, loop)}
    >
      <div className="pv-grid" aria-hidden />
      <div key={revision} className="absolute inset-0">
        {spec.type === "motion.stagger" ? <StaggerScene /> : null}
        {spec.type === "motion.press" ? <PressScene /> : null}
        {spec.type === "theme.crossfade" ? <CrossfadeScene /> : null}
      </div>
    </div>
  );
}
