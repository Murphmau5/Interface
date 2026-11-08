import { create } from "zustand";

import type { PreviewSpec } from "@/lib/preview";

export interface HoverPreviewAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HoverPreviewRequest {
  caseId: string;
  spec: PreviewSpec;
  anchor: HoverPreviewAnchor;
}

interface HoverPreviewState {
  active: HoverPreviewRequest | null;
  show: (request: HoverPreviewRequest) => void;
  hide: (caseId?: string) => void;
}

/**
 * 全应用只有一个悬停预览：状态放在全局，渲染由 HoverPreviewLayer 单例负责。
 * 任何时刻只保留最后一个请求，避免多张卡各建一套预览。
 */
export const useHoverPreviewStore = create<HoverPreviewState>((set) => ({
  active: null,
  show: (request) => set({ active: request }),
  hide: (caseId) =>
    set((state) => {
      if (!state.active) return {};
      if (caseId && state.active.caseId !== caseId) return {};
      return { active: null };
    }),
}));
