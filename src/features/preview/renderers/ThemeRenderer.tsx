import { useCallback, useRef, type CSSProperties } from "react";

import { THEME_SCENE_LABELS, type ThemeSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations, type PreviewAnimationPlan } from "./usePreviewAnimations";

function board() {
  return (
    <>
      <span className="pv-theme-bar" aria-hidden />
      <span className="pv-theme-card" aria-hidden />
      <span className="pv-theme-card" data-short aria-hidden />
    </>
  );
}

function CrossfadeScene() {
  return (
    <>
      <div className="pv-theme-layer" data-pv-theme="light" data-tone="light">
        {board()}
      </div>
      <div className="pv-theme-layer" data-pv-theme="dark" data-tone="dark">
        {board()}
      </div>
    </>
  );
}

function SingleThemeScene({ tone }: { tone: "light" | "dark" }) {
  return (
    <div className="pv-theme-single" data-tone={tone}>
      <span className="pv-theme-bar" data-pv-tier aria-hidden />
      <span className="pv-theme-tier" data-pv-tier data-tier="1" aria-hidden />
      <span className="pv-theme-tier" data-pv-tier data-tier="2" aria-hidden />
      <span className="pv-theme-tier" data-pv-tier data-tier="3" aria-hidden />
      <span className="pv-theme-tier-caption" aria-hidden>
        surface 1 / 2 / 3
      </span>
    </div>
  );
}

function SystemScene() {
  return (
    <div className="pv-theme-system">
      <div className="pv-system-window" data-pv-sys-window data-tone="light">
        <span className="pv-system-bar" aria-hidden />
        <span className="pv-system-card" aria-hidden />
      </div>
      <div className="pv-system-window" data-pv-sys-window data-tone="dark">
        <span className="pv-system-bar" aria-hidden />
        <span className="pv-system-card" aria-hidden />
      </div>
      <span className="pv-system-indicator" aria-hidden>
        <span className="pv-system-sun" />
        <span className="pv-system-moon" />
      </span>
    </div>
  );
}

function BrandScene() {
  return (
    <div className="pv-theme-brand">
      <div className="pv-brand-swatches">
        <span className="pv-brand-swatch" data-pv-swatch data-role="primary" aria-hidden />
        <span className="pv-brand-swatch" data-pv-swatch data-role="secondary" aria-hidden />
        <span className="pv-brand-swatch" data-pv-swatch data-role="accent" aria-hidden />
      </div>
      <span className="pv-brand-button" data-pv-brand-button>
        品牌按钮
      </span>
    </div>
  );
}

const ACCENT_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function AccentScene() {
  return (
    <div className="pv-theme-accent">
      <div className="pv-accent-scale">
        {ACCENT_STEPS.map((step) => (
          <span
            key={step}
            className="pv-accent-step"
            data-pv-step
            style={{ "--pv-step": step } as CSSProperties}
            aria-hidden
          />
        ))}
      </div>
      <span className="pv-accent-on" data-pv-on>
        on-accent
      </span>
    </div>
  );
}

function OverrideScene() {
  return (
    <div className="pv-theme-override" data-pv-override>
      <div className="pv-override-outer">
        <span className="pv-override-label">外层主题</span>
        <div className="pv-override-scope" data-pv-override-scope>
          <span className="pv-override-label" data-scope>
            局部覆盖
          </span>
          <span className="pv-override-line" aria-hidden />
        </div>
      </div>
      <span className="pv-override-arrow" data-pv-override-arrow aria-hidden />
    </div>
  );
}

export function ThemeRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const theme = spec as ThemeSpec;
  const total = theme.durationMs * 2 + theme.holdMs * 2;

  const build = useCallback(
    (root: HTMLElement): PreviewAnimationPlan[] => {
      switch (theme.scene) {
        case "crossfade": {
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
        }
        case "light":
        case "dark": {
          const tiers = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-tier]"));
          return tiers.map((tier, index) => ({
            element: tier,
            keyframes: [
              { opacity: 0, transform: "translate3d(0, 8px, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            options: {
              duration: theme.durationMs,
              delay: index * Math.max(60, Math.round(theme.holdMs / 4)),
              easing: theme.easing,
            },
          }));
        }
        case "system": {
          const windows = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-sys-window]"));
          const indicator = root.querySelector<HTMLElement>(".pv-system-indicator");
          const plans: PreviewAnimationPlan[] = windows.map((window, index) => ({
            element: window,
            keyframes: [
              { opacity: 0, transform: "translate3d(0, 8px, 0) scale(0.96)" },
              { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
            ],
            options: {
              duration: theme.durationMs,
              delay: index * Math.max(60, Math.round(theme.holdMs / 5)),
              easing: theme.easing,
            },
          }));
          if (indicator) {
            plans.push({
              element: indicator,
              keyframes: [{ opacity: 0 }, { opacity: 1 }],
              options: { duration: theme.durationMs, delay: theme.holdMs, easing: theme.easing },
            });
          }
          return plans;
        }
        case "brand": {
          const swatches = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-swatch]"));
          const button = root.querySelector<HTMLElement>("[data-pv-brand-button]");
          const plans: PreviewAnimationPlan[] = swatches.map((swatch, index) => ({
            element: swatch,
            keyframes: [
              { opacity: 0, transform: "translate3d(0, 10px, 0) scale(0.9)" },
              { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
            ],
            options: {
              duration: theme.durationMs,
              delay: index * Math.max(60, Math.round(theme.holdMs / 4)),
              easing: theme.easing,
            },
          }));
          if (button) {
            plans.push({
              element: button,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, 6px, 0)" },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
              ],
              options: {
                duration: theme.durationMs,
                delay: Math.round(theme.holdMs / 2),
                easing: theme.easing,
              },
            });
          }
          return plans;
        }
        case "accent": {
          const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-step]"));
          const on = root.querySelector<HTMLElement>("[data-pv-on]");
          const plans: PreviewAnimationPlan[] = steps.map((step, index) => ({
            element: step,
            keyframes: [
              { opacity: 0, transform: "translate3d(0, 12px, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            options: {
              duration: theme.durationMs,
              delay: index * Math.max(40, Math.round(theme.holdMs / 12)),
              easing: theme.easing,
            },
          }));
          if (on) {
            plans.push({
              element: on,
              keyframes: [
                { opacity: 0, transform: "scale(0.9)" },
                { opacity: 1, transform: "scale(1)" },
              ],
              options: { duration: theme.durationMs, delay: theme.holdMs, easing: theme.easing },
            });
          }
          return plans;
        }
        case "override": {
          const outer = root.querySelector<HTMLElement>("[data-pv-override]");
          const scope = root.querySelector<HTMLElement>("[data-pv-override-scope]");
          const arrow = root.querySelector<HTMLElement>("[data-pv-override-arrow]");
          const plans: PreviewAnimationPlan[] = [];
          if (outer) {
            plans.push({
              element: outer,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, 6px, 0)" },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
              ],
              options: { duration: theme.durationMs, easing: theme.easing },
            });
          }
          if (scope) {
            plans.push({
              element: scope,
              keyframes: [
                { opacity: 0, transform: "scale(0.94)" },
                { opacity: 1, transform: "scale(1)" },
              ],
              options: { duration: theme.durationMs, delay: theme.holdMs, easing: theme.easing },
            });
          }
          if (arrow) {
            plans.push({
              element: arrow,
              keyframes: [
                { opacity: 0, transform: "translate3d(6px, 0, 0)" },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
              ],
              options: {
                duration: theme.durationMs,
                delay: Math.round(theme.holdMs * 1.5),
                easing: theme.easing,
              },
            });
          }
          return plans;
        }
      }
    },
    [theme, total],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  return (
    <div ref={rootRef} className="pv-theme" data-scene={theme.scene}>
      {theme.scene === "crossfade" ? <CrossfadeScene /> : null}
      {theme.scene === "light" ? <SingleThemeScene tone="light" /> : null}
      {theme.scene === "dark" ? <SingleThemeScene tone="dark" /> : null}
      {theme.scene === "system" ? <SystemScene /> : null}
      {theme.scene === "brand" ? <BrandScene /> : null}
      {theme.scene === "accent" ? <AccentScene /> : null}
      {theme.scene === "override" ? <OverrideScene /> : null}
      <div className="pv-theme-caption">
        {THEME_SCENE_LABELS[theme.scene]} · {theme.durationMs}ms · 停留 {theme.holdMs}ms
      </div>
    </div>
  );
}
