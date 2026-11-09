import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { COMPONENT_CONTROL_LABELS, type ComponentSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations, type PreviewAnimationPlan } from "./usePreviewAnimations";

const SEGMENTS = ["日", "周", "月"];
const TABS = ["概览", "详情", "记录"];

function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        d="M8 2.2c-1.9 0-3.3 1.4-3.3 3.3v2.1L3.5 9.7v.9h9v-.9L11.3 7.6V5.5c0-1.9-1.4-3.3-3.3-3.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M6.6 12.1a1.4 1.4 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ComponentRenderer({
  spec,
  playing,
  loop,
  revision,
  interactive,
}: RendererProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const component = spec as ComponentSpec;
  const [checked, setChecked] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [value, setValue] = useState("界序");
  const [segment, setSegment] = useState(0);
  const [boxed, setBoxed] = useState(false);
  const [radio, setRadio] = useState(0);
  const [slider, setSlider] = useState(45);
  const [tab, setTab] = useState(0);
  const [progress, setProgress] = useState(40);
  const [skeletonLoaded, setSkeletonLoaded] = useState(false);
  const [count, setCount] = useState(3);

  const transition = `${component.durationMs}ms ${component.easing}`;
  const timing = {
    transitionDuration: `${component.durationMs}ms`,
    transitionTimingFunction: component.easing,
  };

  const updateSlider = (clientX: number) => {
    const track = sliderRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    setSlider(Math.round(Math.min(1, Math.max(0, ratio)) * 100));
  };

  const onSliderDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSlider(event.clientX);
  };

  const onSliderMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateSlider(event.clientX);
  };

  const onSliderUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const build = useCallback(
    (root: HTMLElement): PreviewAnimationPlan[] => {
      if (interactive) return [];

      const single = (selector: string, keyframes: Keyframe[]): PreviewAnimationPlan[] => {
        const element = root.querySelector<HTMLElement>(selector);
        if (!element) return [];
        return [
          {
            element,
            keyframes,
            options: { duration: component.durationMs, easing: component.easing },
          },
        ];
      };

      switch (component.control) {
        case "switch":
          return single("[data-pv-knob]", [
            { transform: "translate3d(0, 0, 0)", offset: 0 },
            { transform: "translate3d(20px, 0, 0)", offset: 0.5 },
            { transform: "translate3d(0, 0, 0)", offset: 1 },
          ]);
        case "button":
          return single("[data-pv-button]", [
            { transform: "scale(1)", offset: 0 },
            { transform: "scale(0.96)", offset: 0.35 },
            { transform: "scale(1)", offset: 1 },
          ]);
        case "input": {
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
        }
        case "segmented":
          return single("[data-pv-seg-indicator]", [
            { transform: "translate3d(0, 0, 0)", offset: 0 },
            { transform: "translate3d(calc(100% + 2px), 0, 0)", offset: 0.5 },
            { transform: "translate3d(calc(200% + 4px), 0, 0)", offset: 1 },
          ]);
        case "checkbox":
          return single("[data-pv-check]", [
            { transform: "scale(0)", offset: 0 },
            { transform: "scale(1)", offset: 0.5 },
            { transform: "scale(0)", offset: 1 },
          ]);
        case "radio":
          return single("[data-pv-radio-dot]", [
            { transform: "scale(0)", offset: 0 },
            { transform: "scale(1)", offset: 0.45 },
            { transform: "scale(0)", offset: 1 },
          ]);
        case "slider":
          return single("[data-pv-slider-fill]", [
            { transform: "scaleX(0.12)", offset: 0 },
            { transform: "scaleX(0.88)", offset: 0.5 },
            { transform: "scaleX(0.12)", offset: 1 },
          ]);
        case "tabs":
          return single("[data-pv-tab-indicator]", [
            { transform: "translate3d(0, 0, 0)", offset: 0 },
            { transform: "translate3d(calc(100% + 2px), 0, 0)", offset: 0.5 },
            { transform: "translate3d(calc(200% + 4px), 0, 0)", offset: 1 },
          ]);
        case "progress":
          return single("[data-pv-progress-fill]", [
            { transform: "scaleX(0.08)", offset: 0 },
            { transform: "scaleX(1)", offset: 0.5 },
            { transform: "scaleX(0.08)", offset: 1 },
          ]);
        case "skeleton":
          return single("[data-pv-skeleton-card]", [
            { opacity: 0.45, offset: 0 },
            { opacity: 1, offset: 0.5 },
            { opacity: 0.45, offset: 1 },
          ]);
        case "badge":
          return single("[data-pv-badge]", [
            { transform: "scale(1)", offset: 0 },
            { transform: "scale(1.3)", offset: 0.5 },
            { transform: "scale(1)", offset: 1 },
          ]);
      }
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
          onClick={() => setChecked((current) => !current)}
          className="pv-switch"
          data-checked={checked}
          style={timing}
        >
          <span data-pv-knob className="pv-switch-knob" style={timing} />
        </button>
      ) : null}

      {component.control === "button" ? (
        <button
          type="button"
          data-pv-button
          tabIndex={interactive ? 0 : -1}
          onClick={() => setClicks((current) => current + 1)}
          className="pv-button"
          style={timing}
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
              style={timing}
            />
            <span data-pv-caret className="pv-caret" aria-hidden />
          </span>
        </label>
      ) : null}

      {component.control === "segmented" ? (
        <div className="pv-segmented" role="group" aria-label="时间范围">
          <span
            className="pv-seg-indicator"
            data-pv-seg-indicator
            aria-hidden
            style={{ transform: `translate3d(calc(${segment * 100}% + ${segment * 2}px), 0, 0)`, ...timing }}
          />
          {SEGMENTS.map((label, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={segment === index}
              tabIndex={interactive ? 0 : -1}
              className="pv-seg-option"
              data-active={segment === index}
              onClick={() => setSegment(index)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {component.control === "checkbox" ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={boxed}
          tabIndex={interactive ? 0 : -1}
          className="pv-checkbox"
          data-checked={boxed}
          onClick={() => setBoxed((current) => !current)}
        >
          <span className="pv-checkbox-box" style={timing}>
            <span className="pv-checkmark" data-pv-check style={timing} />
          </span>
          <span>同意条款</span>
        </button>
      ) : null}

      {component.control === "radio" ? (
        <div className="pv-radio-group" role="radiogroup" aria-label="优先级">
          {["低", "中", "高"].map((label, index) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={radio === index}
              tabIndex={interactive ? 0 : -1}
              className="pv-radio"
              data-checked={radio === index}
              onClick={() => setRadio(index)}
            >
              <span className="pv-radio-ring" style={timing}>
                <span
                  className="pv-radio-dot"
                  {...(index === 0 ? { "data-pv-radio-dot": true } : {})}
                  style={timing}
                />
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {component.control === "slider" ? (
        <div className="pv-slider-wrap">
          <div
            ref={sliderRef}
            className="pv-slider"
            role="slider"
            aria-label="数值"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={slider}
            tabIndex={interactive ? 0 : -1}
            onPointerDown={onSliderDown}
            onPointerMove={onSliderMove}
            onPointerUp={onSliderUp}
            onPointerCancel={onSliderUp}
          >
            <span className="pv-slider-track" aria-hidden>
              <span
                className="pv-slider-fill"
                data-pv-slider-fill
                style={{ transform: `scaleX(${slider / 100})`, ...timing }}
              />
            </span>
            <span className="pv-slider-knob" style={{ left: `${slider}%`, ...timing }} aria-hidden />
          </div>
          <span className="pv-component-value">{slider}</span>
        </div>
      ) : null}

      {component.control === "tabs" ? (
        <div className="pv-tabs" role="tablist" aria-label="视图">
          <span
            className="pv-tabs-indicator"
            data-pv-tab-indicator
            aria-hidden
            style={{ transform: `translate3d(calc(${tab * 100}% + ${tab * 2}px), 0, 0)`, ...timing }}
          />
          {TABS.map((label, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={tab === index}
              tabIndex={interactive ? 0 : -1}
              className="pv-tab"
              data-active={tab === index}
              onClick={() => setTab(index)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {component.control === "progress" ? (
        <div className="pv-progress-wrap">
          <div className="pv-progress-track" aria-hidden>
            <span
              className="pv-progress-fill"
              data-pv-progress-fill
              style={{ transform: `scaleX(${progress / 100})`, ...timing }}
            />
          </div>
          <button
            type="button"
            className="pv-progress-advance"
            tabIndex={interactive ? 0 : -1}
            onClick={() => setProgress((current) => (current >= 100 ? 0 : current + 20))}
            style={timing}
          >
            推进 {progress}%
          </button>
        </div>
      ) : null}

      {component.control === "skeleton" ? (
        <div className="pv-skeleton-wrap">
          <div className="pv-skeleton-card" data-pv-skeleton-card data-loaded={skeletonLoaded}>
            {skeletonLoaded ? (
              <span className="pv-skeleton-done">内容已就绪</span>
            ) : (
              <>
                <span className="pv-skeleton-line" data-width="long" aria-hidden />
                <span className="pv-skeleton-line" data-width="short" aria-hidden />
                <span className="pv-skeleton-line" data-width="medium" aria-hidden />
              </>
            )}
          </div>
          <button
            type="button"
            className="pv-progress-advance"
            tabIndex={interactive ? 0 : -1}
            onClick={() => setSkeletonLoaded((current) => !current)}
            style={timing}
          >
            {skeletonLoaded ? "重新加载" : "加载完成"}
          </button>
        </div>
      ) : null}

      {component.control === "badge" ? (
        <button
          type="button"
          className="pv-badge-button"
          aria-label={`通知，共 ${count} 条`}
          tabIndex={interactive ? 0 : -1}
          onClick={() => setCount((current) => (current > 99 ? 3 : current + 1))}
          style={timing}
        >
          <BellIcon />
          <span className="pv-badge" data-pv-badge>
            {count > 99 ? "99+" : count}
          </span>
        </button>
      ) : null}

      <div className="pv-component-caption">
        {COMPONENT_CONTROL_LABELS[component.control]} · {transition}
      </div>
    </div>
  );
}
