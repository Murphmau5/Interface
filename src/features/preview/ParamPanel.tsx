import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";

import { ipc } from "@/lib/ipc";
import {
  PARAM_SOURCE_LABELS,
  previewFields,
  updatePreviewField,
  type ParamEvidence,
  type ParamSourceLevel,
  type PreviewField,
  type PreviewSpec,
  type SpecRef,
} from "@/lib/preview";

interface ParamPanelProps {
  spec: PreviewSpec;
  onChange: (next: PreviewSpec) => void;
  disabled?: boolean;
  evidence?: ParamEvidence | null;
}

type ParamGroup = "播放" | "运动" | "外观";

const PLAY_KEYS = new Set(["durationMs", "delayMs", "staggerMs", "triggerMs", "holdMs", "decayMs"]);
const MOTION_KEYS = new Set(["easing", "distance", "scale", "opacity", "blur"]);

function groupFor(field: PreviewField): ParamGroup {
  if (PLAY_KEYS.has(field.key)) return "播放";
  if (MOTION_KEYS.has(field.key)) return "运动";
  return "外观";
}

function openUrl(url: string) {
  void ipc.systemOpenUrl(url).catch(() => {
    // 打开失败不阻塞参数编辑；链接本身已在弹层里可见可复制
  });
}

function EvidencePopover({
  anchor,
  label,
  level,
  reference,
  alts,
  onClose,
}: {
  anchor: { left: number; bottom: number };
  label: string;
  level: ParamSourceLevel;
  reference?: SpecRef;
  alts: SpecRef[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - 312));

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={`${label} 参数证据`}
        data-spec-popover
        style={{ position: "fixed", left, top: anchor.bottom + 6, width: 300 }}
        className="z-50 rounded-md border border-line bg-surface p-3 shadow-lg"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="label-eyebrow">参数证据 · {label}</span>
          <span className="font-mono text-2xs text-ink-faint">{PARAM_SOURCE_LABELS[level]}</span>
        </div>
        {reference ? (
          <div className="space-y-1.5">
            <div className="text-2xs text-ink-soft">
              {reference.platform} · {reference.version}
            </div>
            <div className="text-2xs text-ink-faint">{reference.component}</div>
            <blockquote className="rounded border-l-2 border-accent-line bg-sunken px-2 py-1.5 font-mono text-2xs leading-relaxed text-ink-soft">
              {reference.quote}
            </blockquote>
            <button
              type="button"
              onClick={() => openUrl(reference.url)}
              className="inline-flex items-center gap-1 text-2xs text-accent hover:underline"
            >
              <ExternalLink size={11} strokeWidth={1.9} aria-hidden />
              打开官方文档
            </button>
          </div>
        ) : (
          <p className="text-2xs leading-relaxed text-ink-soft">无官方原文，来源为推测。</p>
        )}
        {alts.length > 0 ? (
          <div className="mt-2 border-t border-line pt-2">
            <div className="mb-1 text-2xs text-ink-faint">平台参考值</div>
            <ul className="space-y-1">
              {alts.map((alt) => (
                <li key={`${alt.platform}-${alt.version}-${alt.quote}`} className="text-2xs text-ink-soft">
                  <span className="text-ink-faint">
                    {alt.platform} · {alt.version}：
                  </span>
                  {alt.quote}
                  <button
                    type="button"
                    onClick={() => openUrl(alt.url)}
                    className="ml-1 text-accent hover:underline"
                  >
                    查看
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

function SourceMark({
  paramKey,
  label,
  level,
  reference,
  alts,
}: {
  paramKey: string;
  label: string;
  level?: ParamSourceLevel;
  reference?: SpecRef;
  alts: SpecRef[];
}) {
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);

  if (!level) return null;
  const tone = level;
  return (
    <>
      <button
        type="button"
        data-spec-source={paramKey}
        aria-label={`${label} 参数来源：${PARAM_SOURCE_LABELS[level]}`}
        aria-expanded={anchor !== null}
        title={`${PARAM_SOURCE_LABELS[level]}${reference ? "" : " · 无官方原文"}`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { left: rect.left, bottom: rect.bottom });
        }}
        className="param-source"
      >
        <span className="confidence-dot" data-tone={tone} />
      </button>
      {anchor ? (
        <EvidencePopover
          anchor={anchor}
          label={label}
          level={tone}
          reference={reference}
          alts={alts}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </>
  );
}

function NumberRow({
  field,
  value,
  disabled,
  onCommit,
  level,
  reference,
  alts,
}: {
  field: PreviewField;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
  level?: ParamSourceLevel;
  reference?: SpecRef;
  alts: SpecRef[];
}) {
  return (
    <div className="param-row">
      <span className="param-label">
        <span className="param-label-text" title={field.label}>
          {field.label}
        </span>
        <SourceMark
          paramKey={field.key}
          label={field.label}
          level={level}
          reference={reference}
          alts={alts}
        />
      </span>
      <input
        type="range"
        aria-label={field.label}
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        disabled={disabled}
        onChange={(event) => onCommit(Number(event.target.value))}
        className="param-range"
      />
      <input
        type="number"
        aria-label={`${field.label}（数值）`}
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        disabled={disabled}
        onChange={(event) => onCommit(Number(event.target.value))}
        className="param-number"
      />
      <span className="sr-only">
        {value}
        {field.unit ?? ""}
      </span>
    </div>
  );
}

export function ParamPanel({ spec, onChange, disabled = false, evidence = null }: ParamPanelProps) {
  const fields = previewFields(spec);
  const values = spec as unknown as Record<string, string | number>;
  const sources = evidence?.sources ?? {};
  const refs = evidence?.refs ?? {};
  const altMap = evidence?.alts ?? {};

  const groups: { label: ParamGroup; fields: PreviewField[] }[] = [];
  for (const field of fields) {
    const label = groupFor(field);
    const existing = groups.find((group) => group.label === label);
    if (existing) {
      existing.fields.push(field);
    } else {
      groups.push({ label, fields: [field] });
    }
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.label} className="param-group">
          <div className="param-group-label">{group.label}</div>
          {group.fields.map((field) =>
            field.type === "number" ? (
              <NumberRow
                key={field.key}
                field={field}
                value={Number(values[field.key] ?? 0)}
                disabled={disabled}
                onCommit={(value) => onChange(updatePreviewField(spec, field.key, value))}
                level={sources[field.key]}
                reference={refs[field.key]}
                alts={altMap[field.key] ?? []}
              />
            ) : (
              <div key={field.key} className="param-row">
                <span className="param-label">
                  <span className="param-label-text" title={field.label}>
                    {field.label}
                  </span>
                  <SourceMark
                    paramKey={field.key}
                    label={field.label}
                    level={sources[field.key]}
                    reference={refs[field.key]}
                    alts={altMap[field.key] ?? []}
                  />
                </span>
                <select
                  aria-label={field.label}
                  value={String(values[field.key] ?? "")}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(updatePreviewField(spec, field.key, event.target.value))
                  }
                  className="param-select col-span-2"
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
