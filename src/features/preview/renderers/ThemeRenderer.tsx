import { useCallback, useRef } from "react";

import type { ThemeSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations } from "./usePreviewAnimations";

export function ThemeRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const theme = spec as ThemeSpec;
  const total = theme.durationMs * 2 + theme.holdMs * 2;

  const build = useCallback(
    (root: HTMLElement) => {
      const dark = root.querySelector<HTMLElement>("[data-pv-theme='dark']");
      const light = root.querySelector<HTMLElement>("[data-pv-theme='light']");
      if (!dark || !light) return [];

      const fade = theme.durationMs / total;
      const hold = (theme.durationMs + theme.holdMs) / total;
      const back = (theme.durationMs * 2 + theme.holdMs) / total;

      return [
        {
          element: dark,
          keyframes: [
            { opacity: 1, offset: 0 },
            { opacity: 0, offset: fade },
            { opacity: 0, offset: hold },
            { opacity: 1, offset: back },
            { opacity: 1, offset: 1 },
          ],
          options: { duration: total, easing: theme.easing },
        },
        {
          element: light,
          keyframes: [
            { opacity: 0, offset: 0 },
            { opacity: 1, offset: fade },
            { opacity: 1, offset: hold },
            { opacity: 0, offset: back },
            { opacity: 0, offset: 1 },
          ],
          options: { duration: total, easing: theme.easing },
        },
      ];
    },
    [theme, total],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  const board = (
    <>
      <span className="pv-theme-bar" aria-hidden />
      <span className="pv-theme-card" aria-hidden />
      <span className="pv-theme-card" data-short aria-hidden />
    </>
  );

  return (
    <div ref={rootRef} className="pv-theme">
      <div className="pv-theme-layer" data-pv-theme="light" data-tone="light">
        {board}
      </div>
      <div className="pv-theme-layer" data-pv-theme="dark" data-tone="dark">
        {board}
      </div>
      <div className="pv-theme-caption">
        {theme.durationMs}ms ×2 · 停留 {theme.holdMs}ms
      </div>
    </div>
  );
}
