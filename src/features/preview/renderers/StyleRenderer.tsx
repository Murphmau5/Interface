import { useCallback, useRef, type CSSProperties } from "react";

import { STYLE_TREATMENT_LABELS, type StyleSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations, type PreviewAnimationPlan } from "./usePreviewAnimations";

function panelShadow(spec: StyleSpec): string {
  if (spec.treatment !== "neumorphic") return "none";
  const depth = spec.depth;
  const inner = Math.round(depth * 0.8);
  return [
    `inset 0 ${inner}px ${depth * 2}px rgba(0, 0, 0, ${(0.28 + depth / 60).toFixed(3)})`,
    `inset 0 -1px 0 rgba(255, 255, 255, 0.05)`,
  ].join(", ");
}

function SimplePanel({
  treatment,
  style,
}: {
  treatment: StyleSpec["treatment"];
  style: CSSProperties;
}) {
  return (
    <div className="pv-style-panel" data-pv-panel data-treatment={treatment} style={style}>
      <span className="pv-style-chip" aria-hidden />
      <span className="pv-style-line" data-width="long" aria-hidden />
      <span className="pv-style-line" data-width="short" aria-hidden />
      <div className="pv-style-fill" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function BrutalPanel({
  variant,
  style,
}: {
  variant: "brutalism" | "neobrutalism";
  style: CSSProperties;
}) {
  return (
    <div className="pv-style-panel" data-pv-panel data-treatment={variant} style={style}>
      <span className="pv-brutal-head" aria-hidden>
        RAW
      </span>
      <span className="pv-style-line" data-width="long" aria-hidden />
      <span className="pv-style-line" data-width="short" aria-hidden />
      <span className="pv-brutal-block" data-pv-accent-block aria-hidden />
      <div className="pv-style-fill" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function EditorialScene() {
  return (
    <div className="pv-editorial">
      <span className="pv-editorial-headline" data-pv-headline>
        秩序的边界
      </span>
      <div className="pv-editorial-columns" data-pv-columns>
        <span className="pv-editorial-text" aria-hidden />
        <span className="pv-editorial-text" aria-hidden />
        <span className="pv-editorial-text" data-width="short" aria-hidden />
      </div>
      <span className="pv-editorial-quote" aria-hidden>
        “界面是被阅读的结构。”
      </span>
    </div>
  );
}

function BentoScene() {
  return (
    <div className="pv-bento">
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="pv-bento-cell" data-pv-bento-cell data-cell={index} aria-hidden>
          <span className="pv-bento-line" />
        </span>
      ))}
    </div>
  );
}

function CardScene() {
  return (
    <div className="pv-cards">
      {[0, 1, 2].map((index) => (
        <span key={index} className="pv-card-item" data-pv-card aria-hidden>
          <span className="pv-card-chip" />
          <span className="pv-card-line" data-width="long" />
          <span className="pv-card-line" data-width="short" />
        </span>
      ))}
    </div>
  );
}

export function StyleRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const style = spec as StyleSpec;

  const build = useCallback(
    (root: HTMLElement): PreviewAnimationPlan[] => {
      const base = { duration: style.durationMs, easing: style.easing };

      switch (style.treatment) {
        case "flat":
        case "neumorphic":
        case "glass":
        case "clay": {
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
                options: base,
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
                options: base,
              },
            ];
          }

          if (style.treatment === "clay") {
            return [
              {
                element: panel,
                keyframes: [
                  { opacity: 0.4, transform: "translate3d(0, 6px, 0) scale(0.98)" },
                  { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
                ],
                options: base,
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
              options: base,
            },
          ];
        }
        case "brutalism": {
          const panel = root.querySelector<HTMLElement>("[data-pv-panel]");
          if (!panel) return [];
          return [
            {
              element: panel,
              keyframes: [
                { transform: `translate3d(-${style.depth}px, -${style.depth}px, 0)` },
                { transform: "translate3d(0, 0, 0)" },
              ],
              options: base,
            },
          ];
        }
        case "neobrutalism": {
          const panel = root.querySelector<HTMLElement>("[data-pv-panel]");
          const block = root.querySelector<HTMLElement>("[data-pv-accent-block]");
          const plans: PreviewAnimationPlan[] = [];
          if (panel) {
            plans.push({
              element: panel,
              keyframes: [
                { transform: "translate3d(-4px, -4px, 0)" },
                { transform: "translate3d(0, 0, 0)" },
              ],
              options: base,
            });
          }
          if (block) {
            plans.push({
              element: block,
              keyframes: [
                { transform: "scale(0)", opacity: 0 },
                { transform: "scale(1)", opacity: 1 },
              ],
              options: base,
            });
          }
          return plans;
        }
        case "editorial": {
          const headline = root.querySelector<HTMLElement>("[data-pv-headline]");
          const columns = root.querySelector<HTMLElement>("[data-pv-columns]");
          const plans: PreviewAnimationPlan[] = [];
          if (headline) {
            plans.push({
              element: headline,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, 10px, 0)" },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
              ],
              options: base,
            });
          }
          if (columns) {
            plans.push({
              element: columns,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, 6px, 0)" },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
              ],
              options: { ...base, delay: Math.round(style.durationMs * 0.4) },
            });
          }
          return plans;
        }
        case "bento": {
          const cells = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-bento-cell]"));
          return cells.map((cell, index) => ({
            element: cell,
            keyframes: [
              { opacity: 0, transform: "translate3d(0, 8px, 0) scale(0.94)" },
              { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
            ],
            options: { ...base, delay: index * Math.max(50, Math.round(style.durationMs / 4)) },
          }));
        }
        case "card": {
          const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-card]"));
          return cards.map((card, index) => ({
            element: card,
            keyframes: [
              { opacity: 0, transform: "translate3d(0, 10px, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            options: { ...base, delay: index * Math.max(50, Math.round(style.durationMs / 3)) },
          }));
        }
      }
    },
    [style],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  // 粗野 / 新粗野强制直角；黏土用更胖的圆角
  const radius =
    style.treatment === "brutalism"
      ? 0
      : style.treatment === "clay"
        ? Math.max(18, style.radiusPx)
        : style.radiusPx;
  const panelStyle: CSSProperties = {
    borderRadius: `${radius}px`,
    // 仅新拟态用 WAAPI 过渡阴影；其它质感把阴影留给 CSS（clay / 粗野的硬阴影不能被子内联覆盖）
    boxShadow: style.treatment === "neumorphic" ? panelShadow(style) : undefined,
  };

  const simple =
    style.treatment === "flat" ||
    style.treatment === "neumorphic" ||
    style.treatment === "glass" ||
    style.treatment === "clay";
  const brutal = style.treatment === "brutalism" || style.treatment === "neobrutalism";

  return (
    <div ref={rootRef} className="pv-style" data-treatment={style.treatment}>
      {simple ? <SimplePanel treatment={style.treatment} style={panelStyle} /> : null}
      {brutal ? (
        <BrutalPanel
          variant={style.treatment === "brutalism" ? "brutalism" : "neobrutalism"}
          style={panelStyle}
        />
      ) : null}
      {style.treatment === "editorial" ? <EditorialScene /> : null}
      {style.treatment === "bento" ? <BentoScene /> : null}
      {style.treatment === "card" ? <CardScene /> : null}
      <div className="pv-style-caption">
        {STYLE_TREATMENT_LABELS[style.treatment]} · R{style.radiusPx} · D{style.depth}
      </div>
    </div>
  );
}
