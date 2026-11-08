export type CaseKind = "style" | "motion" | "feedback" | "component" | "theme";

export const CASE_KINDS: CaseKind[] = [
  "style",
  "motion",
  "feedback",
  "component",
  "theme",
];

export const CASE_KIND_LABELS: Record<CaseKind, string> = {
  style: "风格",
  motion: "动效",
  feedback: "反馈",
  component: "组件",
  theme: "主题",
};

export const CASE_KIND_DESCRIPTIONS: Record<CaseKind, string> = {
  style: "整套界面整体像什么",
  motion: "状态之间怎么过渡",
  feedback: "什么触发了什么回应",
  component: "长什么样，出现在哪儿",
  theme: "同一套界面怎么换皮",
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  verified: "已验证",
  estimated: "推测",
  user_defined: "用户定义",
  unknown: "未知",
};

export const CONFIDENCE_OPTIONS = [
  { value: "unknown", label: "未知" },
  { value: "estimated", label: "推测" },
  { value: "user_defined", label: "用户定义" },
] as const;

export const SETTINGS_KEYS = {
  themeMode: "ui.themeMode",
  reduceMotion: "ui.reduceMotion",
  leftWidth: "ui.panel.leftWidth",
  middleWidth: "ui.panel.middleWidth",
  note: "lab.note",
  aiDraft: "lab.ai.draft",
  discoveryQuery: "lab.discovery.query",
} as const;

export const PANEL_LIMITS = {
  left: { min: 196, max: 320 },
  middle: { min: 300, max: 560 },
} as const;

export const DEFAULT_LAYOUT = {
  leftWidth: 228,
  middleWidth: 384,
} as const;
