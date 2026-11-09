import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, RefreshCw, Settings, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAiAnalyze } from "@/features/candidates/api";
import { useAiSettings, useSetSetting, useSettings } from "@/features/settings/api";
import { CASE_KIND_LABELS, SETTINGS_KEYS, type CaseKind } from "@/lib/constants";
import { NAV_SECTIONS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { AiAnalyzeResult } from "@/lib/ipc";

interface ToolViewProps {
  section: "workspace" | "discovery";
}

const COPY = {
  workspace: {
    eyebrow: "TOOLS / AI 工作台",
    title: "AI 工作台",
    description: "草稿 → AI 分析 → 候选池审核。分析结果只进入候选池，人工审核通过后才写入案例库。",
    key: SETTINGS_KEYS.aiDraft,
    placeholder: "例如：描述一段侧边栏推入动效，用于 240ms 的导航栈场景",
    actionLabel: "开始分析",
    icon: Wand2,
  },
  discovery: {
    eyebrow: "TOOLS / AI 发现",
    title: "AI 发现",
    description:
      "联网采集入口在候选池页：粘贴网址可直接抓取（不需要 Key）；配置搜索服务后可按关键词检索并批量写入候选。",
    key: SETTINGS_KEYS.discoveryQuery,
    placeholder: "例如：寻找 macOS 上常见的弹出层缓动曲线",
    actionLabel: "开始检索",
    icon: Sparkles,
  },
} as const;

const DISCOVERY_DISABLED_REASON =
  "采集入口在「候选池」页：粘贴网址无需 Key；搜索采集需要先配置搜索服务。";

const CREDENTIAL_NOTE =
  "Key 存储于 Windows 凭据管理器：不写入数据库、不写入日志、不随导出包导出。同用户权限的进程仍可能读取，这不是加密保护。";

const KIND_OPTIONS = Object.entries(CASE_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function ToolView({ section }: ToolViewProps) {
  const copy = COPY[section];
  const navSection = NAV_SECTIONS[section];
  const navigate = useNavigate();
  const settings = useSettings();
  const setSetting = useSetSetting();
  const aiSettings = useAiSettings();
  const analyze = useAiAnalyze();

  const storedValue = settings.data?.[copy.key] ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [kind, setKind] = useState<CaseKind>("style");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAnalyzeResult | null>(null);
  const Icon = copy.icon;

  const draftValue = (draft ?? storedValue).trim();
  const isWorkspace = section === "workspace";
  const credential = isWorkspace
    ? aiSettings.data?.credential
    : aiSettings.data?.searchCredential;
  const configured = Boolean(credential?.configured);
  const badge = isWorkspace
    ? configured
      ? `已配置 · ${aiSettings.data?.provider.model || "模型"}`
      : "未配置"
    : configured
      ? "搜索已配置"
      : "未配置";

  const canAnalyze = isWorkspace && configured && draftValue.length > 0 && !analyze.isPending;
  // 发现页不再禁用：主按钮直接跳转候选池的联网采集入口
  const canOpenDiscovery = !isWorkspace;
  const actionReason = !isWorkspace
    ? DISCOVERY_DISABLED_REASON
    : !configured
      ? "未配置 AI 服务，请到设置 · AI 接线填写服务地址、模型与 Key。"
      : draftValue.length === 0
        ? "先写一段草稿再开始分析。"
        : null;

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

  const runAnalyze = () => {
    setAnalyzeError(null);
    setResult(null);
    analyze.mutate(
      { kind, draft: draftValue },
      {
        onSuccess: (value) => {
          setResult(value);
          setStatus("AI 分析完成，结果已进入候选池（未入库）");
        },
        onError: (error) => {
          const code = (error as { code?: string }).code;
          setAnalyzeError(code ? `${error.message}（${code}）` : error.message);
        },
      },
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line bg-surface px-6 py-4">
        <div className="label-eyebrow">{copy.eyebrow}</div>
        <div className="mt-1 flex items-center gap-2">
          <Icon size={16} strokeWidth={1.7} className="text-accent" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight text-ink">{copy.title}</h1>
          <span
            className={cn(
              "rounded-xs border px-1.5 py-0.5 font-mono text-2xs",
              configured
                ? "border-line text-ink-soft"
                : "border-line bg-sunken text-ink-faint",
            )}
          >
            {badge}
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
          {configured ? null : (
            <Card className="bg-raised px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-meta text-ink-soft">
                  {isWorkspace ? "AI 服务未配置" : "搜索服务未配置"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Settings size={12} strokeWidth={2} />}
                  onClick={() => navigate("/settings")}
                >
                  去设置
                </Button>
                <span className="text-2xs leading-normal text-ink-faint">{CREDENTIAL_NOTE}</span>
              </div>
            </Card>
          )}

          <Card className="bg-raised px-4 py-3">
            <div className="label-eyebrow pb-2">输入草稿（真实写入 settings）</div>
            {isWorkspace ? (
              <div className="pb-2">
                <SegmentedControl
                  label="案例类型"
                  options={KIND_OPTIONS}
                  value={kind}
                  onChange={(next) => setKind(next as CaseKind)}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Input
                  aria-label="工具输入草稿"
                  placeholder={copy.placeholder}
                  value={draft ?? storedValue}
                  maxLength={4000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) save();
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
              <Tooltip content={actionReason ?? copy.actionLabel}>
                <span tabIndex={0}>
                  <Button
                    size="sm"
                    variant={canAnalyze || canOpenDiscovery ? "primary" : "secondary"}
                    disabled={isWorkspace && !canAnalyze}
                    onClick={
                      isWorkspace ? runAnalyze : () => navigate("/discovery")
                    }
                  >
                    {!isWorkspace
                      ? "去候选池采集"
                      : analyze.isPending
                        ? "分析中…"
                        : copy.actionLabel}
                  </Button>
                </span>
              </Tooltip>
              {actionReason ? (
                <span className="text-2xs leading-normal text-ink-faint">{actionReason}</span>
              ) : null}
            </div>
            {analyzeError ? (
              <div className="mt-2 rounded-xs border border-danger/40 bg-sunken px-2 py-1.5 text-2xs leading-normal text-danger">
                {analyzeError}
              </div>
            ) : null}
          </Card>

          {result ? (
            <Card className="bg-raised px-4 py-3">
              <div className="label-eyebrow pb-2">候选（待审核）</div>
              <div className="text-meta font-medium text-ink">{result.candidate.title}</div>
              {result.candidate.summary ? (
                <p className="mt-1 text-2xs leading-normal text-ink-faint">
                  {result.candidate.summary}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-ink-faint">
                <span className="rounded-xs border border-line px-1.5 py-0.5 text-ink-soft">
                  置信度 estimated（AI 路径不产生 verified）
                </span>
                <span>模型 {result.model}</span>
                <span>未写入案例库</span>
              </div>
              {result.warnings.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-2xs leading-normal text-ink-faint">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2.5 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ArrowRight size={12} strokeWidth={2} />}
                  onClick={() => navigate("/discovery")}
                >
                  去候选池审核
                </Button>
                <span className="text-2xs leading-normal text-ink-faint">
                  审核通过后才会出现在案例库；没有免审通道。
                </span>
              </div>
            </Card>
          ) : null}

          <Card className="bg-raised px-4 py-2">
            <div className="label-eyebrow py-2">规划中的类目</div>
            {navSection.groups?.map((group) => (
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
