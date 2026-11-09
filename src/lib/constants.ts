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

export const PLATFORM_LABELS: Record<string, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
  desktop: "桌面",
};

export const PLATFORM_OPTIONS = [
  { value: "web", label: "Web" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "desktop", label: "桌面" },
] as const;

export const COMPONENT_LAYER_LABELS: Record<string, string> = {
  atom: "原子控件",
  pattern: "复合模式",
  template: "页面模板",
};

export const COMPONENT_LAYER_OPTIONS = [
  { value: "atom", label: "原子控件" },
  { value: "pattern", label: "复合模式" },
  { value: "template", label: "页面模板" },
] as const;

export const SORT_OPTIONS = [
  { value: "updated", label: "最近更新" },
  { value: "created", label: "最近创建" },
  { value: "title", label: "标题 A→Z" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];
export type SearchScope = "local" | "online";
export type ListView = "grid" | "table";

/** 最近使用视图的时间窗（后端 SQL 同步使用 30 天） */
export const RECENT_WINDOW_DAYS = 30;

export interface CaseFilters {
  kind: string;
  platform: string;
  confidence: string;
  layer: string;
  sort: SortKey;
  search: string;
  scope: SearchScope;
}

export const DEFAULT_FILTERS: CaseFilters = {
  kind: "all",
  platform: "all",
  confidence: "all",
  layer: "all",
  sort: "updated",
  search: "",
  scope: "local",
};


export const SETTINGS_KEYS = {
  themeMode: "ui.themeMode",
  reduceMotion: "ui.reduceMotion",
  leftWidth: "ui.panel.leftWidth",
  middleWidth: "ui.panel.middleWidth",
  note: "lab.note",
  aiDraft: "lab.ai.draft",
  discoveryQuery: "lab.discovery.query",
  contentFeedUrl: "content.feedUrl",
  contentTrustedKeys: "content.trustedKeys",
} as const;

export const PANEL_LIMITS = {
  left: { min: 208, max: 320 },
  middle: { min: 320, max: 600 },
} as const;

export const DEFAULT_LAYOUT = {
  leftWidth: 236,
  middleWidth: 400,
} as const;
