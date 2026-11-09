import { useCallback, useRef } from "react";

import { FEEDBACK_TONE_LABELS, type FeedbackSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations, type PreviewAnimationPlan } from "./usePreviewAnimations";

const TONE_CLASS: Record<FeedbackSpec["tone"], string> = {
  success: "pv-tone-success",
  error: "pv-tone-error",
  warning: "pv-tone-warning",
  info: "pv-tone-info",
};

function ToastScene() {
  return (
    <>
      <div className="pv-feedback-badge" data-pv-toast>
        <span className="pv-feedback-dot" data-pv-dot aria-hidden />
        <span className="pv-feedback-text">反馈提示</span>
      </div>
      <div className="pv-feedback-axis" data-pv-axis aria-hidden>
        <span data-phase="trigger" />
        <span data-phase="hold" />
        <span data-phase="decay" />
      </div>
    </>
  );
}

function ValidationScene() {
  return (
    <div className="pv-validation">
      <div className="pv-validation-field" data-pv-shake>
        <span className="pv-validation-label">邮箱</span>
        <span className="pv-validation-input">
          <span className="pv-validation-value">name@</span>
          <span className="pv-validation-caret" aria-hidden />
        </span>
      </div>
      <div className="pv-validation-error" data-pv-errorline>
        <span className="pv-validation-dot" aria-hidden />
        <span>请输入完整的邮箱地址</span>
      </div>
    </div>
  );
}

function SubmitScene() {
  return (
    <div className="pv-submit">
      <div className="pv-submit-button">
        <span className="pv-submit-label" data-pv-submit-label>
          提交
        </span>
        <span className="pv-submit-dots" data-pv-submit-loading aria-hidden>
          {[0, 1, 2].map((index) => (
            <span key={index} className="pv-submit-dot" />
          ))}
        </span>
        <span className="pv-submit-check" data-pv-submit-check aria-hidden>
          <span className="pv-submit-check-mark" />
        </span>
      </div>
      <span className="pv-feedback-caption">提交 → 加载 → 完成</span>
    </div>
  );
}

function ConfirmScene() {
  return (
    <div className="pv-confirm">
      <div className="pv-confirm-scrim" data-pv-confirm-scrim aria-hidden />
      <div className="pv-confirm-dialog" data-pv-confirm-dialog>
        <span className="pv-confirm-title">删除这条案例？</span>
        <span className="pv-confirm-desc">删除后无法恢复，请确认。</span>
        <div className="pv-confirm-actions" aria-hidden>
          <span className="pv-confirm-cancel">取消</span>
          <span className="pv-confirm-delete">删除</span>
        </div>
        <span className="pv-confirm-countdown" data-pv-countdown aria-hidden />
      </div>
    </div>
  );
}

function LoadingScene() {
  return (
    <div className="pv-feedback-loading">
      <span className="pv-feedback-ring" data-pv-ring aria-hidden />
      <div className="pv-feedback-skeleton">
        <span className="pv-skeleton-line" data-pv-skeleton data-width="long" aria-hidden />
        <span className="pv-skeleton-line" data-pv-skeleton data-width="short" aria-hidden />
      </div>
    </div>
  );
}

function EmptyScene() {
  return (
    <div className="pv-empty">
      <span className="pv-empty-figure" data-pv-empty-figure aria-hidden>
        <span className="pv-empty-lid" />
      </span>
      <span className="pv-empty-title" data-pv-empty-text>
        还没有内容
      </span>
      <span className="pv-empty-cta" data-pv-empty-cta>
        新建一条
      </span>
    </div>
  );
}

function ErrorScene() {
  return (
    <div className="pv-error">
      <div className="pv-error-bar" data-pv-error-bar>
        <span className="pv-error-dot" aria-hidden />
        <span className="pv-error-text">同步失败，请检查网络</span>
      </div>
      <span className="pv-error-retry" data-pv-retry>
        重试
      </span>
    </div>
  );
}

export function FeedbackRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const feedback = spec as FeedbackSpec;
  const total = feedback.triggerMs + feedback.holdMs + feedback.decayMs;

  const build = useCallback(
    (root: HTMLElement): PreviewAnimationPlan[] => {
      const trigger = feedback.triggerMs / total;
      const hold = (feedback.triggerMs + feedback.holdMs) / total;
      const base = { duration: total, easing: feedback.easing };

      switch (feedback.scene) {
        case "toast": {
          const toast = root.querySelector<HTMLElement>("[data-pv-toast]");
          const dot = root.querySelector<HTMLElement>("[data-pv-dot]");
          if (!toast) return [];
          const plans: PreviewAnimationPlan[] = [
            {
              element: toast,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, 6px, 0)", offset: 0 },
                { opacity: 1, transform: "translate3d(0, 0, 0)", offset: trigger },
                { opacity: 1, transform: "translate3d(0, 0, 0)", offset: hold },
                { opacity: 0, transform: "translate3d(0, -4px, 0)", offset: 1 },
              ],
              options: base,
            },
          ];
          if (dot) {
            plans.push({
              element: dot,
              keyframes: [
                { transform: "scale(1)", offset: 0 },
                { transform: "scale(1.5)", offset: trigger },
                { transform: "scale(1)", offset: hold },
                { transform: "scale(1)", offset: 1 },
              ],
              options: base,
            });
          }
          return plans;
        }
        case "validation": {
          const field = root.querySelector<HTMLElement>("[data-pv-shake]");
          const errorLine = root.querySelector<HTMLElement>("[data-pv-errorline]");
          const plans: PreviewAnimationPlan[] = [];
          if (field) {
            plans.push({
              element: field,
              keyframes: [
                { transform: "translate3d(0, 0, 0)", offset: 0 },
                { transform: "translate3d(-3px, 0, 0)", offset: 0.12 },
                { transform: "translate3d(3px, 0, 0)", offset: 0.24 },
                { transform: "translate3d(-2px, 0, 0)", offset: 0.36 },
                { transform: "translate3d(2px, 0, 0)", offset: 0.48 },
                { transform: "translate3d(0, 0, 0)", offset: 0.6 },
                { transform: "translate3d(0, 0, 0)", offset: 1 },
              ],
              options: { ...base, duration: Math.max(240, feedback.decayMs) },
            });
          }
          if (errorLine) {
            plans.push({
              element: errorLine,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, -3px, 0)", offset: 0 },
                { opacity: 1, transform: "translate3d(0, 0, 0)", offset: Math.max(trigger, 0.2) },
                { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 1 },
              ],
              options: base,
            });
          }
          return plans;
        }
        case "submit": {
          const label = root.querySelector<HTMLElement>("[data-pv-submit-label]");
          const loading = root.querySelector<HTMLElement>("[data-pv-submit-loading]");
          const check = root.querySelector<HTMLElement>("[data-pv-submit-check]");
          const plans: PreviewAnimationPlan[] = [];
          if (label) {
            plans.push({
              element: label,
              keyframes: [
                { opacity: 1, offset: 0 },
                { opacity: 0, offset: Math.max(trigger, 0.15) },
                { opacity: 0, offset: 1 },
              ],
              options: base,
            });
          }
          if (loading) {
            plans.push({
              element: loading,
              keyframes: [
                { opacity: 0, transform: "scale(0.8)", offset: 0 },
                { opacity: 1, transform: "scale(1)", offset: Math.max(trigger, 0.15) },
                { opacity: 1, transform: "scale(1)", offset: hold },
                { opacity: 0, transform: "scale(0.8)", offset: Math.min(hold + 0.08, 1) },
                { opacity: 0, transform: "scale(0.8)", offset: 1 },
              ],
              options: base,
            });
          }
          if (check) {
            plans.push({
              element: check,
              keyframes: [
                { opacity: 0, transform: "scale(0.4)", offset: 0 },
                { opacity: 0, transform: "scale(0.4)", offset: hold },
                { opacity: 1, transform: "scale(1.12)", offset: Math.min(hold + 0.12, 1) },
                { opacity: 1, transform: "scale(1)", offset: 1 },
              ],
              options: base,
            });
          }
          return plans;
        }
        case "confirm": {
          const scrim = root.querySelector<HTMLElement>("[data-pv-confirm-scrim]");
          const dialog = root.querySelector<HTMLElement>("[data-pv-confirm-dialog]");
          const countdown = root.querySelector<HTMLElement>("[data-pv-countdown]");
          const plans: PreviewAnimationPlan[] = [];
          if (scrim) {
            plans.push({
              element: scrim,
              keyframes: [{ opacity: 0 }, { opacity: 1 }],
              options: { ...base, duration: Math.max(160, feedback.triggerMs + feedback.holdMs) },
            });
          }
          if (dialog) {
            plans.push({
              element: dialog,
              keyframes: [
                { opacity: 0, transform: "scale(0.92)", offset: 0 },
                { opacity: 1, transform: "scale(1)", offset: Math.max(trigger, 0.18) },
                { opacity: 1, transform: "scale(1)", offset: 1 },
              ],
              options: { ...base, duration: Math.max(240, feedback.triggerMs + feedback.holdMs) },
            });
          }
          if (countdown) {
            plans.push({
              element: countdown,
              keyframes: [
                { transform: "scaleX(1)", offset: 0 },
                { transform: "scaleX(0)", offset: 1 },
              ],
              options: { duration: Math.max(300, feedback.holdMs), easing: "linear" },
            });
          }
          return plans;
        }
        case "loading": {
          const ring = root.querySelector<HTMLElement>("[data-pv-ring]");
          const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-pv-skeleton]"));
          const plans: PreviewAnimationPlan[] = [];
          if (ring) {
            plans.push({
              element: ring,
              keyframes: [
                { transform: "rotate(0deg)", offset: 0 },
                { transform: "rotate(360deg)", offset: 1 },
              ],
              options: { duration: Math.max(600, total), easing: "linear" },
            });
          }
          lines.forEach((line, index) => {
            plans.push({
              element: line,
              keyframes: [
                { opacity: 0.4, offset: 0 },
                { opacity: 1, offset: 0.5 },
                { opacity: 0.4, offset: 1 },
              ],
              options: {
                duration: Math.max(800, total),
                easing: feedback.easing,
                delay: index * feedback.holdMs * 0.2,
              },
            });
          });
          return plans;
        }
        case "empty": {
          const figure = root.querySelector<HTMLElement>("[data-pv-empty-figure]");
          const text = root.querySelector<HTMLElement>("[data-pv-empty-text]");
          const cta = root.querySelector<HTMLElement>("[data-pv-empty-cta]");
          const plans: PreviewAnimationPlan[] = [];
          if (figure) {
            plans.push({
              element: figure,
              keyframes: [
                { transform: "translate3d(0, 6px, 0)", offset: 0 },
                { transform: "translate3d(0, 0, 0)", offset: Math.max(trigger, 0.25) },
                { transform: "translate3d(0, 0, 0)", offset: 1 },
              ],
              options: base,
            });
          }
          if (text) {
            plans.push({
              element: text,
              keyframes: [
                { opacity: 0, offset: 0 },
                { opacity: 1, offset: Math.max(trigger, 0.3) },
                { opacity: 1, offset: 1 },
              ],
              options: base,
            });
          }
          if (cta) {
            plans.push({
              element: cta,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, 4px, 0)", offset: 0 },
                { opacity: 0, transform: "translate3d(0, 4px, 0)", offset: Math.max(hold, 0.55) },
                { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 1 },
              ],
              options: base,
            });
          }
          return plans;
        }
        case "error": {
          const bar = root.querySelector<HTMLElement>("[data-pv-error-bar]");
          const retry = root.querySelector<HTMLElement>("[data-pv-retry]");
          const plans: PreviewAnimationPlan[] = [];
          if (bar) {
            plans.push({
              element: bar,
              keyframes: [
                { opacity: 0, transform: "translate3d(0, -8px, 0)", offset: 0 },
                { opacity: 1, transform: "translate3d(0, 0, 0)", offset: Math.max(trigger, 0.25) },
                { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 1 },
              ],
              options: base,
            });
          }
          if (retry) {
            plans.push({
              element: retry,
              keyframes: [
                { transform: "scale(1)", offset: 0 },
                { transform: "scale(1.06)", offset: Math.max(hold, 0.6) },
                { transform: "scale(1)", offset: 1 },
              ],
              options: base,
            });
          }
          return plans;
        }
      }
    },
    [feedback, total],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  return (
    <div ref={rootRef} className={`pv-feedback ${TONE_CLASS[feedback.tone]}`} data-scene={feedback.scene}>
      {feedback.scene === "toast" ? <ToastScene /> : null}
      {feedback.scene === "validation" ? <ValidationScene /> : null}
      {feedback.scene === "submit" ? <SubmitScene /> : null}
      {feedback.scene === "confirm" ? <ConfirmScene /> : null}
      {feedback.scene === "loading" ? <LoadingScene /> : null}
      {feedback.scene === "empty" ? <EmptyScene /> : null}
      {feedback.scene === "error" ? <ErrorScene /> : null}
      {feedback.scene === "toast" ? (
        <div className="pv-feedback-caption">
          {feedback.triggerMs} / {feedback.holdMs} / {feedback.decayMs} ms · {FEEDBACK_TONE_LABELS[feedback.tone]}
        </div>
      ) : null}
    </div>
  );
}
