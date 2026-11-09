/**
 * 预览规格 v2：判别联合，kind 决定渲染器。
 * 只接受自绘场景的参数，不执行任意 CSS / JS。
 */

export type PreviewKind = "motion" | "feedback" | "component" | "theme" | "style";

export interface MotionSpec {
  v: 2;
  kind: "motion";
  durationMs: number;
  delayMs: number;
  staggerMs: number;
  easing: string;
  distance: number;
  scale: number;
  opacity: number;
  blur: number;
}

export interface FeedbackSpec {
  v: 2;
  kind: "feedback";
  triggerMs: number;
  holdMs: number;
  decayMs: number;
  easing: string;
  tone: "success" | "error" | "warning" | "info";
}

export interface ComponentSpec {
  v: 2;
  kind: "component";
  control: "switch" | "button" | "input";
  durationMs: number;
  easing: string;
}

export interface ThemeSpec {
  v: 2;
  kind: "theme";
  durationMs: number;
  holdMs: number;
  easing: string;
}

export interface StyleSpec {
  v: 2;
  kind: "style";
  treatment: "flat" | "neumorphic" | "glass";
  radiusPx: number;
  depth: number;
  durationMs: number;
  easing: string;
}

export type PreviewSpec =
  | MotionSpec
  | FeedbackSpec
  | ComponentSpec
  | ThemeSpec
  | StyleSpec;

export const PREVIEW_KIND_LABELS: Record<PreviewKind, string> = {
  motion: "动效",
  feedback: "反馈",
  component: "组件",
  theme: "主题",
  style: "风格",
};

export const FEEDBACK_TONES = ["success", "error", "warning", "info"] as const;
export const FEEDBACK_TONE_LABELS: Record<FeedbackSpec["tone"], string> = {
  success: "成功",
  error: "错误",
  warning: "警告",
  info: "信息",
};

export const COMPONENT_CONTROLS = ["switch", "button", "input"] as const;
export const COMPONENT_CONTROL_LABELS: Record<ComponentSpec["control"], string> = {
  switch: "开关",
  button: "按钮",
  input: "输入框",
};

export const STYLE_TREATMENTS = ["flat", "neumorphic", "glass"] as const;
export const STYLE_TREATMENT_LABELS: Record<StyleSpec["treatment"], string> = {
  flat: "扁平",
  neumorphic: "新拟态",
  glass: "玻璃",
};

export const EASING_PRESETS = [
  { value: "linear", label: "linear" },
  { value: "ease", label: "ease" },
  { value: "ease-in", label: "ease-in" },
  { value: "ease-out", label: "ease-out" },
  { value: "ease-in-out", label: "ease-in-out" },
  { value: "cubic-bezier(0.32,0.72,0,1)", label: "标准推入" },
  { value: "cubic-bezier(0.2,0.8,0.2,1)", label: "回弹" },
  { value: "cubic-bezier(0.4,0,0.2,1)", label: "材料" },
] as const;

const EASING_PATTERN =
  /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(-?[0-9.]+,\s*-?[0-9.]+,\s*-?[0-9.]+,\s*-?[0-9.]+\))$/;

const DEFAULT_EASING = "cubic-bezier(0.32,0.72,0,1)";

export const DEFAULT_SPECS: Record<PreviewKind, PreviewSpec> = {
  motion: {
    v: 2,
    kind: "motion",
    durationMs: 900,
    delayMs: 0,
    staggerMs: 70,
    easing: DEFAULT_EASING,
    distance: 8,
    scale: 1,
    opacity: 0,
    blur: 0,
  },
  feedback: {
    v: 2,
    kind: "feedback",
    triggerMs: 0,
    holdMs: 200,
    decayMs: 440,
    easing: "cubic-bezier(0.2,0.8,0.2,1)",
    tone: "info",
  },
  component: {
    v: 2,
    kind: "component",
    control: "switch",
    durationMs: 220,
    easing: DEFAULT_EASING,
  },
  theme: {
    v: 2,
    kind: "theme",
    durationMs: 1000,
    holdMs: 600,
    easing: "cubic-bezier(0.4,0,0.2,1)",
  },
  style: {
    v: 2,
    kind: "style",
    treatment: "neumorphic",
    radiusPx: 12,
    depth: 10,
    durationMs: 320,
    easing: "ease-out",
  },
};

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pickEasing(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return EASING_PATTERN.test(trimmed) ? trimmed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function defaultPreviewSpec(kind: PreviewKind): PreviewSpec {
  return { ...DEFAULT_SPECS[kind] };
}

function parseMotion(raw: Record<string, unknown>): MotionSpec {
  return {
    v: 2,
    kind: "motion",
    durationMs: round(clamp(raw.durationMs, 200, 5000, 900)),
    delayMs: round(clamp(raw.delayMs, 0, 2000, 0)),
    staggerMs: round(clamp(raw.staggerMs, 0, 400, 70)),
    easing: pickEasing(raw.easing, DEFAULT_EASING),
    distance: round(clamp(raw.distance, 0, 64, 8)),
    scale: round(clamp(raw.scale, 0.8, 1.2, 1), 2),
    opacity: round(clamp(raw.opacity, 0, 1, 0), 2),
    blur: round(clamp(raw.blur, 0, 16, 0)),
  };
}

function parseFeedback(raw: Record<string, unknown>): FeedbackSpec {
  return {
    v: 2,
    kind: "feedback",
    triggerMs: round(clamp(raw.triggerMs, 0, 2000, 0)),
    holdMs: round(clamp(raw.holdMs, 200, 6000, 200)),
    decayMs: round(clamp(raw.decayMs, 100, 3000, 440)),
    easing: pickEasing(raw.easing, "cubic-bezier(0.2,0.8,0.2,1)"),
    tone: oneOf(raw.tone, FEEDBACK_TONES, "info"),
  };
}

function parseComponent(raw: Record<string, unknown>): ComponentSpec {
  return {
    v: 2,
    kind: "component",
    control: oneOf(raw.control, COMPONENT_CONTROLS, "switch"),
    durationMs: round(clamp(raw.durationMs, 80, 1200, 220)),
    easing: pickEasing(raw.easing, DEFAULT_EASING),
  };
}

function parseTheme(raw: Record<string, unknown>): ThemeSpec {
  return {
    v: 2,
    kind: "theme",
    durationMs: round(clamp(raw.durationMs, 300, 3000, 1000)),
    holdMs: round(clamp(raw.holdMs, 200, 4000, 600)),
    easing: pickEasing(raw.easing, "cubic-bezier(0.4,0,0.2,1)"),
  };
}

function parseStyle(raw: Record<string, unknown>): StyleSpec {
  return {
    v: 2,
    kind: "style",
    treatment: oneOf(raw.treatment, STYLE_TREATMENTS, "neumorphic"),
    radiusPx: round(clamp(raw.radiusPx, 0, 28, 12)),
    depth: round(clamp(raw.depth, 0, 20, 10)),
    durationMs: round(clamp(raw.durationMs, 80, 1200, 320)),
    easing: pickEasing(raw.easing, "ease-out"),
  };
}

/** v1 旧 payload 的 type → v2 kind，保证老库升级后仍能播放 */
function upgradeLegacy(raw: Record<string, unknown>): PreviewSpec | null {
  const legacyType = typeof raw.type === "string" ? raw.type : null;
  if (!legacyType) return null;

  if (legacyType.startsWith("motion.")) {
    return parseMotion({ ...raw, staggerMs: raw.staggerMs ?? 0 });
  }
  if (legacyType === "theme.crossfade") {
    return parseTheme(raw);
  }
  return null;
}

/**
 * 解析 payload_json 里的 preview。
 * 字段非法就 clamp 到合法范围；结构不对（没有 preview 对象 / 未知 kind）返回 null。
 */
export function parsePreviewSpec(payloadJson: string): PreviewSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const preview = parsed.preview;
  if (!isRecord(preview)) return null;

  if (preview.kind === "motion") return parseMotion(preview);
  if (preview.kind === "feedback") return parseFeedback(preview);
  if (preview.kind === "component") return parseComponent(preview);
  if (preview.kind === "theme") return parseTheme(preview);
  if (preview.kind === "style") return parseStyle(preview);

  return upgradeLegacy(preview);
}

/** 把 spec 写回 payload，保留根对象上的其它字段 */
export function serializePreview(payloadJson: string, spec: PreviewSpec): string {
  let root: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (isRecord(parsed)) root = parsed;
  } catch {
    root = {};
  }
  root.v = 2;
  root.preview = spec;
  return JSON.stringify(root);
}

export function previewTitle(spec: PreviewSpec): string {
  switch (spec.kind) {
    case "motion":
      return "错峰入场";
    case "feedback":
      return `${FEEDBACK_TONE_LABELS[spec.tone]}反馈`;
    case "component":
      return `${COMPONENT_CONTROL_LABELS[spec.control]}交互`;
    case "theme":
      return "深浅交叉淡入";
    case "style":
      return `${STYLE_TREATMENT_LABELS[spec.treatment]}质感`;
  }
}

export function describePreview(spec: PreviewSpec): string {
  const head = `${PREVIEW_KIND_LABELS[spec.kind]} · ${previewTitle(spec)}`;
  switch (spec.kind) {
    case "motion":
      return `${head} · ${spec.durationMs}ms · 位移 ${spec.distance}px`;
    case "feedback":
      return `${head} · ${spec.triggerMs}+${spec.holdMs}+${spec.decayMs}ms`;
    case "component":
      return `${head} · ${spec.durationMs}ms`;
    case "theme":
      return `${head} · ${spec.durationMs}ms · 停留 ${spec.holdMs}ms`;
    case "style":
      return `${head} · R${spec.radiusPx} · D${spec.depth}`;
  }
}

export type PreviewFieldType = "number" | "select";

export interface PreviewField {
  key: string;
  label: string;
  type: PreviewFieldType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
}

/** 参数面板的字段定义：面板与导出共用，避免两处漂移 */
export function previewFields(spec: PreviewSpec): PreviewField[] {
  const easingField: PreviewField = {
    key: "easing",
    label: "缓动",
    type: "select",
    options: EASING_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
  };

  switch (spec.kind) {
    case "motion":
      return [
        { key: "durationMs", label: "时长", type: "number", min: 200, max: 5000, step: 20, unit: "ms" },
        { key: "delayMs", label: "延迟", type: "number", min: 0, max: 2000, step: 20, unit: "ms" },
        { key: "staggerMs", label: "错峰", type: "number", min: 0, max: 400, step: 5, unit: "ms" },
        easingField,
        { key: "distance", label: "位移", type: "number", min: 0, max: 64, step: 1, unit: "px" },
        { key: "scale", label: "缩放", type: "number", min: 0.8, max: 1.2, step: 0.01 },
        { key: "opacity", label: "起始透明度", type: "number", min: 0, max: 1, step: 0.05 },
        { key: "blur", label: "模糊", type: "number", min: 0, max: 16, step: 0.5, unit: "px" },
      ];
    case "feedback":
      return [
        { key: "triggerMs", label: "触发", type: "number", min: 0, max: 2000, step: 20, unit: "ms" },
        { key: "holdMs", label: "停留", type: "number", min: 200, max: 6000, step: 20, unit: "ms" },
        { key: "decayMs", label: "消退", type: "number", min: 100, max: 3000, step: 20, unit: "ms" },
        easingField,
        {
          key: "tone",
          label: "语气",
          type: "select",
          options: FEEDBACK_TONES.map((tone) => ({
            value: tone,
            label: FEEDBACK_TONE_LABELS[tone],
          })),
        },
      ];
    case "component":
      return [
        {
          key: "control",
          label: "控件",
          type: "select",
          options: COMPONENT_CONTROLS.map((control) => ({
            value: control,
            label: COMPONENT_CONTROL_LABELS[control],
          })),
        },
        { key: "durationMs", label: "时长", type: "number", min: 80, max: 1200, step: 10, unit: "ms" },
        easingField,
      ];
    case "theme":
      return [
        { key: "durationMs", label: "淡入时长", type: "number", min: 300, max: 3000, step: 20, unit: "ms" },
        { key: "holdMs", label: "停留", type: "number", min: 200, max: 4000, step: 20, unit: "ms" },
        easingField,
      ];
    case "style":
      return [
        {
          key: "treatment",
          label: "质感",
          type: "select",
          options: STYLE_TREATMENTS.map((treatment) => ({
            value: treatment,
            label: STYLE_TREATMENT_LABELS[treatment],
          })),
        },
        { key: "radiusPx", label: "圆角", type: "number", min: 0, max: 28, step: 1, unit: "px" },
        { key: "depth", label: "深度", type: "number", min: 0, max: 20, step: 1 },
        { key: "durationMs", label: "过渡", type: "number", min: 80, max: 1200, step: 10, unit: "ms" },
        easingField,
      ];
  }
}

/** 参数表行：面板底部与 Markdown 导出共用 */
export function previewParamRows(spec: PreviewSpec): { label: string; value: string }[] {
  return previewFields(spec).map((field) => {
    const raw = (spec as unknown as Record<string, unknown>)[field.key];
    let display: string;
    if (field.type === "select" && field.options) {
      display = field.options.find((option) => option.value === raw)?.label ?? String(raw);
    } else {
      display = `${raw}${field.unit ?? ""}`;
    }
    return { label: field.label, value: display };
  });
}

/** 改一个字段并 clamp，返回新的 spec（不原地修改） */
export function updatePreviewField(
  spec: PreviewSpec,
  key: string,
  value: string | number,
): PreviewSpec {
  const next = { ...spec } as unknown as Record<string, unknown>;
  const field = previewFields(spec).find((item) => item.key === key);

  if (!field) return spec;

  if (field.type === "select") {
    next[key] = String(value);
  } else {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return spec;
    const min = field.min ?? 0;
    const max = field.max ?? 0;
    const clamped = Math.min(max, Math.max(min, numeric));
    next[key] = field.step && field.step < 1 ? round(clamped, 2) : Math.round(clamped);
  }

  return parsePreviewSpec(JSON.stringify({ preview: next })) ?? spec;
}

export function buildPreviewPrompt(spec: PreviewSpec): string {
  switch (spec.kind) {
    case "motion":
      return [
        `实现一段「${previewTitle(spec)}」列表入场动效：`,
        `时长 ${spec.durationMs}ms，延迟 ${spec.delayMs}ms，每行错峰 ${spec.staggerMs}ms，缓动 ${spec.easing}。`,
        `起始状态：位移 ${spec.distance}px、缩放 ${spec.scale}、透明度 ${spec.opacity}、模糊 ${spec.blur}px；结束回到原位、不透明、无模糊。`,
        "只动 transform / opacity / filter，不逐帧改布局尺寸，不使用外部动画库。",
      ].join("\n");
    case "feedback":
      return [
        `实现「${FEEDBACK_TONE_LABELS[spec.tone]}」反馈的三段节奏：`,
        `触发 ${spec.triggerMs}ms → 停留 ${spec.holdMs}ms → 消退 ${spec.decayMs}ms，缓动 ${spec.easing}。`,
        "触发段承担状态切换，停留段保持可读，消退段淡出且不阻塞交互；同时遵循 prefers-reduced-motion。",
      ].join("\n");
    case "component":
      return [
        `实现一个可交互的「${COMPONENT_CONTROL_LABELS[spec.control]}」控件：`,
        `状态切换时长 ${spec.durationMs}ms，缓动 ${spec.easing}。`,
        "保留键盘可达性（Enter / Space）、可见焦点环与 aria 状态，不写死颜色，沿用语义 Token。",
      ].join("\n");
    case "theme":
      return [
        "实现深色与浅色两套主题的交叉淡入切换：",
        `单次淡入 ${spec.durationMs}ms，高亮帧停留 ${spec.holdMs}ms，缓动 ${spec.easing}。`,
        "两套主题共用同一份语义 Token 结构，只换值；切换过程不产生布局位移。",
      ].join("\n");
    case "style":
      return [
        `实现「${STYLE_TREATMENT_LABELS[spec.treatment]}」质感的镶嵌面板：`,
        `圆角 ${spec.radiusPx}px，深度 ${spec.depth}，过渡 ${spec.durationMs}ms，缓动 ${spec.easing}。`,
        "用内阴影 + 半透明描边做镶嵌感，不做凸起、不做霓虹发光；颜色全部走语义 Token。",
      ].join("\n");
  }
}

export function buildPreviewSnippet(spec: PreviewSpec): string {
  const open = "```";
  switch (spec.kind) {
    case "motion":
      return [
        `${open}html`,
        `<div class="demo-list">`,
        `  <div class="demo-row" style="--i:0"></div>`,
        `  <div class="demo-row" style="--i:1"></div>`,
        `  <div class="demo-row" style="--i:2"></div>`,
        `</div>`,
        `${open}`,
        "",
        `${open}css`,
        `.demo-row {`,
        `  animation: demo-rise ${spec.durationMs}ms ${spec.easing} both;`,
        `  animation-delay: calc(${spec.delayMs}ms + var(--i) * ${spec.staggerMs}ms);`,
        `}`,
        `@keyframes demo-rise {`,
        `  from {`,
        `    opacity: ${spec.opacity};`,
        `    transform: translate3d(0, ${spec.distance}px, 0) scale(${spec.scale});`,
        `    filter: blur(${spec.blur}px);`,
        `  }`,
        `  to { opacity: 1; transform: none; filter: blur(0); }`,
        `}`,
        `${open}`,
      ].join("\n");
    case "feedback": {
      const total = spec.triggerMs + spec.holdMs + spec.decayMs;
      return [
        `${open}css`,
        `.demo-toast {`,
        `  animation: demo-feedback ${total}ms ${spec.easing} both;`,
        `}`,
        `@keyframes demo-feedback {`,
        `  0% { opacity: 0; transform: translate3d(0, 6px, 0); }`,
        `  ${Math.round((spec.triggerMs / total) * 100)}% { opacity: 1; transform: none; }`,
        `  ${Math.round(((spec.triggerMs + spec.holdMs) / total) * 100)}% { opacity: 1; transform: none; }`,
        `  100% { opacity: 0; transform: translate3d(0, -4px, 0); }`,
        `}`,
        `${open}`,
      ].join("\n");
    }
    case "component":
      return [
        `${open}css`,
        `.demo-control { transition: all ${spec.durationMs}ms ${spec.easing}; }`,
        `.demo-control:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`,
        `${open}`,
      ].join("\n");
    case "theme":
      return [
        `${open}css`,
        `.demo-theme { transition: background-color ${spec.durationMs}ms ${spec.easing}, color ${spec.durationMs}ms ${spec.easing}; }`,
        `/* 高亮帧停留 ${spec.holdMs}ms 后再切回，避免闪动 */`,
        `${open}`,
      ].join("\n");
    case "style":
      return [
        `${open}css`,
        `.demo-panel {`,
        `  border-radius: ${spec.radiusPx}px;`,
        `  border: 1px solid rgb(255 255 255 / 0.06);`,
        `  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04), inset 0 -1px 0 rgb(0 0 0 / 0.4);`,
        `  transition: box-shadow ${spec.durationMs}ms ${spec.easing}, border-radius ${spec.durationMs}ms ${spec.easing};`,
        `}`,
        `${open}`,
      ].join("\n");
  }
}
