import {
  previewFields,
  updatePreviewField,
  type PreviewField,
  type PreviewSpec,
} from "@/lib/preview";

interface ParamPanelProps {
  spec: PreviewSpec;
  onChange: (next: PreviewSpec) => void;
  disabled?: boolean;
}

type ParamGroup = "播放" | "运动" | "外观";

const PLAY_KEYS = new Set(["durationMs", "delayMs", "staggerMs", "triggerMs", "holdMs", "decayMs"]);
const MOTION_KEYS = new Set(["easing", "distance", "scale", "opacity", "blur"]);

function groupFor(field: PreviewField): ParamGroup {
  if (PLAY_KEYS.has(field.key)) return "播放";
  if (MOTION_KEYS.has(field.key)) return "运动";
  return "外观";
}

function NumberRow({
  field,
  value,
  disabled,
  onCommit,
}: {
  field: PreviewField;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="param-row">
      <span className="param-label" title={field.label}>
        {field.label}
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

export function ParamPanel({ spec, onChange, disabled = false }: ParamPanelProps) {
  const fields = previewFields(spec);
  const values = spec as unknown as Record<string, string | number>;

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
              />
            ) : (
              <div key={field.key} className="param-row">
                <span className="param-label" title={field.label}>
                  {field.label}
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
