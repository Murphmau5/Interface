/**
 * 预览规格：来自 cases.payload_json.preview
 * 只接受自绘场景的内置类型，避免执行任意 CSS / JS。
 */
export const PREVIEW_TYPES = ["motion.stagger", "motion.press", "theme.crossfade"] as const;

export type PreviewType = (typeof PREVIEW_TYPES)[number];

export interface PreviewSpec {
  type: PreviewType;
  durationMs: number;
  easing: string;
  staggerMs: number;
}

export const PREVIEW_TYPE_LABELS: Record<PreviewType, string> = {
  "motion.stagger": "错峰入场",
  "motion.press": "按压反馈",
  "theme.crossfade": "深浅交叉淡入",
};

const EASING_PATTERN =
  /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(-?[0-9.]+,\s*-?[0-9.]+,\s*-?[0-9.]+,\s*-?[0-9.]+\))$/;

const MIN_DURATION = 200;
const MAX_DURATION = 5000;
const MAX_STAGGER = 400;

function isPreviewType(value: unknown): value is PreviewType {
  return typeof value === "string" && (PREVIEW_TYPES as readonly string[]).includes(value);
}

export function parsePreviewSpec(payloadJson: string): PreviewSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const preview = (parsed as { preview?: unknown }).preview;
  if (typeof preview !== "object" || preview === null) return null;

  const candidate = preview as Record<string, unknown>;
  if (!isPreviewType(candidate.type)) return null;

  const duration = Number(candidate.durationMs);
  if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    return null;
  }

  const stagger = Number(candidate.staggerMs ?? 0);
  if (!Number.isFinite(stagger) || stagger < 0 || stagger > MAX_STAGGER) return null;

  const easing = typeof candidate.easing === "string" ? candidate.easing.trim() : "ease";
  if (!EASING_PATTERN.test(easing)) return null;

  return {
    type: candidate.type,
    durationMs: Math.round(duration),
    easing,
    staggerMs: Math.round(stagger),
  };
}

export function describePreview(spec: PreviewSpec): string {
  return `${PREVIEW_TYPE_LABELS[spec.type]} · ${spec.durationMs}ms · ${spec.easing}`;
}
