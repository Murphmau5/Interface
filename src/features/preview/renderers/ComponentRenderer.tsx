import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { COMPONENT_CONTROL_LABELS, type ComponentSpec } from "@/lib/preview";

import type { RendererProps } from "./types";
import { usePreviewAnimations, type PreviewAnimationPlan } from "./usePreviewAnimations";

const SEGMENTS = ["日", "周", "月"];
const TABS = ["概览", "详情", "记录"];

const PANEL: CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};

function GenericCaption({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <span style={{ fontSize: 12, color: "var(--text-secondary)", ...style }}>{text}</span>
  );
}

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
        case "nav":
          return single("[data-pv-nav-active]", [
            { opacity: 0.35, offset: 0 },
            { opacity: 1, offset: 0.5 },
            { opacity: 0.35, offset: 1 },
          ]);
        case "menu":
          return single("[data-pv-menu]", [
            { opacity: 0, transform: "translate3d(0, -6px, 0) scale(0.97)", offset: 0 },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", offset: 0.5 },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", offset: 1 },
          ]);
        case "modal":
          return single("[data-pv-modal]", [
            { opacity: 0, transform: "translate3d(0, 12px, 0) scale(0.98)", offset: 0 },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", offset: 0.5 },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", offset: 1 },
          ]);
        case "toast":
          return single("[data-pv-toast]", [
            { opacity: 0, transform: "translate3d(0, 8px, 0)", offset: 0 },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 0.5 },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 1 },
          ]);
        case "card":
          return single("[data-pv-card]", [
            { opacity: 0.4, transform: "translate3d(0, 6px, 0)", offset: 0 },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 0.5 },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 1 },
          ]);
        case "list":
          return single("[data-pv-row]", [
            { opacity: 0.3, transform: "translate3d(0, 5px, 0)", offset: 0 },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 0.5 },
            { opacity: 1, transform: "translate3d(0, 0, 0)", offset: 1 },
          ]);
        case "empty":
          return single("[data-pv-empty]", [
            { opacity: 0.4, transform: "scale(0.98)", offset: 0 },
            { opacity: 1, transform: "scale(1)", offset: 0.5 },
            { opacity: 1, transform: "scale(1)", offset: 1 },
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

      {component.control === "nav" ? (
        <div style={{ width: "min(540px, 100%)", display: "grid", gap: 8 }}>
          <div style={{ ...PANEL, padding: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <strong style={{ fontSize: 13, margin: "0 8px 0 4px" }}>工作台</strong>
            {["概览", "案例", "设置"].map((label, index) => (
              <span
                key={label}
                data-pv-nav-active={index === 0 ? "true" : undefined}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: index === 0 ? "var(--surface)" : "transparent",
                  color: index === 0 ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {label}
              </span>
            ))}
            <span style={{ flex: 1 }} />
            <span
              aria-hidden
              style={{ width: 22, height: 22, borderRadius: 999, background: "var(--accent)", opacity: 0.75 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <GenericCaption text="工作台" />
            <GenericCaption text="/" />
            <GenericCaption text="案例库" />
          </div>
        </div>
      ) : null}

      {component.control === "menu" ? (
        <div style={{ display: "grid", gap: 8, width: "min(260px, 100%)" }}>
          <div data-pv-menu style={{ ...PANEL, padding: 6, boxShadow: "0 16px 34px rgba(0,0,0,0.22)" }}>
            <GenericCaption text="操作" style={{ display: "block", padding: "4px 8px" }} />
            {["复制链接", "导出 JSON", "归档案例"].map((label, index) => (
              <div
                key={label}
                style={{
                  padding: "7px 8px",
                  borderRadius: 7,
                  fontSize: 12,
                  background: index === 1 ? "var(--surface)" : "transparent",
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <GenericCaption text="Esc 关闭 · 焦点回到锚点" />
        </div>
      ) : null}

      {component.control === "modal" ? (
        <div
          style={{
            width: "min(430px, 100%)",
            padding: 18,
            borderRadius: 16,
            background: "color-mix(in srgb, var(--surface) 72%, transparent)",
          }}
        >
          <div data-pv-modal style={{ ...PANEL, padding: 16, boxShadow: "0 18px 44px rgba(0,0,0,0.28)" }}>
            <strong style={{ fontSize: 14 }}>归档这个案例？</strong>
            <p style={{ margin: "6px 0 14px", fontSize: 12, color: "var(--text-secondary)" }}>
              归档后仍可搜索，但不再出现在默认列表。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <span style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }}>
                取消
              </span>
              <span
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, background: "var(--accent)", color: "var(--accent-ink, #fff)" }}
              >
                归档
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {component.control === "toast" ? (
        <div style={{ display: "grid", gap: 8, width: "min(330px, 100%)" }}>
          <div
            data-pv-toast
            style={{ ...PANEL, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
          >
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)" }} />
            已加入收藏
          </div>
          <div
            style={{
              ...PANEL,
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text-secondary)",
              opacity: 0.75,
            }}
          >
            后台同步完成
          </div>
        </div>
      ) : null}

      {component.control === "card" ? (
        <article data-pv-card style={{ ...PANEL, padding: 16, width: "min(320px, 100%)" }}>
          <GenericCaption text="案例 · 玻璃拟态" />
          <strong style={{ display: "block", margin: "6px 0 4px", fontSize: 14 }}>半透明磨砂面板</strong>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
            1px 亮边与多层浮动，暗色下降饱和。
          </p>
          <span
            style={{ display: "inline-block", padding: "6px 12px", borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }}
          >
            查看参数
          </span>
        </article>
      ) : null}

      {component.control === "list" ? (
        <div style={{ width: "min(480px, 100%)", ...PANEL, overflow: "hidden", fontSize: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 96px 56px",
              padding: "9px 12px",
              color: "var(--text-secondary)",
              background: "var(--surface)",
            }}
          >
            <span>名称</span>
            <span>类型</span>
            <span>置信度</span>
          </div>
          {[
            ["玻璃拟态", "风格", "推测"],
            ["错峰入场", "动效", "推测"],
            ["空状态", "反馈", "自定义"],
          ].map((row, index) => (
            <div
              key={row[0]}
              data-pv-row={index === 0 ? "true" : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 96px 56px",
                padding: "9px 12px",
                borderTop: "1px solid var(--border)",
              }}
            >
              {row.map((cell) => (
                <span key={cell}>{cell}</span>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {component.control === "empty" ? (
        <div data-pv-empty style={{ display: "grid", justifyItems: "center", gap: 8, textAlign: "center" }}>
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "var(--surface-raised)",
              border: "1px dashed var(--border)",
              display: "grid",
              placeItems: "center",
              color: "var(--text-secondary)",
              fontSize: 18,
            }}
          >
            +
          </span>
          <strong style={{ fontSize: 14 }}>还没有案例</strong>
          <GenericCaption text="导入内容包，或新建第一条案例" />
          <span
            style={{
              padding: "7px 14px",
              borderRadius: 9,
              fontSize: 12,
              background: "var(--accent)",
              color: "var(--accent-ink, #fff)",
            }}
          >
            新建案例
          </span>
        </div>
      ) : null}

      <div className="pv-component-caption">
        {COMPONENT_CONTROL_LABELS[component.control]} · {transition}
      </div>
    </div>
  );
}
