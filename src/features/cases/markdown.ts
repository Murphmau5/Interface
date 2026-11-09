import {
  buildPreviewPrompt,
  buildPreviewSnippet,
  previewParamRows,
  previewTitle,
  PREVIEW_KIND_LABELS,
  type PreviewSpec,
} from "@/lib/preview";

export interface MarkdownInput {
  title: string;
  kindLabel: string;
  categoryLabel: string | null;
  confidenceLabel: string;
  updatedAt: string;
  spec: PreviewSpec;
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 一条案例的导出正文：元信息 → 参数表 → 提示词 → 预览代码块 */
export function buildCaseMarkdown(input: MarkdownInput): string {
  const rows = previewParamRows(input.spec);
  const lines = [
    `# ${input.title}`,
    "",
    "| 元信息 | 值 |",
    "| --- | --- |",
    `| 内容域 | ${cell(input.kindLabel)} |`,
    `| 类目 | ${cell(input.categoryLabel ?? "未归类")} |`,
    `| 置信度 | ${cell(input.confidenceLabel)} |`,
    `| 更新时间 | ${cell(input.updatedAt)} |`,
    `| 预览模板 | ${cell(`${PREVIEW_KIND_LABELS[input.spec.kind]} / ${previewTitle(input.spec)}`)} |`,
    "",
    "## 参数",
    "",
    "| 参数 | 值 |",
    "| --- | --- |",
    ...rows.map((row) => `| ${cell(row.label)} | ${cell(row.value)} |`),
    "",
    "## 提示词",
    "",
    buildPreviewPrompt(input.spec),
    "",
    "## 预览代码",
    "",
    buildPreviewSnippet(input.spec),
    "",
    "---",
    "",
    "由界序 INTERFACE 生成 · 自绘示例，无外部素材。",
    "",
  ];

  return lines.join("\n");
}
