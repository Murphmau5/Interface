import { useState } from "react";
import { RefreshCw, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSetSetting, useSettings } from "@/features/settings/api";
import { SETTINGS_KEYS } from "@/lib/constants";
import { NAV_SECTIONS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface ToolViewProps {
  section: "workspace" | "discovery";
}

const COPY = {
  workspace: {
    eyebrow: "TOOLS / AI 工作台",
    title: "AI 工作台",
    description:
      "Phase 1 只保留输入草稿真实落库；分析、结构化与提示词生成等待 Provider 接入后启用。",
    key: SETTINGS_KEYS.aiDraft,
    placeholder: "例如：描述一段侧边栏推入动效，用于 240ms 的导航栈场景",
    actionLabel: "开始分析",
    actionReason: "AI Provider 与结构化输出尚未接入，Phase 1 禁用，避免给出假结果。",
    icon: Wand2,
  },
  discovery: {
    eyebrow: "TOOLS / AI 发现",
    title: "AI 发现",
    description:
      "Phase 1 只保留检索条件的保存与读回；联网抓取、识别与去重将在后续阶段接入。",
    key: SETTINGS_KEYS.discoveryQuery,
    placeholder: "例如：寻找 macOS 上常见的弹出层缓动曲线",
    actionLabel: "开始检索",
    actionReason: "检索 Provider、robots 策略与版权校验尚未实现，Phase 1 禁用。",
    icon: Sparkles,
  },
} as const;

export function ToolView({ section }: ToolViewProps) {
  const copy = COPY[section];
  const navSection = NAV_SECTIONS[section];
  const settings = useSettings();
  const setSetting = useSetSetting();
  const storedValue = settings.data?.[copy.key] ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const Icon = copy.icon;

  const save = () => {
    const value = (draft ?? "").trim();
    setSetting.mutate(
      { key: copy.key, value },
      {
        onSuccess: () => {
          setDraft(null);
          setStatus(`已写入 settings（key = ${copy.key}）`);
        },
        onError: (error) => setStatus(`写入失败：${error.message}`),
      },
    );
  };

  const readBack = () => {
    settings.refetch().then((result) => {
      const value = result.data?.[copy.key] ?? "";
      setDraft(null);
      setStatus(`已从 SQLite 读回：${value ? `“${value}”` : "（空值）"}`);
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line bg-surface px-6 py-4">
        <div className="label-eyebrow">{copy.eyebrow}</div>
        <div className="mt-1 flex items-center gap-2">
          <Icon size={16} strokeWidth={1.7} className="text-accent" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight text-ink">{copy.title}</h1>
          <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-2xs text-ink-faint">
            未接入
          </span>
        </div>
        <p className="mt-1 max-w-xl text-meta leading-normal text-ink-faint">{copy.description}</p>
      </header>

      <div
        id="content-list"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5 focus-visible:outline-none"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <Card className="bg-raised px-4 py-3">
            <div className="label-eyebrow pb-2">输入草稿（真实写入 settings）</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Input
                  aria-label="工具输入草稿"
                  placeholder={copy.placeholder}
                  value={draft ?? storedValue}
                  maxLength={200}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") save();
                  }}
                />
              </div>
              <Button size="sm" variant="primary" onClick={save}>
                保存草稿
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw size={12} strokeWidth={2} />}
                onClick={readBack}
              >
                读回
              </Button>
            </div>
            <div
              className={cn(
                "mt-2 rounded-xs border border-line bg-sunken px-2 py-1.5 font-mono text-2xs",
                status ? "text-ink-soft" : "text-ink-faint",
              )}
            >
              {status ?? `当前库中值：${storedValue ? `“${storedValue}”` : "（空）"}`}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <Tooltip content={copy.actionReason}>
                <span tabIndex={0}>
                  <Button size="sm" variant="secondary" disabled>
                    {copy.actionLabel}
                  </Button>
                </span>
              </Tooltip>
              <span className="text-2xs leading-normal text-ink-faint">{copy.actionReason}</span>
            </div>
          </Card>

          <Card className="bg-raised px-4 py-2">
            <div className="label-eyebrow py-2">规划中的类目</div>
            {navSection.groups.map((group) => (
              <div key={group.label} className="border-b border-line py-2.5 last:border-b-0">
                <div className="text-meta font-medium text-ink-soft">{group.label}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.categories.map((category) => (
                    <span
                      key={category.id}
                      className="inline-flex items-center rounded-xs border border-line bg-sunken px-1.5 py-0.5 text-2xs text-ink-faint"
                      title="导航可用；具体功能待后续阶段接入"
                    >
                      {category.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="py-2 text-2xs leading-normal text-ink-faint">{navSection.footnote}</p>
          </Card>
        </div>
      </div>
    </section>
  );
}
