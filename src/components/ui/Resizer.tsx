import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";

interface ResizerProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  label: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Resizer({ value, min, max, onChange, onCommit, label }: ResizerProps) {
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);
  const latestRef = useRef(value);

  useEffect(() => {
    latestRef.current = value;
  }, [value]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startX: event.clientX, startValue: latestRef.current };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = clamp(drag.startValue + (event.clientX - drag.startX), min, max);
      latestRef.current = next;
      onChange(next);
    },
    [max, min, onChange],
  );

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onCommit(latestRef.current);
    },
    [onCommit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 24 : 8;
      let next: number | null = null;
      if (event.key === "ArrowLeft") next = clamp(latestRef.current - step, min, max);
      if (event.key === "ArrowRight") next = clamp(latestRef.current + step, min, max);
      if (event.key === "Home") next = min;
      if (event.key === "End") next = max;
      if (next === null) return;
      event.preventDefault();
      latestRef.current = next;
      onChange(next);
      onCommit(next);
    },
    [max, min, onChange, onCommit],
  );

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
      className="group relative z-10 w-2 shrink-0 cursor-col-resize touch-none bg-transparent focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line transition-colors duration-[var(--motion-fast)] group-hover:bg-accent-line group-focus-visible:bg-accent-line",
        )}
      />
    </div>
  );
}
