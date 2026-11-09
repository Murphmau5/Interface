import { useCallback, useRef } from "react";

import type { MotionSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations } from "./usePreviewAnimations";

const ROWS = [0, 1, 2, 3];

export function MotionRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const motion = spec as MotionSpec;

  const build = useCallback(
    (root: HTMLElement) => {
      const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-row]"));
      return rows.map((row, index) => ({
        element: row,
        keyframes: [
          {
            opacity: motion.opacity,
            transform: `translate3d(0, ${motion.distance}px, 0) scale(${motion.scale})`,
            filter: `blur(${motion.blur}px)`,
          },
          {
            opacity: 1,
            transform: "translate3d(0, 0, 0) scale(1)",
            filter: "blur(0px)",
          },
        ],
        options: {
          duration: motion.durationMs,
          delay: motion.delayMs + index * motion.staggerMs,
          easing: motion.easing,
        },
      }));
    },
    [motion],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  return (
    <div ref={rootRef} className="pv-rows">
      {ROWS.map((index) => (
        <div key={index} data-pv-row className="pv-row">
          <span className="pv-row-dot" aria-hidden />
          <span className="pv-row-bar" data-width="long" aria-hidden />
          <span className="pv-row-bar" data-width="short" aria-hidden />
        </div>
      ))}
    </div>
  );
}
