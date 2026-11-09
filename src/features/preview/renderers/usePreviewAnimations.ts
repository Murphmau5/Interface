import { useEffect, type RefObject } from "react";

export interface PreviewAnimationPlan {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

/**
 * 唯一播放引擎：Web Animations API。
 * effect cleanup 里逐个 cancel，切换案例 / 切参数 / 停播都不会留下动画帧。
 */
export function usePreviewAnimations(
  rootRef: RefObject<HTMLElement | null>,
  playing: boolean,
  loop: boolean,
  revision: number,
  build: (root: HTMLElement) => PreviewAnimationPlan[],
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !playing) return;

    const animations = build(root).map(({ element, keyframes, options }) =>
      element.animate(keyframes, {
        duration: options.duration ?? 300,
        delay: options.delay ?? 0,
        easing:
          typeof options.easing === "string"
            ? options.easing
            : "cubic-bezier(0.32,0.72,0,1)",
        iterations: loop ? Number.POSITIVE_INFINITY : 1,
        fill: "both",
      }),
    );

    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [rootRef, playing, loop, revision, build]);
}
