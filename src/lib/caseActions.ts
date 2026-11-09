/**
 * 当前页面的案例动作登记处。
 * 新建按钮在 CaseWorkspace、导出按钮在 CaseDetail，全局快捷键与命令面板
 * 都拿不到它们的局部状态，因此由组件挂载时登记、卸载时撤销。
 */
export interface CaseActionMap {
  exportCurrent?: () => void;
  createCase?: () => void;
}

export const caseActions: CaseActionMap = {};

/** 执行已登记的动作；没有登记时返回 false，调用方据此降级（例如跳转到内容域） */
export function runCaseAction(key: keyof CaseActionMap): boolean {
  const action = caseActions[key];
  if (!action) return false;
  action();
  return true;
}
