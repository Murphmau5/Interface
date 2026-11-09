import { useCallback, useRef, type CSSProperties } from "react";

import { STYLE_TREATMENT_LABELS, type StyleSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations } from "./usePreviewAnimations";

function panelShadow(spec: StyleSpec): string {
  if (spec.treatment !== "neumorphic") return "none";
  const depth = spec.depth;
  const inner = Math.round(depth * 0.8);
  return [
    `inset 0 ${inner}px ${depth * 2}px rgba(0, 0, 0, ${(0.28 + depth / 60).toFixed(3)})`,
    `inset 0 -1px 0 rgba(255, 255, 255, 0.05)`,
  ].join(", ");
}

export function StyleRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const style = spec as StyleSpec;

  const build = useCallback(
    (root: HTMLElement) => {
      const panel = root.querySelector<HTMLElement>("[data-pv-panel]");
      if (!panel) return [];

      if (style.treatment === "neumorphic") {
        return [
          {
            element: panel,
            keyframes: [
              { boxShadow: "inset 0 0 0 rgba(0, 0, 0, 0), inset 0 -1px 0 rgba(255, 255, 255, 0.05)" },
              { boxShadow: panelShadow(style) },
            ],
            options: { duration: style.durationMs, easing: style.easing },
          },
        ];
      }

      if (style.treatment === "glass") {
        return [
          {
            element: panel,
            keyframes: [
              { opacity: 0.55, transform: "translate3d(0, 4px, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            options: { duration: style.durationMs, easing: style.easing },
          },
        ];
      }

      return [
        {
          element: panel,
          keyframes: [
            { borderRadius: "0px" },
            { borderRadius: `${style.radiusPx}px` },
          ],
          options: { duration: style.durationMs, easing: style.easing },
        },
      ];
    },
    [style],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  const panelStyle: CSSProperties = {
    borderRadius: `${style.radiusPx}px`,
    boxShadow: panelShadow(style),
  };

  return (
    <div ref={rootRef} className="pv-style" data-treatment={style.treatment}>
      <div className="pv-style-panel" data-pv-panel style={panelStyle}>
        <span className="pv-style-chip" aria-hidden />
        <span className="pv-style-line" data-width="long" aria-hidden />
        <span className="pv-style-line" data-width="short" aria-hidden />
      </div>
      <div className="pv-style-caption">
        {STYLE_TREATMENT_LABELS[style.treatment]} · R{style.radiusPx} · D{style.depth}
      </div>
    </div>
  );
}
