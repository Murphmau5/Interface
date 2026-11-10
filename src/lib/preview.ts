/**
 * 预览规格 v2：判别联合，kind 决定渲染器。
 * 只接受自绘场景的参数，不执行任意 CSS / JS。
 */

export type PreviewKind = "motion" | "feedback" | "component" | "theme" | "style";

export type MotionScene =
  | "stagger"
  | "page-push"
  | "shared-element"
  | "micro"
  | "spring"
  | "parallax"
  | "loading"
  | "easing"
  | "reduced";

export type FeedbackScene =
  | "toast"
  | "validation"
  | "submit"
  | "confirm"
  | "loading"
  | "empty"
  | "error"
  | "states";

export type ThemeScene =
  | "crossfade"
  | "light"
  | "dark"
  | "system"
  | "brand"
  | "accent"
  | "override";

export type ComponentControl =
  | "switch"
  | "button"
  | "input"
  | "segmented"
  | "checkbox"
  | "radio"
  | "slider"
  | "tabs"
  | "progress"
  | "skeleton"
  | "badge"
  | "nav"
  | "menu"
  | "modal"
  | "toast"
  | "card"
  | "list"
  | "empty";

export type StyleTreatment =
  | "flat"
  | "neumorphic"
  | "glass"
  | "clay"
  | "brutalism"
  | "neobrutalism"
  | "editorial"
  | "bento"
  | "card";

export interface MotionSpec {
  v: 2;
  kind: "motion";
  scene: MotionScene;
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
  scene: FeedbackScene;
  triggerMs: number;
  holdMs: number;
  decayMs: number;
  easing: string;
  tone: "success" | "error" | "warning" | "info";
}

export interface ComponentSpec {
  v: 2;
  kind: "component";
  control: ComponentControl;
  durationMs: number;
  easing: string;
  /** 最小可点击热区（CSS px）；只有需要外扩热区的条目才带 */
  hitTarget?: number;
}

export interface ThemeSpec {
  v: 2;
  kind: "theme";
  scene: ThemeScene;
  durationMs: number;
  holdMs: number;
  easing: string;
}

export interface StyleSpec {
  v: 2;
  kind: "style";
  treatment: StyleTreatment;
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

export const MOTION_SCENES = [
  "stagger",
  "page-push",
  "shared-element",
  "micro",
  "spring",
  "parallax",
  "loading",
  "easing",
  "reduced",
] as const;
export const MOTION_SCENE_LABELS: Record<MotionScene, string> = {
  stagger: "错峰入场",
  "page-push": "页面推入",
  "shared-element": "共享元素",
  micro: "按压微交互",
  spring: "回弹移动",
  parallax: "视差位移",
  loading: "加载脉冲",
  easing: "缓动曲线",
  reduced: "减弱动效",
};

export const FEEDBACK_SCENES = [
  "toast",
  "validation",
  "submit",
  "confirm",
  "loading",
  "empty",
  "error",
  "states",
] as const;
export const FEEDBACK_SCENE_LABELS: Record<FeedbackScene, string> = {
  toast: "悬浮提示",
  validation: "表单校验",
  submit: "提交状态",
  confirm: "确认对话框",
  loading: "加载骨架",
  empty: "空状态",
  error: "错误重试",
  states: "交互状态",
};

export const THEME_SCENES = [
  "crossfade",
  "light",
  "dark",
  "system",
  "brand",
  "accent",
  "override",
] as const;
export const THEME_SCENE_LABELS: Record<ThemeScene, string> = {
  crossfade: "交叉淡入",
  light: "浅色层级",
  dark: "深色层级",
  system: "跟随系统",
  brand: "品牌色板",
  accent: "强调色阶",
  override: "局部覆盖",
};

export const COMPONENT_CONTROLS = [
  "switch",
  "button",
  "input",
  "segmented",
  "checkbox",
  "radio",
  "slider",
  "tabs",
  "progress",
  "skeleton",
  "badge",
  "nav",
  "menu",
  "modal",
  "toast",
  "card",
  "list",
  "empty",
] as const;
export const COMPONENT_CONTROL_LABELS: Record<ComponentControl, string> = {
  switch: "开关",
  button: "按钮",
  input: "输入框",
  segmented: "分段控件",
  checkbox: "复选框",
  radio: "单选框",
  slider: "滑杆",
  tabs: "标签页",
  progress: "进度条",
  skeleton: "骨架屏",
  badge: "徽标按钮",
  nav: "导航结构",
  menu: "浮层菜单",
  modal: "模态层",
  toast: "轻提示",
  card: "卡片",
  list: "列表与表格",
  empty: "空状态",
};

export const STYLE_TREATMENTS = [
  "flat",
  "neumorphic",
  "glass",
  "clay",
  "brutalism",
  "neobrutalism",
  "editorial",
  "bento",
  "card",
] as const;
export const STYLE_TREATMENT_LABELS: Record<StyleTreatment, string> = {
  flat: "扁平",
  neumorphic: "新拟态",
  glass: "玻璃",
  clay: "黏土",
  brutalism: "粗野",
  neobrutalism: "新粗野",
  editorial: "编辑排版",
  bento: "便当格",
  card: "卡片流",
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
    scene: "stagger",
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
    scene: "toast",
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
    scene: "crossfade",
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
    // 老 payload 没有 scene，落到错峰入场，保持原观感
    scene: oneOf(raw.scene, MOTION_SCENES, "stagger"),
    // 下限 120：微交互按知识域口径可到 120–200ms
    durationMs: round(clamp(raw.durationMs, 120, 5000, 900)),
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
    scene: oneOf(raw.scene, FEEDBACK_SCENES, "toast"),
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
    ...(typeof raw.hitTarget === "number"
      ? { hitTarget: round(clamp(raw.hitTarget, 24, 64, 24)) }
      : {}),
  };
}

function parseTheme(raw: Record<string, unknown>): ThemeSpec {
  return {
    v: 2,
    kind: "theme",
    scene: oneOf(raw.scene, THEME_SCENES, "crossfade"),
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
  root.v = 3;
  root.preview = spec;
  return JSON.stringify(root);
}

export function previewTitle(spec: PreviewSpec): string {
  switch (spec.kind) {
    case "motion":
      return MOTION_SCENE_LABELS[spec.scene];
    case "feedback":
      // toast 保持旧的「信息反馈」标题，其余场景带出场景名
      return spec.scene === "toast"
        ? `${FEEDBACK_TONE_LABELS[spec.tone]}反馈`
        : `${FEEDBACK_TONE_LABELS[spec.tone]} · ${FEEDBACK_SCENE_LABELS[spec.scene]}`;
    case "component":
      return `${COMPONENT_CONTROL_LABELS[spec.control]}交互`;
    case "theme":
      // crossfade 保持旧的「深浅交叉淡入」标题，其余场景直接显示场景名
      return spec.scene === "crossfade"
        ? "深浅交叉淡入"
        : THEME_SCENE_LABELS[spec.scene];
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

function sceneField(
  key: string,
  label: string,
  values: readonly string[],
  labels: Record<string, string>,
): PreviewField {
  return {
    key,
    label,
    type: "select",
    options: values.map((value) => ({ value, label: labels[value] ?? value })),
  };
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
        sceneField("scene", "场景", MOTION_SCENES, MOTION_SCENE_LABELS),
        { key: "durationMs", label: "时长", type: "number", min: 120, max: 5000, step: 20, unit: "ms" },
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
        sceneField("scene", "场景", FEEDBACK_SCENES, FEEDBACK_SCENE_LABELS),
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
        sceneField("control", "控件", COMPONENT_CONTROLS, COMPONENT_CONTROL_LABELS),
        { key: "durationMs", label: "时长", type: "number", min: 80, max: 1200, step: 10, unit: "ms" },
        easingField,
        ...(typeof spec.hitTarget === "number"
          ? [
              {
                key: "hitTarget",
                label: "热区",
                type: "number" as const,
                min: 24,
                max: 64,
                step: 1,
                unit: "px",
              },
            ]
          : []),
      ];
    case "theme":
      return [
        sceneField("scene", "场景", THEME_SCENES, THEME_SCENE_LABELS),
        { key: "durationMs", label: "淡入时长", type: "number", min: 300, max: 3000, step: 20, unit: "ms" },
        { key: "holdMs", label: "停留", type: "number", min: 200, max: 4000, step: 20, unit: "ms" },
        easingField,
      ];
    case "style":
      return [
        sceneField("treatment", "质感", STYLE_TREATMENTS, STYLE_TREATMENT_LABELS),
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

function motionPrompt(spec: MotionSpec): string[] {
  const base = [
    `时长 ${spec.durationMs}ms，延迟 ${spec.delayMs}ms，错峰 ${spec.staggerMs}ms，缓动 ${spec.easing}。`,
    "只动 transform / opacity / filter，不逐帧改布局尺寸，不使用外部动画库。",
  ];
  switch (spec.scene) {
    case "stagger":
      return [
        "实现一段「错峰入场」列表动效：",
        ...base,
        `起始状态：位移 ${spec.distance}px、缩放 ${spec.scale}、透明度 ${spec.opacity}、模糊 ${spec.blur}px；结束回到原位、不透明、无模糊。`,
      ];
    case "page-push":
      return [
        "实现「页面推入」转场：",
        ...base,
        `前层页面向左推出 ${spec.distance * 4}px，后层页面同步前移并缩放 ${Math.max(0.86, spec.scale - 0.08)}、降低透明度，形成纵深。`,
      ];
    case "shared-element":
      return [
        "实现「共享元素」展开：",
        ...base,
        "小方块以 transform 从卡片位置 scale 放大成面板，尺寸变化全部用 scale 表达，不触发重排（FLIP 观感）。",
      ];
    case "micro":
      return [
        "实现「按压微交互」：",
        ...base,
        "按钮 scale 1 → 0.96 → 1，按下瞬间出现确认点；反馈及时且不打乱阅读节奏。",
      ];
    case "spring":
      return [
        "实现「回弹移动」：",
        ...base,
        `卡片从 ${spec.distance * 2}px 外带回弹移动到目标位，结束前有轻微 overshoot，再回到零点。`,
      ];
    case "parallax":
      return [
        "实现「视差位移」：",
        ...base,
        "三层矩形以不同速度、不同方向循环错位，顶层位移最大、底层最小，形成空间层次。",
      ];
    case "loading":
      return [
        "实现「加载脉冲」：",
        ...base,
        "三个点依次脉冲，同时一条进度扫光从左到右循环；加载结束后整体淡出。",
      ];
    case "easing":
      return [
        "实现「缓动曲线」对照：",
        ...base,
        "两条等长轨迹同时出发，一条 linear、一条自定义贝塞尔，终点一致，用落点节奏说明曲线差异。",
      ];
    case "reduced":
      return [
        "实现「减弱动效」降级：",
        ...base,
        "左侧播放完整入场，右侧在 prefers-reduced-motion: reduce 下直接呈现终态，只保留一次 120ms 透明度变化。",
      ];
  }
}

function motionSnippet(spec: MotionSpec): string[] {
  const open = "```";
  const common = [
    `${open}css`,
    `@keyframes demo-motion {`,
    `  from { opacity: ${spec.opacity}; transform: translate3d(0, ${spec.distance}px, 0) scale(${spec.scale}); filter: blur(${spec.blur}px); }`,
    `  to { opacity: 1; transform: none; filter: blur(0); }`,
    `}`,
  ];
  switch (spec.scene) {
    case "stagger":
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
        `  animation: demo-motion ${spec.durationMs}ms ${spec.easing} both;`,
        `  animation-delay: calc(${spec.delayMs}ms + var(--i) * ${spec.staggerMs}ms);`,
        `}`,
        ...common.slice(1),
        `${open}`,
      ];
    case "page-push":
      return [
        `${open}css`,
        `.demo-page[data-depth="1"] { animation: demo-push ${spec.durationMs}ms ${spec.easing} both; }`,
        `.demo-page[data-depth="2"] { animation: demo-push-back ${spec.durationMs}ms ${spec.easing} both; }`,
        `@keyframes demo-push {`,
        `  from { opacity: 0; transform: translate3d(${spec.distance * 4}px, 0, 0) scale(${spec.scale}); }`,
        `  to { opacity: 1; transform: none; }`,
        `}`,
        `@keyframes demo-push-back {`,
        `  from { opacity: .5; transform: translate3d(${spec.distance * 2}px, 0, 0) scale(.92); }`,
        `  to { opacity: 1; transform: none; }`,
        `}`,
        `${open}`,
      ];
    case "shared-element":
      return [
        `${open}css`,
        `.demo-hero { transform-origin: top left; animation: demo-morph ${spec.durationMs}ms ${spec.easing} both; }`,
        `@keyframes demo-morph {`,
        `  from { transform: translate3d(0, 0, 0) scale(.24); }`,
        `  to { transform: none; }`,
        `}`,
        `${open}`,
      ];
    case "micro":
      return [
        `${open}css`,
        `.demo-button { transition: transform ${spec.durationMs}ms ${spec.easing}; }`,
        `.demo-button:active { transform: scale(.96); }`,
        `${open}`,
      ];
    case "spring":
      return [
        `${open}css`,
        `.demo-card {`,
        `  animation: demo-spring ${spec.durationMs}ms ${spec.easing} both;`,
        `}`,
        `@keyframes demo-spring {`,
        `  0% { transform: translate3d(0, ${spec.distance * 2}px, 0); }`,
        `  70% { transform: translate3d(0, -2px, 0); }`,
        `  100% { transform: none; }`,
        `}`,
        `${open}`,
      ];
    case "parallax":
      return [
        `${open}css`,
        `.demo-layer[data-depth="1"] { animation: demo-drift ${spec.durationMs * 2}ms ${spec.easing} infinite alternate; }`,
        `.demo-layer[data-depth="2"] { animation-duration: ${spec.durationMs * 3}ms; }`,
        `.demo-layer[data-depth="3"] { animation-duration: ${spec.durationMs * 4}ms; }`,
        `@keyframes demo-drift { from { transform: translate3d(-${spec.distance}px, 0, 0); } to { transform: translate3d(${spec.distance}px, 0, 0); } }`,
        `${open}`,
      ];
    case "loading":
      return [
        `${open}css`,
        `.demo-dot { animation: demo-pulse ${spec.durationMs}ms ${spec.easing} infinite; }`,
        `.demo-dot:nth-child(2) { animation-delay: ${spec.staggerMs}ms; }`,
        `.demo-dot:nth-child(3) { animation-delay: ${spec.staggerMs * 2}ms; }`,
        `.demo-sweep { animation: demo-sweep ${spec.durationMs * 2}ms ${spec.easing} infinite; }`,
        `@keyframes demo-pulse { 0%, 100% { transform: scale(.7); opacity: .4; } 50% { transform: scale(1); opacity: 1; } }`,
        `@keyframes demo-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }`,
        `${open}`,
      ];
    case "easing":
      return [
        `${open}css`,
        `.demo-track[data-curve="linear"] { animation: demo-travel ${spec.durationMs}ms linear both; }`,
        `.demo-track[data-curve="bezier"] { animation: demo-travel ${spec.durationMs}ms ${spec.easing} both; }`,
        `@keyframes demo-travel { from { transform: translateX(0); } to { transform: translateX(var(--travel, 120px)); } }`,
        `${open}`,
      ];
    case "reduced":
      return [
        `${open}css`,
        `.demo-row { animation: demo-motion ${spec.durationMs}ms ${spec.easing} both; }`,
        `@media (prefers-reduced-motion: reduce) {`,
        `  .demo-row { animation: demo-fade 120ms linear both; }`,
        `}`,
        `@keyframes demo-fade { from { opacity: ${Math.max(0.2, spec.opacity)}; } to { opacity: 1; } }`,
        `${open}`,
      ];
  }
}

function feedbackPrompt(spec: FeedbackSpec): string[] {
  const rhythm = `触发 ${spec.triggerMs}ms → 停留 ${spec.holdMs}ms → 消退 ${spec.decayMs}ms，缓动 ${spec.easing}，语义色 ${FEEDBACK_TONE_LABELS[spec.tone]}。`;
  switch (spec.scene) {
    case "toast":
      return [
        `实现「${FEEDBACK_TONE_LABELS[spec.tone]}」Toast 的三段节奏：`,
        rhythm,
        "触发段承担状态切换，停留段保持可读，消退段淡出且不阻塞交互；同时遵循 prefers-reduced-motion。",
      ];
    case "validation":
      return [
        "实现表单「校验失败」反馈：",
        rhythm,
        "输入框描边转为错误语义色并轻微 shake，行内错误文案随字段出现，不弹全局提示。",
      ];
    case "submit":
      return [
        "实现提交按钮的三段状态：",
        rhythm,
        "按钮文案 → 加载点 → 对勾，宽度锁定避免跳动，成功后短暂停留再复位。",
      ];
    case "confirm":
      return [
        "实现「确认对话框」：",
        rhythm,
        "小对话框缩放淡入，底部倒计时条按停留时长 linear 缩短，取消 / 删除两个动作保持可见。",
      ];
    case "loading":
      return [
        "实现「加载中」占位：",
        rhythm,
        "环形旋转用于过程反馈，两行骨架维持布局稳定；加载结束后骨架淡出、内容淡入。",
      ];
    case "empty":
      return [
        "实现「空状态」：",
        rhythm,
        "空盒子图形 + 标题 + 单一 CTA，图形轻微浮动，CTA 有清晰焦点环。",
      ];
    case "error":
      return [
        "实现「错误重试」：",
        rhythm,
        "行内错误条滑入并给出重试按钮，错误色只用于图标与描边，正文保持可读。",
      ];
    case "states":
      return [
        "实现控件的四种交互状态：",
        rhythm,
        "默认 / 悬停 / 按下 / 禁用四个样品并排，状态之间只变表面、描边与透明度，不改尺寸与位置。",
      ];
  }
}

function feedbackSnippet(spec: FeedbackSpec): string[] {
  const open = "```";
  const total = spec.triggerMs + spec.holdMs + spec.decayMs;
  const enter = Math.max(160, spec.triggerMs + spec.decayMs);
  switch (spec.scene) {
    case "toast":
      return [
        `${open}css`,
        `.demo-toast { animation: demo-feedback ${total}ms ${spec.easing} both; }`,
        `@keyframes demo-feedback {`,
        `  0% { opacity: 0; transform: translate3d(0, 6px, 0); }`,
        `  ${Math.round((spec.triggerMs / total) * 100)}% { opacity: 1; transform: none; }`,
        `  ${Math.round(((spec.triggerMs + spec.holdMs) / total) * 100)}% { opacity: 1; transform: none; }`,
        `  100% { opacity: 0; transform: translate3d(0, -4px, 0); }`,
        `}`,
        `${open}`,
      ];
    case "validation":
      return [
        `${open}css`,
        `.demo-field { border-color: var(--status-danger); animation: demo-shake ${spec.decayMs}ms ${spec.easing}; }`,
        `.demo-error { color: var(--status-danger); }`,
        `@keyframes demo-shake {`,
        `  0%, 100% { transform: none; }`,
        `  25% { transform: translateX(-3px); }`,
        `  75% { transform: translateX(3px); }`,
        `}`,
        `${open}`,
      ];
    case "submit":
      return [
        `${open}css`,
        `.demo-submit[data-state="loading"] .demo-label { opacity: 0; }`,
        `.demo-submit[data-state="done"] .demo-check { transform: scale(1); }`,
        `.demo-check { transform: scale(0); transition: transform ${total}ms ${spec.easing}; }`,
        `${open}`,
      ];
    case "confirm":
      return [
        `${open}css`,
        `.demo-dialog { animation: demo-dialog ${enter}ms ${spec.easing} both; }`,
        `.demo-countdown {`,
        `  transform-origin: left center;`,
        `  animation: demo-countdown ${spec.holdMs}ms linear both;`,
        `}`,
        `@keyframes demo-countdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }`,
        `${open}`,
      ];
    case "loading":
      return [
        `${open}css`,
        `.demo-ring { animation: demo-spin ${total * 2}ms linear infinite; }`,
        `.demo-skeleton { animation: demo-sheen ${total * 2}ms ${spec.easing} infinite; }`,
        `@keyframes demo-spin { to { transform: rotate(360deg); } }`,
        `@keyframes demo-sheen { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }`,
        `${open}`,
      ];
    case "empty":
      return [
        `${open}css`,
        `.demo-empty-figure { animation: demo-float ${total * 2}ms ${spec.easing} infinite alternate; }`,
        `@keyframes demo-float { from { transform: translate3d(0, -3px, 0); } to { transform: translate3d(0, 3px, 0); } }`,
        `${open}`,
      ];
    case "error":
      return [
        `${open}css`,
        `.demo-errorbar { animation: demo-slide ${enter}ms ${spec.easing} both; }`,
        `@keyframes demo-slide { from { opacity: 0; transform: translate3d(0, -6px, 0); } to { opacity: 1; transform: none; } }`,
        `${open}`,
      ];
    case "states":
      return [
        `${open}css`,
        `.demo-state { transition: background-color ${spec.decayMs}ms ${spec.easing}, border-color ${spec.decayMs}ms ${spec.easing}; }`,
        `.demo-state[data-state="hover"] { background: var(--surface-raised); }`,
        `.demo-state[data-state="pressed"] { transform: scale(.98); }`,
        `.demo-state[data-state="disabled"] { opacity: .45; pointer-events: none; }`,
        `${open}`,
      ];
  }
}

function componentPrompt(spec: ComponentSpec): string[] {
  const head = `状态切换时长 ${spec.durationMs}ms，缓动 ${spec.easing}。`;
  const foot = "保留键盘可达性（Enter / Space）、可见焦点环与 aria 状态，不写死颜色，沿用语义 Token。";
  switch (spec.control) {
    case "switch":
      return ["实现一个可交互的开关：", head, "滑块用 transform 位移，轨道只换背景色，不使用位移动画之外的布局变化。", foot];
    case "button":
      return ["实现一个可交互按钮：", head, "按压 scale 轻微收缩，松开回位，禁用态降低不透明度但仍保留对比度。", foot];
    case "input":
      return ["实现一个可交互输入框：", head, "聚焦时描边与光晕过渡，光标闪烁仅作视觉提示，不抢输入焦点。", foot];
    case "segmented":
      return ["实现一个分段控件：", head, "三段等宽，指示器用 transform 平移，切换不改变容器尺寸。", foot];
    case "checkbox":
      return ["实现一个复选框：", head, "勾选路径用 scale 弹出，命中区域至少 32px 且带 aria-checked。", foot];
    case "radio":
      return ["实现一组单选框：", head, "三选一，圆点用 scale 出现，键盘方向键可切换。", foot];
    case "slider":
      return ["实现一个滑杆：", head, "pointer 拖拽更新 0–100 的值，填充条用 transform: scaleX，避免逐帧重排。", foot];
    case "tabs":
      return ["实现一个标签页：", head, "指示器在标签间位移，激活标签提升字重但不改变行高。", foot];
    case "progress":
      return ["实现一个进度条：", head, "进度用 transform: scaleX 表达，确定进度不循环、不来回抖动。", foot];
    case "skeleton":
      return ["实现一个骨架屏：", head, "用 CSS shimmer 表达加载，prefers-reduced-motion 下降级为静态占位。", foot];
    case "badge":
      return ["实现一个带数字的徽标按钮：", head, "数字变化时做一次 scale 弹跳，超过 99 显示 99+。", foot];
    case "nav":
      return ["实现一套导航骨架（顶部导航 / 侧栏 / 面包屑共用）：", head, "当前项用表面色与字重标记，其余项保持同尺寸；折叠与展开只切换宽度变量，不移动内容。", foot];
    case "menu":
      return ["实现浮层菜单（下拉 / 命令面板 / 气泡共用）：", head, "浮层贴着锚点展开，带 4px 偏移与轻微缩放；Esc 关闭、关闭后焦点回到锚点。", foot];
    case "modal":
      return ["实现模态层（对话框 / 底部抽屉共用）：", head, "遮罩淡入、面板缩放上浮；打开时锁定滚动并把焦点移入面板，关闭后恢复原焦点。", foot];
    case "toast":
      return ["实现轻提示（Toast / 通知条共用）：", head, "多条提示纵向堆叠，进入与退出只用位移与透明度；不抢焦点，可手动关闭。", foot];
    case "card":
      return ["实现卡片容器：", head, "标题、正文、操作槽三段式；卡间距统一，悬停只提亮描边，不做位移。", foot];
    case "list":
      return ["实现列表与表格行：", head, "行高与分隔线统一，悬停整行提亮；表头保持位置固定，行内操作在悬停时出现。", foot];
    case "empty":
      return ["实现空状态：", head, "图形、标题、说明与单一主行动纵向居中；图形轻微呼吸，主行动保持焦点环。", foot];
  }
}

function componentSnippet(spec: ComponentSpec): string[] {
  const open = "```";
  const base = [
    `${open}css`,
    `.demo-control { transition: all ${spec.durationMs}ms ${spec.easing}; }`,
    `.demo-control:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`,
    `${open}`,
  ];
  switch (spec.control) {
    case "switch":
      return [
        `${open}css`,
        `.demo-switch[aria-checked="true"] .demo-knob { transform: translateX(16px); }`,
        `.demo-knob { transition: transform ${spec.durationMs}ms ${spec.easing}; }`,
        `${open}`,
      ];
    case "button":
      return [`${open}css`, `.demo-button:active { transform: scale(.96); }`, `.demo-button { transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `${open}`];
    case "input":
      return [`${open}css`, `.demo-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }`, `/* 过渡 ${spec.durationMs}ms ${spec.easing} */`, `${open}`];
    case "segmented":
      return [`${open}css`, `.demo-seg-indicator { transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `/* 指示器位移 = 段宽 × 索引 */`, `${open}`];
    case "checkbox":
      return [`${open}css`, `.demo-checkbox[aria-checked="true"] .demo-check { transform: scale(1); }`, `.demo-check { transform: scale(0); transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `${open}`];
    case "radio":
      return [`${open}css`, `.demo-radio[aria-checked="true"] .demo-dot { transform: scale(1); }`, `.demo-dot { transform: scale(0); transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `${open}`];
    case "slider":
      return [`${open}css`, `.demo-fill { transform-origin: left center; transform: scaleX(var(--value, .4)); transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `${open}`];
    case "tabs":
      return [`${open}css`, `.demo-tab-indicator { transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `/* 指示器位移 = 标签宽 × 索引 */`, `${open}`];
    case "progress":
      return [`${open}css`, `.demo-progress { transform-origin: left center; transform: scaleX(var(--progress, .6)); transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `${open}`];
    case "skeleton":
      return [
        `${open}css`,
        `.demo-skeleton { background: linear-gradient(90deg, var(--surface) 0%, var(--surface-raised) 50%, var(--surface) 100%); background-size: 200% 100%; animation: demo-shimmer 1400ms linear infinite; }`,
        `@media (prefers-reduced-motion: reduce) { .demo-skeleton { animation: none; } }`,
        `${open}`,
      ];
    case "badge":
      return [`${open}css`, `.demo-badge { transition: transform ${spec.durationMs}ms ${spec.easing}; }`, `.demo-badge[data-bump="true"] { transform: scale(1.15); }`, `${open}`];
    case "nav":
      return [
        `${open}css`,
        `.demo-nav-item[aria-current="page"] { background: var(--surface-raised); font-weight: 600; }`,
        `.demo-nav { transition: width ${spec.durationMs}ms ${spec.easing}; }`,
        `${open}`,
      ];
    case "menu":
      return [
        `${open}css`,
        `.demo-menu { transform-origin: top left; animation: demo-pop ${spec.durationMs}ms ${spec.easing} both; }`,
        `@keyframes demo-pop { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: none; } }`,
        `${open}`,
      ];
    case "modal":
      return [
        `${open}css`,
        `.demo-scrim { animation: demo-fade ${spec.durationMs}ms ${spec.easing} both; }`,
        `.demo-modal { animation: demo-rise ${spec.durationMs}ms ${spec.easing} both; }`,
        `@keyframes demo-rise { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }`,
        `${open}`,
      ];
    case "toast":
      return [
        `${open}css`,
        `.demo-toast { animation: demo-toast-in ${spec.durationMs}ms ${spec.easing} both; }`,
        `@keyframes demo-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`,
        `@media (prefers-reduced-motion: reduce) { .demo-toast { animation: none; } }`,
        `${open}`,
      ];
    case "card":
      return [
        `${open}css`,
        `.demo-card { border: 1px solid var(--border); border-radius: 12px; background: var(--surface-raised); }`,
        `.demo-card:hover { border-color: var(--accent); transition: border-color ${spec.durationMs}ms ${spec.easing}; }`,
        `${open}`,
      ];
    case "list":
      return [
        `${open}css`,
        `.demo-row:hover { background: var(--surface-raised); transition: background-color ${spec.durationMs}ms ${spec.easing}; }`,
        `.demo-row { border-bottom: 1px solid var(--border); }`,
        `${open}`,
      ];
    case "empty":
      return [
        `${open}css`,
        `.demo-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; }`,
        `.demo-empty-cta { transition: transform ${spec.durationMs}ms ${spec.easing}; }`,
        `${open}`,
      ];
    default:
      return base;
  }
}

function themePrompt(spec: ThemeSpec): string[] {
  const base = [`单次过渡 ${spec.durationMs}ms，停留 ${spec.holdMs}ms，缓动 ${spec.easing}。`];
  switch (spec.scene) {
    case "crossfade":
      return [
        "实现深色与浅色两套主题的交叉淡入切换：",
        ...base,
        "两套主题共用同一份语义 Token 结构，只换值；切换过程不产生布局位移。",
      ];
    case "light":
      return [
        "实现浅色主题的三档层级：",
        ...base,
        "背景 / 面板 / 抬升表面用 8% 左右的明度差分层，描边保持低对比，内容用一次淡入进入。",
      ];
    case "dark":
      return [
        "实现深色主题的三档层级：",
        ...base,
        "近黑背景上靠表面提亮与 1px 半透明描边分层，避免纯黑纯白造成眩光。",
      ];
    case "system":
      return [
        "实现跟随系统的主题：",
        ...base,
        "用 prefers-color-scheme 切换两套样品窗口，日 / 月指示器同步高亮，不写死当前主题。",
      ];
    case "brand":
      return [
        "实现品牌色板：",
        ...base,
        "主色、辅助色、强调色三个色块并列，示例按钮只使用主色与 on-color，保证对比度。",
      ];
    case "accent":
      return [
        "实现强调色阶：",
        ...base,
        "用 color-mix 从单一强调色推导 10 级明度阶梯，并给出 on-color 对比示例。",
      ];
    case "override":
      return [
        "实现局部主题覆盖：",
        ...base,
        "外层保持全局主题，内层用局部变量覆盖表面与文字色，未覆盖项回退到外层（箭头示意）。",
      ];
  }
}

function themeSnippet(spec: ThemeSpec): string[] {
  const open = "```";
  switch (spec.scene) {
    case "crossfade":
      return [
        `${open}css`,
        `.demo-theme { transition: background-color ${spec.durationMs}ms ${spec.easing}, color ${spec.durationMs}ms ${spec.easing}; }`,
        `/* 高亮帧停留 ${spec.holdMs}ms 后再切回，避免闪动 */`,
        `${open}`,
      ];
    case "light":
    case "dark":
      return [
        `${open}css`,
        `:root[data-theme="${spec.scene}"] {`,
        `  --surface-1: color-mix(in srgb, var(--bg) 96%, var(--text-primary));`,
        `  --surface-2: color-mix(in srgb, var(--bg) 92%, var(--text-primary));`,
        `  --surface-3: color-mix(in srgb, var(--bg) 88%, var(--text-primary));`,
        `  transition: background-color ${spec.durationMs}ms ${spec.easing};`,
        `}`,
        `${open}`,
      ];
    case "system":
      return [`${open}css`, `@media (prefers-color-scheme: dark) { :root { color-scheme: dark; } }`, `/* 两个样品窗口共用同一组 Token，仅切换值 */`, `${open}`];
    case "brand":
      return [`${open}css`, `:root { --brand: var(--accent); --brand-on: var(--accent-ink); }`, `.demo-brand-button { background: var(--brand); color: var(--brand-on); }`, `${open}`];
    case "accent":
      return [
        `${open}css`,
        `.demo-scale > * { background: color-mix(in srgb, var(--accent) calc(var(--step) * 10%), var(--surface)); }`,
        `.demo-on-accent { background: var(--accent); color: var(--accent-ink); }`,
        `${open}`,
      ];
    case "override":
      return [
        `${open}css`,
        `.demo-scope {`,
        `  --surface: color-mix(in srgb, var(--accent) 18%, var(--bg));`,
        `  --text-primary: var(--accent);`,
        `  transition: background-color ${spec.durationMs}ms ${spec.easing};`,
        `}`,
        `${open}`,
      ];
  }
}

function stylePrompt(spec: StyleSpec): string[] {
  const base = [`圆角 ${spec.radiusPx}px，深度 ${spec.depth}，过渡 ${spec.durationMs}ms，缓动 ${spec.easing}。`];
  switch (spec.treatment) {
    case "flat":
      return [`实现「扁平」面板：`, ...base, "去掉投影与高光，只保留 1px 描边与表面色差，层级靠间距表达。"];
    case "neumorphic":
      return [`实现「新拟态」镶嵌面板：`, ...base, "用内阴影 + 半透明描边做镶嵌感，不做凸起、不做霓虹发光；颜色全部走语义 Token。"];
    case "glass":
      return [`实现「玻璃」面板：`, ...base, "半透明表面 + backdrop-filter 模糊，描边略亮于背景，保持内容可读。"];
    case "clay":
      return [`实现「黏土」质感：`, ...base, "粉彩表面、胖圆角，内外双阴影制造柔软厚度，避免高对比硬边。"];
    case "brutalism":
      return [`实现「粗野」风格：`, ...base, "系统字体、0 圆角、2px 实边与错位硬阴影，信息优先于精致。"];
    case "neobrutalism":
      return [`实现「新粗野」风格：`, ...base, "2px 实边 + 4–8px 硬偏移阴影 + 高饱和 accent 块，hover 时阴影收缩模拟按下。"];
    case "editorial":
      return [`实现「编辑排版」风格：`, ...base, "大标题使用衬线感字体，双栏细线分隔，引文块加左侧竖线，强调节奏与留白。"];
    case "bento":
      return [`实现「便当格」拼贴：`, ...base, "CSS grid 四格不等尺寸，间距一致，每格独立表面与圆角。"];
    case "card":
      return [`实现「卡片流」：`, ...base, "多张独立卡片 + 统一卡间距，卡片之间靠表面色与描边区分，不叠加多余阴影。"];
  }
}

function styleSnippet(spec: StyleSpec): string[] {
  const open = "```";
  switch (spec.treatment) {
    case "flat":
      return [`${open}css`, `.demo-panel { border-radius: ${spec.radiusPx}px; border: 1px solid var(--border); background: var(--surface-raised); box-shadow: none; }`, `${open}`];
    case "neumorphic":
      return [
        `${open}css`,
        `.demo-panel {`,
        `  border-radius: ${spec.radiusPx}px;`,
        `  border: 1px solid rgb(255 255 255 / 0.06);`,
        `  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04), inset 0 -1px 0 rgb(0 0 0 / 0.4);`,
        `  transition: box-shadow ${spec.durationMs}ms ${spec.easing};`,
        `}`,
        `${open}`,
      ];
    case "glass":
      return [`${open}css`, `.demo-panel { border-radius: ${spec.radiusPx}px; background: color-mix(in srgb, var(--surface-raised) 62%, transparent); backdrop-filter: blur(8px); border: 1px solid rgb(255 255 255 / 0.14); }`, `${open}`];
    case "clay":
      return [
        `${open}css`,
        `.demo-panel {`,
        `  border-radius: ${Math.max(18, spec.radiusPx)}px;`,
        `  background: color-mix(in srgb, var(--accent) 16%, var(--surface-raised));`,
        `  box-shadow: 0 ${Math.round(spec.depth * 0.6)}px ${spec.depth * 2}px color-mix(in srgb, var(--accent) 24%, transparent), inset 0 -2px 0 rgb(0 0 0 / .08);`,
        `}`,
        `${open}`,
      ];
    case "brutalism":
      return [`${open}css`, `.demo-panel { border-radius: 0; border: 2px solid var(--text-primary); font-family: system-ui, sans-serif; box-shadow: ${spec.depth}px ${spec.depth}px 0 var(--text-primary); }`, `${open}`];
    case "neobrutalism":
      return [`${open}css`, `.demo-panel { border-radius: ${spec.radiusPx}px; border: 2px solid var(--text-primary); box-shadow: ${Math.max(4, Math.round(spec.depth / 2))}px ${Math.max(4, Math.round(spec.depth / 2))}px 0 var(--text-primary); background: var(--accent-soft); }`, `${open}`];
    case "editorial":
      return [`${open}css`, `.demo-headline { font-family: Georgia, "Times New Roman", serif; font-size: 24px; line-height: 1.15; }`, `.demo-columns { columns: 2; column-gap: 16px; column-rule: 1px solid var(--border); }`, `${open}`];
    case "bento":
      return [`${open}css`, `.demo-bento { display: grid; grid-template-columns: 1.4fr 1fr; grid-template-rows: 1.2fr .8fr; gap: 8px; }`, `.demo-bento > * { border-radius: ${spec.radiusPx}px; background: var(--surface-raised); }`, `${open}`];
    case "card":
      return [`${open}css`, `.demo-cards { display: flex; flex-direction: column; gap: 8px; }`, `.demo-card { border-radius: ${spec.radiusPx}px; background: var(--surface-raised); border: 1px solid var(--border); }`, `${open}`];
  }
}

export function buildPreviewPrompt(spec: PreviewSpec): string {
  switch (spec.kind) {
    case "motion":
      return motionPrompt(spec).join("\n");
    case "feedback":
      return feedbackPrompt(spec).join("\n");
    case "component":
      return componentPrompt(spec).join("\n");
    case "theme":
      return themePrompt(spec).join("\n");
    case "style":
      return stylePrompt(spec).join("\n");
  }
}

export function buildPreviewSnippet(spec: PreviewSpec): string {
  switch (spec.kind) {
    case "motion":
      return motionSnippet(spec).join("\n");
    case "feedback":
      return feedbackSnippet(spec).join("\n");
    case "component":
      return componentSnippet(spec).join("\n");
    case "theme":
      return themeSnippet(spec).join("\n");
    case "style":
      return styleSnippet(spec).join("\n");
  }
}

/* ---------------------------- 内容包附加字段 ---------------------------- */

export type ParamSourceLevel = "verified" | "estimated" | "user_defined" | "unknown";

export const PARAM_SOURCE_LEVELS = [
  "verified",
  "estimated",
  "user_defined",
  "unknown",
] as const;

export const PARAM_SOURCE_LABELS: Record<ParamSourceLevel, string> = {
  verified: "已验证",
  estimated: "推测",
  user_defined: "自定义",
  unknown: "未知",
};

export const PARAM_KEY_LABELS: Record<string, string> = {
  scene: "场景",
  control: "控件",
  treatment: "形态",
  durationMs: "时长",
  delayMs: "延迟",
  staggerMs: "错峰",
  easing: "缓动",
  distance: "位移",
  scale: "缩放",
  opacity: "透明度",
  blur: "模糊",
  triggerMs: "触发",
  holdMs: "停留",
  decayMs: "衰减",
  tone: "语气",
  radiusPx: "圆角",
  depth: "深度",
};

/** 读取 payload 根对象的 paramSources；无有效项返回 null。 */
export function parseParamSources(payloadJson: string): Record<string, ParamSourceLevel> | null {
  return parseParamEvidence(payloadJson)?.sources ?? null;
}

export interface SpecRef {
  platform: string;
  version: string;
  component: string;
  url: string;
  quote: string;
}

export interface SpecBinding {
  bound: boolean;
  platform?: string;
  version?: string;
  docUrl?: string;
  note?: string;
}

export interface ParamEvidence {
  sources: Record<string, ParamSourceLevel>;
  refs: Record<string, SpecRef>;
  alts: Record<string, SpecRef[]>;
  binding: SpecBinding | null;
}

function textField(record: Record<string, unknown>, key: string, max: number): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function readSpecRef(value: unknown): SpecRef | null {
  if (!isRecord(value)) return null;
  const platform = textField(value, "platform", 80);
  const version = textField(value, "version", 80);
  const component = textField(value, "component", 160);
  const url = textField(value, "url", 600);
  const quote = textField(value, "quote", 2000);
  if (!platform || !version || !component || !url || !quote) return null;
  if (!url.startsWith("https://")) return null;
  return { platform, version, component, url, quote };
}

function numberTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) {
    tokens.push(match[0]);
  }
  return tokens;
}

function containsNumber(quote: string, token: string): boolean {
  let start = 0;
  while (true) {
    const index = quote.indexOf(token, start);
    if (index < 0) return false;
    const before = quote[index - 1];
    const after = quote[index + token.length];
    const boundary = (ch: string | undefined) => ch === undefined || !/[\d.]/.test(ch);
    if (boundary(before) && boundary(after)) return true;
    start = index + token.length;
  }
}

function bezierValues(text: string): number[] | null {
  const match = text.match(/cubic-bezier\(([^)]*)\)/);
  if (!match) return null;
  const values = match[1]
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length === 4 ? values : null;
}

/** 与 Rust 侧同口径：quote 必须和参数值一一对应。 */
function quoteMatches(actual: unknown, ref: SpecRef): boolean {
  const compact = (text: string) => text.replace(/\s+/g, "");
  if (typeof actual === "number") {
    return containsNumber(ref.quote, String(actual));
  }
  if (typeof actual !== "string") return false;
  const value = actual.trim();
  if (value.startsWith("cubic-bezier")) {
    const expected = bezierValues(value);
    const quoted = bezierValues(ref.quote);
    return Boolean(
      expected && quoted && expected.every((number, index) => number === quoted[index]),
    );
  }
  const tokens = numberTokens(value);
  if (tokens.length === 0) return compact(ref.quote).includes(compact(value));
  return tokens.every((token) => containsNumber(ref.quote, token));
}

/**
 * 解析并归一化参数证据：verified 必须有合法 specRef 且 quote 与值对应，
 * 否则一律降为 estimated；无 specRef 的参数最高也是 estimated。
 */
export function parseParamEvidence(payloadJson: string): ParamEvidence | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const refs: Record<string, SpecRef> = {};
  if (isRecord(parsed.paramRefs)) {
    for (const [key, value] of Object.entries(parsed.paramRefs)) {
      const ref = readSpecRef(value);
      if (ref) refs[key] = ref;
    }
  }

  const alts: Record<string, SpecRef[]> = {};
  if (isRecord(parsed.paramRefAlts)) {
    for (const [key, value] of Object.entries(parsed.paramRefAlts)) {
      if (!Array.isArray(value)) continue;
      const list = value.map(readSpecRef).filter((ref): ref is SpecRef => ref !== null);
      if (list.length > 0) alts[key] = list;
    }
  }

  let binding: SpecBinding | null = null;
  if (isRecord(parsed.specBinding)) {
    const bound = parsed.specBinding.bound === true;
    const platform = textField(parsed.specBinding, "platform", 80) ?? undefined;
    const version = textField(parsed.specBinding, "version", 80) ?? undefined;
    const docUrl = textField(parsed.specBinding, "docUrl", 600) ?? undefined;
    const note = textField(parsed.specBinding, "note", 160) ?? undefined;
    binding =
      bound && platform && version
        ? { bound: true, platform, version, docUrl }
        : { bound: false, note: note ?? "非平台绑定" };
  }

  const sources: Record<string, ParamSourceLevel> = {};
  if (isRecord(parsed.paramSources)) {
    const preview = isRecord(parsed.preview) ? parsed.preview : {};
    for (const [key, value] of Object.entries(parsed.paramSources)) {
      if (typeof value !== "string" || !(PARAM_SOURCE_LEVELS as readonly string[]).includes(value)) {
        continue;
      }
      let level = value as ParamSourceLevel;
      if (level === "verified") {
        const ref = refs[key];
        if (!ref || !(key in preview) || !quoteMatches(preview[key], ref)) {
          level = "estimated";
        }
      }
      sources[key] = level;
    }
  }

  if (Object.keys(sources).length === 0 && Object.keys(refs).length === 0 && !binding) {
    return null;
  }
  return { sources, refs, alts, binding };
}

/** 读取内容包条目自带的提示词；没有则返回 null（调用方回退到生成提示词）。 */
export function parseCasePrompt(payloadJson: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.prompt !== "string") return null;
  const prompt = parsed.prompt.trim();
  if (!prompt || prompt.length > 8000) return null;
  return prompt;
}
