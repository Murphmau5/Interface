import { useEffect } from "react";

import { useHoverPreviewStore } from "@/features/preview/hoverStore";
import { PreviewStage } from "@/features/preview/PreviewStage";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { useUiStore } from "@/stores/uiStore";

/**
 * 全应用唯一的悬停预览容器。
 * 卡片只负责上报「锚点 + 规格」，这里负责定位与播放，不会为每张卡创建实例。
 */
export function HoverPreviewLayer() {
  const active = useHoverPreviewStore((state) => state.active);
  const hide = useHoverPreviewStore((state) => state.hide);
  const userReduceMotion = useUiStore((state) => state.reduceMotion);
  const systemReduceMotion = usePrefersReducedMotion();
  const shouldLoop = !(userReduceMotion || systemReduceMotion);

  useEffect(() => {
    if (!active) return;
    // 列表滚动、窗口尺寸变化、筛选变化都应销毁悬停预览
    const dismiss = () => hide();
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [active, hide]);

  if (!active) return null;

  const width = Math.max(active.anchor.width, 132);
  const height = Math.max(active.anchor.height, 84);
  const maxLeft = window.innerWidth - width - 8;
  const maxTop = window.innerHeight - height - 8;
  const left = Math.min(Math.max(8, active.anchor.left), Math.max(8, maxLeft));
  const top = Math.min(Math.max(8, active.anchor.top), Math.max(8, maxTop));

  return (
    <div
      data-hover-preview="shared"
      aria-hidden
      className="pointer-events-none fixed z-40 overflow-hidden rounded-sm border border-line bg-raised shadow-panel"
      style={{ left, top, width, height }}
    >
      <PreviewStage
        key={active.caseId}
        spec={active.spec}
        playing
        loop={shouldLoop}
      />
    </div>
  );
}
