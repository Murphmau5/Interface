/**
 * 快捷键的唯一说明来源：设置页的只读表与全局监听都从这里取口径。
 * 这里只描述界面语义，不负责绑定按键。
 */
export interface ShortcutEntry {
  keys: string[];
  label: string;
  scope: string;
  note?: string;
}

export const SHORTCUT_ENTRIES: ShortcutEntry[] = [
  {
    keys: ["Ctrl", "K"],
    label: "打开 / 关闭命令面板",
    scope: "全局",
    note: "搜案例、切类目、切视图、切主题、跳设置；打开时吞掉其余按键",
  },
  {
    keys: ["Ctrl", "F"],
    label: "聚焦当前页搜索框",
    scope: "全局",
    note: "案例页聚焦中栏搜索；设置页聚焦设置搜索",
  },
  {
    keys: ["/"],
    label: "聚焦搜索框",
    scope: "非输入态",
    note: "焦点在输入框、下拉或可编辑区域时不抢键",
  },
  {
    keys: ["Ctrl", "N"],
    label: "新建案例",
    scope: "全局",
    note: "内容域内就地展开新建表单；其他页面先落到对应内容域",
  },
  {
    keys: ["Ctrl", "E"],
    label: "导出当前案例",
    scope: "详情已选中",
    note: "Markdown + JSON 双格式，写到 exports/",
  },
  {
    keys: ["Ctrl", "Enter"],
    label: "联网检索",
    scope: "搜索框内",
    note: "默认只搜本地；按下才发起联网，结果只进「网络候选 · 未审核」",
  },
  {
    keys: ["Esc"],
    label: "层级返回",
    scope: "全局",
    note: "先清类目，再回一级导航；命令面板打开时先关面板",
  },
  {
    keys: ["Alt", "←"],
    label: "返回上一级导航",
    scope: "二级导航",
  },
  {
    keys: ["↑", "↓"],
    label: "命令面板内上下选择",
    scope: "命令面板",
  },
  {
    keys: ["Enter"],
    label: "执行选中的命令",
    scope: "命令面板",
  },
];

/** 焦点在可编辑元素里时不抢裸键（`/`），带修饰键的组合键不受影响 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
