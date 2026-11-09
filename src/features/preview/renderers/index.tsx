import { ComponentRenderer } from "./ComponentRenderer";
import { FeedbackRenderer } from "./FeedbackRenderer";
import { MotionRenderer } from "./MotionRenderer";
import { StyleRenderer } from "./StyleRenderer";
import { ThemeRenderer } from "./ThemeRenderer";
import type { RendererProps } from "./types";

/** 按 spec.kind 分发；每个 renderer 只负责自己的场景 */
export function PreviewRenderer(props: RendererProps) {
  switch (props.spec.kind) {
    case "motion":
      return <MotionRenderer {...props} />;
    case "feedback":
      return <FeedbackRenderer {...props} />;
    case "component":
      return <ComponentRenderer {...props} />;
    case "theme":
      return <ThemeRenderer {...props} />;
    case "style":
      return <StyleRenderer {...props} />;
  }
}
