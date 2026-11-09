import type { PreviewSpec } from "@/lib/preview";

export interface RendererProps {
  spec: PreviewSpec;
  /** true = 播放；false = 静态海报 */
  playing: boolean;
  loop: boolean;
  revision: number;
  /** 右栏为 true，缩略图与悬停层为 false（不接收指针事件） */
  interactive: boolean;
}
