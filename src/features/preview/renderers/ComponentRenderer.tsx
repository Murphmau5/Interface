import { useCallback, useRef, useState } from "react";

import { COMPONENT_CONTROL_LABELS, type ComponentSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations, type PreviewAnimationPlan } from "./usePreviewAnimations";

export function ComponentRenderer({
  spec,
  playing,
  loop,
  revision,
  interactive,
}: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const component = spec as ComponentSpec;
  const [checked, setChecked] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [value, setValue] = useState("界序");

  const transition = `${component.durationMs}ms ${component.easing}`;

  const build = useCallback(
    (root: HTMLElement) => {
      if (interactive) return [];

      if (component.control === "switch") {
        const knob = root.querySelector<HTMLElement>("[data-pv-knob]");
        if (!knob) return [];
        return [
          {
            element: knob,
            keyframes: [
              { transform: "translate3d(0, 0, 0)", offset: 0 },
              { transform: "translate3d(20px, 0, 0)", offset: 0.5 },
              { transform: "translate3d(0, 0, 0)", offset: 1 },
            ],
            options: { duration: component.durationMs * 2, easing: component.easing },
          },
        ];
      }

      if (component.control === "button") {
        const button = root.querySelector<HTMLElement>("[data-pv-button]");
        if (!button) return [];
        return [
          {
            element: button,
            keyframes: [
              { transform: "scale(1)", offset: 0 },
              { transform: "scale(0.96)", offset: 0.35 },
              { transform: "scale(1)", offset: 1 },
            ],
            options: { duration: component.durationMs, easing: component.easing },
          },
        ];
      }

      const caret = root.querySelector<HTMLElement>("[data-pv-caret]");
      const field = root.querySelector<HTMLElement>("[data-pv-field]");
      const plans: PreviewAnimationPlan[] = [];
      if (caret) {
        plans.push({
          element: caret,
          keyframes: [
            { opacity: 0, offset: 0 },
            { opacity: 1, offset: 0.5 },
            { opacity: 0, offset: 1 },
          ],
          options: { duration: component.durationMs, easing: component.easing },
        });
      }
      if (field) {
        plans.push({
          element: field,
          keyframes: [
            { boxShadow: "0 0 0 0 rgba(127, 211, 232, 0)", offset: 0 },
            { boxShadow: "0 0 0 3px rgba(127, 211, 232, 0.24)", offset: 0.5 },
            { boxShadow: "0 0 0 0 rgba(127, 211, 232, 0)", offset: 1 },
          ],
          options: { duration: component.durationMs, easing: component.easing },
        });
      }
      return plans;
    },
    [component, interactive],
  );

  usePreviewAnimations(rootRef, playing, loop, revision, build);

  return (
    <div
      ref={rootRef}
      className="pv-component"
      data-interactive={interactive ? "true" : "false"}
      aria-label={`可交互组件示例：${COMPONENT_CONTROL_LABELS[component.control]}`}
    >
      {component.control === "switch" ? (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          tabIndex={interactive ? 0 : -1}
          onClick={() => setChecked((value) => !value)}
          className="pv-switch"
          data-checked={checked}
          style={{ transitionDuration: `${component.durationMs}ms`, transitionTimingFunction: component.easing }}
        >
          <span
            data-pv-knob
            className="pv-switch-knob"
            style={{ transitionDuration: `${component.durationMs}ms`, transitionTimingFunction: component.easing }}
          />
        </button>
      ) : null}

      {component.control === "button" ? (
        <button
          type="button"
          data-pv-button
          tabIndex={interactive ? 0 : -1}
          onClick={() => setClicks((value) => value + 1)}
          className="pv-button"
          style={{ transitionDuration: `${component.durationMs}ms`, transitionTimingFunction: component.easing }}
        >
          {clicks > 0 ? `已点击 ${clicks}` : "提交"}
        </button>
      ) : null}

      {component.control === "input" ? (
        <label className="pv-field" data-pv-field>
          <span className="pv-field-label">名称</span>
          <span className="pv-field-control">
            <input
              value={value}
              maxLength={24}
              tabIndex={interactive ? 0 : -1}
              onChange={(event) => setValue(event.target.value)}
              style={{ transitionDuration: `${component.durationMs}ms`, transitionTimingFunction: component.easing }}
            />
            <span data-pv-caret className="pv-caret" aria-hidden />
          </span>
        </label>
      ) : null}

      <div className="pv-component-caption">
        {COMPONENT_CONTROL_LABELS[component.control]} · {transition}
      </div>
    </div>
  );
}
