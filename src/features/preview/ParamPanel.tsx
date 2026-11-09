import { Select } from "@/components/ui/Select";
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-meta text-ink-soft">{field.label}</span>
        <span className="font-mono text-2xs text-ink-faint">
          {value}
          {field.unit ?? ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={field.label}
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          disabled={disabled}
          onChange={(event) => onCommit(Number(event.target.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-pill bg-sunken accent-[var(--accent)] disabled:opacity-45"
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
          className="h-7 w-16 shrink-0 rounded-sm border border-line bg-sunken px-1.5 text-right font-mono text-2xs text-ink transition-colors duration-[var(--motion-fast)] hover:border-line-strong focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line disabled:opacity-45"
        />
      </div>
    </div>
  );
}

export function ParamPanel({ spec, onChange, disabled = false }: ParamPanelProps) {
  const fields = previewFields(spec);
  const values = spec as unknown as Record<string, string | number>;

  return (
    <div className="flex flex-col gap-3.5">
      {fields.map((field) =>
        field.type === "number" ? (
          <NumberRow
            key={field.key}
            field={field}
            value={Number(values[field.key] ?? 0)}
            disabled={disabled}
            onCommit={(value) => onChange(updatePreviewField(spec, field.key, value))}
          />
        ) : (
          <div key={field.key} className="flex items-center justify-between gap-3">
            <span className="text-meta text-ink-soft">{field.label}</span>
            <div className="w-40 shrink-0">
              <Select
                aria-label={field.label}
                options={field.options ?? []}
                value={String(values[field.key] ?? "")}
                disabled={disabled}
                onChange={(event) =>
                  onChange(updatePreviewField(spec, field.key, event.target.value))
                }
              />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
