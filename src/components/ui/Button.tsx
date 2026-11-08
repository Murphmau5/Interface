import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-accent text-accent-ink hover:bg-accent/85 active:bg-accent/75",
  secondary:
    "border-line bg-raised text-ink hover:border-line-strong hover:bg-surface active:bg-sunken",
  ghost:
    "border-transparent bg-transparent text-ink-soft hover:bg-surface hover:text-ink active:bg-sunken",
  danger:
    "border-danger/25 bg-danger/10 text-danger hover:border-danger/40 hover:bg-danger/15 active:bg-danger/20",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-meta",
  md: "h-8 px-3 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border font-medium tracking-tight transition-colors duration-[var(--motion-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
