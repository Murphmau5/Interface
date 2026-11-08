import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({ label = "正在读取本地数据…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center justify-center gap-3 py-10", className)}
    >
      <span className="h-4 w-4 animate-spin rounded-pill border border-line-strong border-t-accent" />
      <span className="text-xs text-ink-faint">{label}</span>
    </div>
  );
}
