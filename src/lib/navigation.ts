import type { CaseKind } from "@/lib/constants";

export type NavSectionKey =
  | "style"
  | "motion"
  | "feedback"
  | "component"
  | "theme"
  | "workspace"
  | "discovery"
  | "settings";

export interface NavCategory {
  id: string;
  label: string;
}

export interface NavCategoryGroup {
  label: string;
  categories: NavCategory[];
}

export interface NavSection {
  key: NavSectionKey;
  label: string;
  route: string;
  kind?: CaseKind;
  /** true 表示该域只有占位内容，界面标注「未接入」 */
  unavailable?: boolean;
  /** 内容域的类目已落库（catalog_list），这里只给工具位保留占位分组 */
  groups?: NavCategoryGroup[];
  footnote: string;
}

export const NAV_SECTIONS: Record<NavSectionKey, NavSection> = {
  style: {
    key: "style",
    label: "风格",
    route: "/style",
    kind: "style",
    footnote: "类目与计数来自本地 categories 表；选择类目后中栏只显示该类目条目。",
  },
  motion: {
    key: "motion",
    label: "动效",
    route: "/motion",
    kind: "motion",
    footnote: "动效类目按「转场 / 交互」分组，计数为软删除之外的真实条数。",
  },
  feedback: {
    key: "feedback",
    label: "反馈与状态",
    route: "/feedback",
    kind: "feedback",
    footnote: "反馈类目覆盖状态反馈与反馈组件，含按压反馈示例。",
  },
  component: {
    key: "component",
    label: "组件",
    route: "/component",
    kind: "component",
    footnote: "atoms / patterns 两组均来自本地类目表，计数实时统计。",
  },
  theme: {
    key: "theme",
    label: "主题",
    route: "/theme",
    kind: "theme",
    footnote: "主题类目分「结构与映射」与「案例」两组。",
  },
  workspace: {
    key: "workspace",
    label: "AI 工作台",
    route: "/workspace",
    unavailable: true,
    groups: [
      {
        label: "分析与生成",
        categories: [
          { id: "workspace.analyze", label: "素材分析" },
          { id: "workspace.structure", label: "结构化输出" },
          { id: "workspace.prompt", label: "提示词生成" },
        ],
      },
      {
        label: "组合",
        categories: [{ id: "workspace.compose", label: "设计组合" }],
      },
    ],
    footnote: "Phase 1 未接入 AI Provider；此处只展示规划与禁用动作。",
  },
  discovery: {
    key: "discovery",
    label: "AI 发现",
    route: "/discovery",
    unavailable: true,
    groups: [
      {
        label: "检索与采集",
        categories: [
          { id: "discovery.search", label: "自然语言搜索" },
          { id: "discovery.crawl", label: "网页抓取" },
          { id: "discovery.identify", label: "案例识别" },
        ],
      },
      {
        label: "审核",
        categories: [
          { id: "discovery.dedupe", label: "跨域去重" },
          { id: "discovery.review", label: "待审核队列" },
        ],
      },
    ],
    footnote: "采集与审核流程将在 Phase 5 接入；当前只做导航占位。",
  },
  settings: {
    key: "settings",
    label: "设置",
    route: "/settings",
    groups: [
      {
        label: "偏好",
        categories: [
          { id: "settings.appearance", label: "外观与主题" },
          { id: "settings.motion", label: "动效偏好" },
        ],
      },
      {
        label: "数据",
        categories: [
          { id: "settings.storage", label: "存储与数据库" },
          { id: "settings.backup", label: "备份导出" },
        ],
      },
      {
        label: "关于",
        categories: [{ id: "settings.about", label: "版本与阶段" }],
      },
    ],
    footnote: "备份导出与更新检查尚未实现，对应入口已禁用并标注原因。",
  },
};

export const CONTENT_SECTION_KEYS: NavSectionKey[] = [
  "style",
  "motion",
  "feedback",
  "component",
  "theme",
];

export const TOOL_SECTION_KEYS: NavSectionKey[] = ["workspace", "discovery", "settings"];
