import { useId } from "react";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** 只渲染开关本体，标题与说明由外层行提供 */
  compact?: boolean;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  compact = false,
}: SwitchProps) {
  const descriptionId = useId();

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill border transition-colors duration-[var(--motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-45",
        !compact && "mt-0.5",
        checked
          ? "border-accent-line bg-accent-soft"
          : "border-line bg-sunken hover:border-line-strong",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block h-3.5 w-3.5 rounded-pill transition-transform duration-[var(--motion-base)]",
          checked ? "translate-x-[18px] bg-accent" : "translate-x-[3px] bg-ink-faint",
        )}
      />
    </button>
  );

  if (compact) return control;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs leading-normal text-ink-faint">
            {description}
          </p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
