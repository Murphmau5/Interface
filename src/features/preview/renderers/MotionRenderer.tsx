import { useCallback, useRef } from "react";

import type { MotionSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations, type PreviewAnimationPlan } from "./usePreviewAnimations";

const ROWS = [0, 1, 2, 3];

function StaggerScene() {
  return (
    <div className="pv-rows">
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

function PagePushScene() {
  return (
    <div className="pv-push">
      <div className="pv-push-page" data-pv-push data-depth="2" aria-hidden>
        <span className="pv-push-bar" data-width="long" />
      </div>
      <div className="pv-push-page" data-pv-push data-depth="1" aria-hidden>
        <span className="pv-push-bar" data-width="long" />
        <span className="pv-push-bar" data-width="short" />
      </div>
      <div className="pv-push-page" data-pv-push data-depth="0">
        <span className="pv-push-bar" data-width="long" />
        <span className="pv-push-bar" data-width="short" />
        <span className="pv-push-block" aria-hidden />
      </div>
    </div>
  );
}

function SharedElementScene() {
  return (
    <div className="pv-share">
      <div className="pv-share-card" data-pv-share-source aria-hidden>
        <span className="pv-share-thumb" />
        <span className="pv-share-line" />
      </div>
      <div className="pv-share-panel">
        <span className="pv-share-hero" data-pv-hero aria-hidden />
        <span className="pv-share-body" data-pv-hero-body aria-hidden />
        <span className="pv-share-body" data-width="short" aria-hidden />
      </div>
    </div>
  );
}

function MicroScene() {
  return (
    <div className="pv-micro">
      <button type="button" tabIndex={-1} className="pv-micro-button" data-pv-press>
        提交
      </button>
      <span className="pv-micro-dot" data-pv-confirm aria-hidden />
    </div>
  );
}

function SpringScene() {
  return (
    <div className="pv-spring">
      <span className="pv-spring-lane" aria-hidden />
      <div className="pv-spring-card" data-pv-spring>
        <span className="pv-style-chip" aria-hidden />
        <span className="pv-style-line" data-width="long" aria-hidden />
        <span className="pv-style-line" data-width="short" aria-hidden />
      </div>
    </div>
  );
}

function ParallaxScene() {
  return (
    <div className="pv-parallax">
      <span className="pv-parallax-layer" data-pv-layer data-depth="0" aria-hidden />
      <span className="pv-parallax-layer" data-pv-layer data-depth="1" aria-hidden />
      <span className="pv-parallax-layer" data-pv-layer data-depth="2" aria-hidden />
    </div>
  );
}

function LoadingScene() {
  return (
    <div className="pv-loading">
      <div className="pv-loading-dots">
        {[0, 1, 2].map((index) => (
          <span key={index} className="pv-loading-dot" data-pv-dot aria-hidden />
        ))}
      </div>
      <div className="pv-loading-track" aria-hidden>
        <span className="pv-loading-sweep" data-pv-sweep />
      </div>
    </div>
  );
}

function EasingScene() {
  return (
    <div className="pv-easing">
      {["linear", "自定义贝塞尔"].map((label, index) => (
        <div key={label} className="pv-easing-track-wrap">
          <span className="pv-easing-label">{label}</span>
          <span className="pv-easing-track">
            <span
              className="pv-easing-knob"
              data-pv-curve={index === 0 ? "linear" : "bezier"}
              data-tone={index === 0 ? "muted" : "accent"}
              aria-hidden
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function ReducedScene() {
  return (
    <div className="pv-reduced">
      <span className="pv-reduced-label">常规</span>
      <div className="pv-rows">
        {ROWS.slice(0, 3).map((index) => (
          <div key={`motion-${index}`} data-pv-motion-row className="pv-row">
            <span className="pv-row-dot" aria-hidden />
            <span className="pv-row-bar" data-width="long" aria-hidden />
          </div>
        ))}
      </div>
      <span className="pv-reduced-label">减弱动效</span>
      <div className="pv-rows" data-reduced>
        {ROWS.slice(0, 3).map((index) => (
          <div key={`reduced-${index}`} data-pv-reduced-row className="pv-row">
            <span className="pv-row-dot" aria-hidden />
            <span className="pv-row-bar" data-width="long" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MotionRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const motion = spec as MotionSpec;

  const build = useCallback(
    (root: HTMLElement): PreviewAnimationPlan[] => {
      const base = {
        duration: motion.durationMs,
        easing: motion.easing,
      };

      switch (motion.scene) {
        case "stagger": {
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
            options: { ...base, delay: motion.delayMs + index * motion.staggerMs },
          }));
        }
        case "page-push": {
          const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-push]"));
          return pages.map((page, index) => ({
            element: page,
            keyframes: [
              {
                opacity: index === pages.length - 1 ? 0 : 0.35,
                transform: `translate3d(${motion.distance * 4 + index * 12}px, 0, 0) scale(${Math.max(
                  0.86,
                  motion.scale - index * 0.05,
                )})`,
              },
              { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
            ],
            options: { ...base, delay: motion.delayMs + index * motion.staggerMs },
          }));
        }
        case "shared-element": {
          const hero = root.querySelector<HTMLElement>("[data-pv-hero]");
          const source = root.querySelector<HTMLElement>("[data-pv-share-source]");
          const body = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-hero-body]"));
          const plans: PreviewAnimationPlan[] = [];
          if (source) {
            plans.push({
              element: source,
              keyframes: [
                { opacity: 1, offset: 0 },
                { opacity: 0, offset: 0.4 },
                { opacity: 0, offset: 1 },
              ],
              options: { ...base, duration: Math.max(200, Math.round(motion.durationMs * 0.4)) },
            });
          }
          if (hero) {
            plans.push({
              element: hero,
              keyframes: [
                {
                  transform: `translate3d(-46px, -38px, 0) scale(0.24)`,
                  opacity: motion.opacity,
                },
                { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
              ],
              options: base,
            });
          }
          body.forEach((line) => {
            plans.push({
              element: line,
              keyframes: [
                { opacity: motion.opacity, transform: `translate3d(0, ${motion.distance}px, 0)` },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
              ],
              options: {
                ...base,
                delay: motion.delayMs + Math.round(motion.durationMs * 0.45),
              },
            });
          });
          return plans;
        }
        case "micro": {
          const press = root.querySelector<HTMLElement>("[data-pv-press]");
          const confirm = root.querySelector<HTMLElement>("[data-pv-confirm]");
          const plans: PreviewAnimationPlan[] = [];
          if (press) {
            plans.push({
              element: press,
              keyframes: [
                { transform: "scale(1)", offset: 0 },
                { transform: "scale(0.96)", offset: 0.4 },
                { transform: "scale(1)", offset: 1 },
              ],
              options: { ...base, delay: motion.delayMs },
            });
          }
          if (confirm) {
            plans.push({
              element: confirm,
              keyframes: [
                { transform: "scale(0)", opacity: 0, offset: 0 },
                { transform: "scale(1.35)", opacity: 1, offset: 0.7 },
                { transform: "scale(1)", opacity: 1, offset: 1 },
              ],
              options: {
                ...base,
                delay: motion.delayMs + Math.round(motion.durationMs * 0.4),
              },
            });
          }
          return plans;
        }
        case "spring": {
          const card = root.querySelector<HTMLElement>("[data-pv-spring]");
          if (!card) return [];
          return [
            {
              element: card,
              keyframes: [
                { transform: `translate3d(0, ${motion.distance * 2}px, 0) scale(${motion.scale})`, opacity: motion.opacity, offset: 0 },
                { transform: `translate3d(0, -${Math.max(2, motion.distance * 0.25)}px, 0) scale(1)`, opacity: 1, offset: 0.72 },
                { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, offset: 1 },
              ],
              options: { ...base, delay: motion.delayMs },
            },
          ];
        }
        case "parallax": {
          const layers = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-layer]"));
          return layers.map((layer, index) => {
            const span = motion.distance * (index + 1);
            const shift = (index % 2 === 0 ? 1 : -1) * span;
            return {
              element: layer,
              keyframes: [
                { transform: `translate3d(${-shift}px, 0, 0)`, offset: 0 },
                { transform: `translate3d(${shift}px, 0, 0)`, offset: 0.5 },
                { transform: `translate3d(${-shift}px, 0, 0)`, offset: 1 },
              ],
              // 每层时长不同 → 速度差
              options: {
                ...base,
                delay: motion.delayMs,
                duration: motion.durationMs * (1 + index * 0.5),
              },
            };
          });
        }
        case "loading": {
          const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-dot]"));
          const sweep = root.querySelector<HTMLElement>("[data-pv-sweep]");
          const plans: PreviewAnimationPlan[] = dots.map((dot, index) => ({
            element: dot,
            keyframes: [
              { transform: "scale(0.7)", opacity: 0.4, offset: 0 },
              { transform: "scale(1)", opacity: 1, offset: 0.5 },
              { transform: "scale(0.7)", opacity: 0.4, offset: 1 },
            ],
            options: { ...base, delay: motion.delayMs + index * motion.staggerMs },
          }));
          if (sweep) {
            plans.push({
              element: sweep,
              keyframes: [
                { transform: "translate3d(-100%, 0, 0)", offset: 0 },
                { transform: "translate3d(100%, 0, 0)", offset: 1 },
              ],
              options: { ...base, delay: motion.delayMs, duration: motion.durationMs * 2 },
            });
          }
          return plans;
        }
        case "easing": {
          const knobs = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-curve]"));
          const travel = Math.max(120, motion.distance * 10);
          return knobs.map((knob, index) => ({
            element: knob,
            keyframes: [
              { transform: "translate3d(0, 0, 0)", offset: 0 },
              { transform: `translate3d(${travel}px, 0, 0)`, offset: 1 },
            ],
            options: {
              duration: motion.durationMs,
              easing: index === 0 ? "linear" : motion.easing,
              delay: motion.delayMs,
            },
          }));
        }
        case "reduced": {
          const motionRows = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-motion-row]"));
          const reducedRows = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-reduced-row]"));
          return [
            ...motionRows.map((row, index) => ({
              element: row,
              keyframes: [
                {
                  opacity: motion.opacity,
                  transform: `translate3d(0, ${motion.distance}px, 0) scale(${motion.scale})`,
                },
                { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
              ],
              options: { ...base, delay: motion.delayMs + index * motion.staggerMs },
            })),
            ...reducedRows.map((row, index) => ({
              element: row,
              keyframes: [{ opacity: motion.opacity }, { opacity: 1 }],
              options: { duration: 120, easing: "linear", delay: motion.delayMs + index * 20 },
            })),
          ];
        }
      }
    },
    [motion],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  return (
    <div ref={rootRef} className="pv-motion" data-scene={motion.scene}>
      {motion.scene === "stagger" ? <StaggerScene /> : null}
      {motion.scene === "page-push" ? <PagePushScene /> : null}
      {motion.scene === "shared-element" ? <SharedElementScene /> : null}
      {motion.scene === "micro" ? <MicroScene /> : null}
      {motion.scene === "spring" ? <SpringScene /> : null}
      {motion.scene === "parallax" ? <ParallaxScene /> : null}
      {motion.scene === "loading" ? <LoadingScene /> : null}
      {motion.scene === "easing" ? <EasingScene /> : null}
      {motion.scene === "reduced" ? <ReducedScene /> : null}
    </div>
  );
}
