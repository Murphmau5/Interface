import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
}

export function Input({ label, hint, trailing, className, id, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-meta font-medium text-ink-soft">
          {label}
        </label>
      ) : null}
      <div className="relative flex items-center">
        <input
          id={inputId}
          className={cn(
            "h-8 w-full min-w-0 rounded-sm border border-line bg-sunken px-2.5 text-sm text-ink shadow-ambient transition-colors duration-[var(--motion-fast)] placeholder:text-ink-faint hover:border-line-strong focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line disabled:opacity-50",
            trailing ? "pr-9" : null,
            className,
          )}
          {...rest}
        />
        {trailing ? (
          <span className="pointer-events-none absolute right-2 flex items-center text-ink-faint">
            {trailing}
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-xs leading-normal text-ink-faint">{hint}</p> : null}
    </div>
  );
}
