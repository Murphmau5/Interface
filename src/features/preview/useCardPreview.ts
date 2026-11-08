import { useEffect, useRef } from "react";

import type { PreviewSpec } from "@/lib/preview";
import { useHoverPreviewStore } from "@/features/preview/hoverStore";

const HOVER_DELAY_MS = 140;

/**
 * 卡片悬停/聚焦 → 共享预览层。
 * 返回的 thumbRef 必须挂在卡片内的预览区域，锚点位置以它为准。
 */
export function useCardPreview(caseId: string, spec: PreviewSpec | null) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const show = useHoverPreviewStore((state) => state.show);
  const hide = useHoverPreviewStore((state) => state.hide);

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => cancel, []);

  const request = (delay: number) => {
    if (!spec) return;
    cancel();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const thumb = thumbRef.current;
      if (!thumb) return;
      const rect = thumb.getBoundingClientRect();
      show({
        caseId,
        spec,
        anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    }, delay);
  };

  return {
    cardRef,
    thumbRef,
    cardHandlers: {
      onPointerEnter: () => {
        // 进入新卡时立刻让上一张卡的预览消失，再等 140ms 播这一张
        hide();
        request(HOVER_DELAY_MS);
      },
      onPointerLeave: () => {
        cancel();
        hide(caseId);
      },
      onFocus: () => request(0),
      onBlur: () => {
        cancel();
        hide(caseId);
      },
    },
  };
}
