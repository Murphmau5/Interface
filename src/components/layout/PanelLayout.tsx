import type { ReactNode } from "react";

import { Resizer } from "@/components/ui/Resizer";
import { useSetSetting } from "@/features/settings/api";
import { PANEL_LIMITS, SETTINGS_KEYS } from "@/lib/constants";
import { useUiStore } from "@/stores/uiStore";

interface PanelLayoutProps {
  middle: ReactNode;
  detail: ReactNode;
  label: string;
}

export function PanelLayout({ middle, detail, label }: PanelLayoutProps) {
  const middleWidth = useUiStore((state) => state.middleWidth);
  const setMiddleWidth = useUiStore((state) => state.setMiddleWidth);
  const persist = useSetSetting();

  const commitWidth = (width: number) => {
    persist.mutate(
      { key: SETTINGS_KEYS.middleWidth, value: String(width) },
      {
        onError: (error) => {
          console.warn("面板宽度未能写入 settings：", error.message);
        },
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      <section
        aria-label={`${label}列表`}
        style={{ width: middleWidth }}
        className="flex min-h-0 shrink-0 flex-col bg-surface"
      >
        {middle}
      </section>
      <Resizer
        label={`${label}列表宽度`}
        value={middleWidth}
        min={PANEL_LIMITS.middle.min}
        max={PANEL_LIMITS.middle.max}
        onChange={setMiddleWidth}
        onCommit={commitWidth}
      />
      <section aria-label={`${label}详情`} className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
        {detail}
      </section>
    </div>
  );
}
