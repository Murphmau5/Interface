import type { ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
  options: SelectOption[];
}

export function Select({ label, hint, options, className, id, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-meta font-medium text-ink-soft">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            "h-8 w-full min-w-0 appearance-none rounded-sm border border-line bg-sunken pl-2.5 pr-8 text-sm text-ink shadow-ambient transition-colors duration-[var(--motion-fast)] hover:border-line-strong focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line disabled:opacity-50",
            className,
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          size={14}
          strokeWidth={1.8}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint"
        />
      </div>
      {hint ? <p className="text-xs leading-normal text-ink-faint">{hint}</p> : null}
    </div>
  );
}
