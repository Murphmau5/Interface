import type { ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const tooltipId = useId();

  return (
    <span
      className={cn("group relative inline-flex max-w-full", className)}
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {children}
      <span
        role="tooltip"
        id={tooltipId}
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-40 w-max max-w-64 -translate-x-1/2 rounded-sm border border-line bg-raised px-2 py-1 text-xs leading-normal text-ink opacity-0 shadow-panel transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
