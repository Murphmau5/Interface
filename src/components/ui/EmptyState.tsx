import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface px-6 text-center",
        compact ? "gap-1.5 py-5" : "gap-2 py-10",
        className,
      )}
    >
      {icon ? (
        <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-raised text-ink-faint">
          {icon}
        </span>
      ) : null}
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <p className="max-w-72 text-xs leading-normal text-ink-faint">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
