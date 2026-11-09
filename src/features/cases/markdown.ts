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

export interface CaseJsonInput {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  categoryId: string | null;
  categoryLabel: string | null;
  confidence: string;
  confidenceLabel: string;
  platform: string;
  tags: string[];
  updatedAt: string;
  spec: PreviewSpec | null;
}

function caseJsonPayload(input: CaseJsonInput) {
  return {
    schema: "interface.case/v2",
    exportedAt: new Date().toISOString(),
    id: input.id,
    title: input.title,
    kind: input.kind,
    kindLabel: input.kindLabel,
    categoryId: input.categoryId,
    categoryLabel: input.categoryLabel,
    confidence: input.confidence,
    confidenceLabel: input.confidenceLabel,
    platform: input.platform,
    tags: input.tags,
    updatedAt: input.updatedAt,
    preview: input.spec,
    previewLabel: input.spec
      ? `${PREVIEW_KIND_LABELS[input.spec.kind]} / ${previewTitle(input.spec)}`
      : "无预览规格",
    params: input.spec
      ? previewParamRows(input.spec).map((row) => ({
          label: row.label,
          value: row.value,
        }))
      : [],
    prompt: input.spec ? buildPreviewPrompt(input.spec) : "",
    snippet: input.spec ? buildPreviewSnippet(input.spec) : "",
  };
}

/** 与 Markdown 同一批数据的结构化导出，便于二次处理 */
export function buildCaseJson(input: CaseJsonInput): string {
  return JSON.stringify(caseJsonPayload(input), null, 2);
}

export interface CaseDocInput {
  title: string;
  kindLabel: string;
  categoryLabel: string | null;
  confidenceLabel: string;
  prompt: string;
  spec: PreviewSpec | null;
}

/** 单条 / 批量共用的条目正文：标题 → 类目 → 参数表 → 提示词 */
function docLines(input: CaseDocInput, heading: "#" | "##"): string[] {
  const sub = `${heading}#`;
  const rows = input.spec ? previewParamRows(input.spec) : [];
  const paramLines =
    rows.length > 0
      ? [
          "| 参数 | 值 |",
          "| --- | --- |",
          ...rows.map((row) => `| ${cell(row.label)} | ${cell(row.value)} |`),
        ]
      : ["（该条目没有可调参数）"];
  return [
    `${heading} ${input.title}`,
    "",
    `- 内容域：${input.kindLabel}`,
    `- 类目：${input.categoryLabel ?? "未归类"}`,
    `- 置信度：${input.confidenceLabel}`,
    "",
    `${sub} 参数`,
    "",
    ...paramLines,
    "",
    `${sub} 提示词`,
    "",
    input.prompt.trim(),
    "",
  ];
}

/** 给 AI 用的单条正文：标题 / 类目 / 参数表 / 提示词，不含界面角标与计数 */
export function buildCaseBrief(input: CaseDocInput): string {
  return docLines(input, "#").join("\n");
}

/** 多选合并：每条一段，段间用分隔线，顺序与中栏列表一致 */
export function buildBatchMarkdown(cases: CaseDocInput[]): string {
  return `${cases
    .map((entry) => docLines(entry, "##").join("\n").trimEnd())
    .join("\n\n---\n\n")}\n`;
}

/** 批量导出的 JSON：与批量 Markdown 同一批条目 */
export function buildBatchJson(cases: CaseJsonInput[]): string {
  return JSON.stringify(
    {
      schema: "interface.cases/v1",
      exportedAt: new Date().toISOString(),
      items: cases.map(caseJsonPayload),
    },
    null,
    2,
  );
}
