import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** 系统级「减少动效」偏好；与用户设置一起决定预览是否循环。 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
