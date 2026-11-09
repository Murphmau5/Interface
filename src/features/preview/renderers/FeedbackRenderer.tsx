import { useCallback, useRef } from "react";

import {
  FEEDBACK_TONE_LABELS,
  type FeedbackSpec,
} from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations } from "./usePreviewAnimations";

const TONE_CLASS: Record<FeedbackSpec["tone"], string> = {
  success: "pv-tone-success",
  error: "pv-tone-error",
  warning: "pv-tone-warning",
  info: "pv-tone-info",
};

export function FeedbackRenderer({ spec, playing, loop, revision }: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const feedback = spec as FeedbackSpec;
  const total = feedback.triggerMs + feedback.holdMs + feedback.decayMs;

  const build = useCallback(
    (root: HTMLElement) => {
      const toast = root.querySelector<HTMLElement>("[data-pv-toast]");
      const dot = root.querySelector<HTMLElement>("[data-pv-dot]");
      if (!toast) return [];

      const trigger = feedback.triggerMs / total;
      const hold = (feedback.triggerMs + feedback.holdMs) / total;

      return [
        {
          element: toast,
          keyframes: [
            { opacity: 0, transform: "translate3d(0, 6px, 0)", offset: 0 },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: trigger },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: hold },
            { opacity: 0, transform: "translate3d(0, -4px, 0)", offset: 1 },
          ],
          options: { duration: total, easing: feedback.easing },
        },
        ...(dot
          ? [
              {
                element: dot,
                keyframes: [
                  { transform: "scale(1)", opacity: 1, offset: 0 },
                  { transform: "scale(1.5)", opacity: 1, offset: trigger },
                  { transform: "scale(1)", opacity: 1, offset: hold },
                  { transform: "scale(1)", opacity: 0, offset: 1 },
                ],
                options: { duration: total, easing: feedback.easing },
              },
            ]
          : []),
      ];
    },
    [feedback, total],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  return (
    <div ref={rootRef} className={TONE_CLASS[feedback.tone]} data-pv-feedback>
      <div className="pv-feedback-badge" data-pv-toast>
        <span className="pv-feedback-dot" data-pv-dot aria-hidden />
        <span className="pv-feedback-text">
          {FEEDBACK_TONE_LABELS[feedback.tone]}反馈
        </span>
      </div>
      <div className="pv-feedback-axis" aria-hidden>
        <span style={{ flex: feedback.triggerMs || 1 }} data-phase="trigger" />
        <span style={{ flex: feedback.holdMs }} data-phase="hold" />
        <span style={{ flex: feedback.decayMs }} data-phase="decay" />
      </div>
      <div className="pv-feedback-caption">
        {feedback.triggerMs} / {feedback.holdMs} / {feedback.decayMs} ms
      </div>
    </div>
  );
}
