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
  /** true 表示该域在 Phase 1 只有占位内容，界面标注「未接入」 */
  unavailable?: boolean;
  groups: NavCategoryGroup[];
  footnote: string;
}

export const NAV_SECTIONS: Record<NavSectionKey, NavSection> = {
  style: {
    key: "style",
    label: "风格",
    route: "/style",
    kind: "style",
    groups: [
      {
        label: "形态与质感",
        categories: [
          { id: "style.neu", label: "新拟态" },
          { id: "style.glass", label: "玻璃拟态" },
          { id: "style.flat", label: "扁平" },
          { id: "style.skeuo", label: "拟物" },
        ],
      },
      {
        label: "组织方式",
        categories: [
          { id: "style.minimal", label: "极简" },
          { id: "style.bento", label: "Bento" },
          { id: "style.editorial", label: "编辑式" },
          { id: "style.dark", label: "Dark UI" },
        ],
      },
    ],
    footnote: "子类计数将在 Phase 2 随分类字段接入；当前为 0。",
  },
  motion: {
    key: "motion",
    label: "动效",
    route: "/motion",
    kind: "motion",
    groups: [
      {
        label: "转场",
        categories: [
          { id: "motion.page", label: "页面转场" },
          { id: "motion.overlay", label: "浮层转场" },
          { id: "motion.view", label: "视图切换" },
        ],
      },
      {
        label: "交互",
        categories: [
          { id: "motion.micro", label: "微交互" },
          { id: "motion.list", label: "列表与卡片" },
          { id: "motion.scroll", label: "滚动联动" },
        ],
      },
    ],
    footnote: "子类计数将在 Phase 2 随分类字段接入；当前为 0。",
  },
  feedback: {
    key: "feedback",
    label: "反馈与状态",
    route: "/feedback",
    kind: "feedback",
    groups: [
      {
        label: "状态反馈",
        categories: [
          { id: "feedback.success", label: "成功" },
          { id: "feedback.error", label: "错误" },
          { id: "feedback.warning", label: "警告" },
          { id: "feedback.info", label: "信息" },
        ],
      },
      {
        label: "反馈组件",
        categories: [
          { id: "feedback.toast", label: "Toast / Snackbar" },
          { id: "feedback.loading", label: "加载与骨架" },
          { id: "feedback.empty", label: "空状态与错误页" },
          { id: "feedback.validation", label: "表单校验" },
        ],
      },
    ],
    footnote: "子类计数将在 Phase 2 随分类字段接入；当前为 0。",
  },
  component: {
    key: "component",
    label: "组件",
    route: "/component",
    kind: "component",
    groups: [
      {
        label: "基础控件 atoms",
        categories: [
          { id: "component.button", label: "Button" },
          { id: "component.input", label: "Input / Select" },
          { id: "component.switch", label: "Switch / Checkbox" },
          { id: "component.card", label: "Card" },
        ],
      },
      {
        label: "复合模式 patterns",
        categories: [
          { id: "component.nav", label: "导航结构" },
          { id: "component.command", label: "命令面板" },
          { id: "component.settings-row", label: "设置项行" },
          { id: "component.notice", label: "顶部胶囊通知" },
        ],
      },
    ],
    footnote: "atoms / patterns 的筛选将在 Phase 2 接入；当前为 0。",
  },
  theme: {
    key: "theme",
    label: "主题",
    route: "/theme",
    kind: "theme",
    groups: [
      {
        label: "结构与映射",
        categories: [
          { id: "theme.tokens", label: "Token 两层" },
          { id: "theme.parity", label: "双主题对等" },
          { id: "theme.swap", label: "换肤策略" },
        ],
      },
      {
        label: "案例",
        categories: [
          { id: "theme.snapshot", label: "深浅对照" },
          { id: "theme.system", label: "系统跟随" },
        ],
      },
    ],
    footnote: "theme 作为独立 kind 尚待最终确认；分类计数当前为 0。",
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

export function findCategoryLabel(
  sectionKey: NavSectionKey,
  categoryId: string | null,
): string | null {
  if (!categoryId) return null;
  for (const group of NAV_SECTIONS[sectionKey].groups) {
    const match = group.categories.find((category) => category.id === categoryId);
    if (match) return match.label;
  }
  return null;
}
