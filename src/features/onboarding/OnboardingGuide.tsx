import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useCaseCounts, useCaseQuery } from "@/features/cases/api";
import { useSetSetting, useSettings } from "@/features/settings/api";
import { CASE_KIND_LABELS, CONFIDENCE_LABELS, SETTINGS_KEYS } from "@/lib/constants";
import { useUiStore } from "@/stores/uiStore";

const STEP_COUNT = 3;

const STEPS = [
  {
    eyebrow: "第 1 步 · 用途",
    title: "这里存的是规格，不是链接",
    lead: "界序不是收藏夹。每条案例都带可调参数和来源标记：verified 有原始规格可核对，estimated 是从截图或页面推测。判断一条案例能不能直接用，看参数和这个标记，不看标题。",
  },
  {
    eyebrow: "第 2 步 · 三栏",
    title: "左栏选域，中栏筛条目，右栏看预览",
    lead: "三个栏位各管一段，顺序是从左到右：先定范围，再挑条目，最后调参数。",
  },
  {
    eyebrow: "第 3 步 · 参数",
    title: "参数改了就生效，也会存下来",
    lead: "右栏改参数没有「保存」按钮：预览当场重放，改动直接写入本机数据库，下次打开还在。",
  },
] as const;

interface PreviewParams {
  durationMs?: number;
  easing?: string;
  radiusPx?: number;
  depth?: number;
}

const PARAM_LABELS: Record<keyof PreviewParams, string> = {
  durationMs: "时长",
  easing: "缓动",
  radiusPx: "圆角",
  depth: "层深",
};

function readPreview(payloadJson: string): PreviewParams | null {
  try {
    const payload = JSON.parse(payloadJson) as { preview?: PreviewParams };
    return payload.preview ?? null;
  } catch {
    return null;
  }
}

function formatParam(key: keyof PreviewParams, value: PreviewParams[keyof PreviewParams]): string {
  if (key === "durationMs") return `${value}ms`;
  if (key === "radiusPx") return `${value}px`;
  return String(value);
}

function Column({ title, subtitle, lines }: { title: string; subtitle: string; lines: string[] }) {
  return (
    <div className="rounded-sm border border-line bg-surface p-3">
      <div className="text-meta font-semibold text-ink">{title}</div>
      <div className="mt-0.5 text-2xs text-ink-faint">{subtitle}</div>
      <ul className="mt-2 flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line} className="text-2xs leading-relaxed text-ink-soft">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 首启只开一次；标记写在 settings 表，跳过与看完都算。 */
export function OnboardingGate() {
  const settings = useSettings();
  const onboardingOpen = useUiStore((state) => state.onboardingOpen);
  const openOnboarding = useUiStore((state) => state.openOnboarding);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !settings.isSuccess) return;
    decided.current = true;
    if (!settings.data?.[SETTINGS_KEYS.onboarding]) openOnboarding();
  }, [settings.isSuccess, settings.data, openOnboarding]);

  return onboardingOpen ? <OnboardingGuide /> : null;
}

function OnboardingGuide() {
  const closeOnboarding = useUiStore((state) => state.closeOnboarding);
  const setSetting = useSetSetting();
  const counts = useCaseCounts();
  const samples = useCaseQuery({ scope: "all", sort: "updated", limit: 12 });
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const complete = (outcome: "done" | "skipped") => {
    setSetting.mutate(
      { key: SETTINGS_KEYS.onboarding, value: `v1:${outcome}` },
      {
        onError: (error) => {
          console.warn("引导标记未能写入 settings：", error.message);
        },
      },
    );
    closeOnboarding();
  };

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        complete("skipped");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const items = samples.data?.items ?? [];
  const paramCase = items.find((item) => {
    const preview = readPreview(item.payloadJson);
    return preview !== null && (preview.durationMs !== undefined || preview.easing !== undefined);
  });
  const paramEntries = paramCase
    ? (Object.keys(PARAM_LABELS) as (keyof PreviewParams)[])
        .filter((key) => {
          const preview = readPreview(paramCase.payloadJson);
          return preview?.[key] !== undefined;
        })
        .slice(0, 4)
    : [];
  const current = STEPS[step];

  const body = (() => {
    if (step === 0) {
      return (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            {items.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-sm border border-line bg-surface p-3">
                <div className="flex items-center gap-1.5 text-2xs text-ink-faint">
                  <span>{CASE_KIND_LABELS[item.kind as keyof typeof CASE_KIND_LABELS] ?? item.kind}</span>
                  <span aria-hidden>·</span>
                  <span>{CONFIDENCE_LABELS[item.confidence] ?? item.confidence}</span>
                </div>
                <div className="mt-1 truncate text-meta font-medium text-ink">{item.title}</div>
                <p className="mt-1 line-clamp-3 text-2xs leading-relaxed text-ink-soft">
                  {item.summary}
                </p>
              </div>
            ))}
            {items.length === 0 ? (
              <p className="col-span-3 text-meta text-ink-faint">库里还没有案例。</p>
            ) : null}
          </div>
          <p className="mt-2 text-2xs text-ink-faint">以上是当前库里的真实条目，不是示意图。</p>
        </>
      );
    }
    if (step === 1) {
      return (
        <div className="grid grid-cols-3 gap-2.5">
          <Column
            title="左栏"
            subtitle="定范围"
            lines={[
              `内容域：风格 ${counts.data?.style ?? 0}、主题 ${counts.data?.theme ?? 0}、动效 ${counts.data?.motion ?? 0}、反馈 ${counts.data?.feedback ?? 0}、组件 ${counts.data?.component ?? 0}`,
              "点域进入二级类目，再点类目筛中栏",
              "底部是收藏、最近使用与合集",
            ]}
          />
          <Column
            title="中栏"
            subtitle="挑条目"
            lines={[
              "搜索框按标题、摘要与标签找",
              "筛选：类型 / 平台 / 置信度 / 组件层",
              "网格与表格随时切换，排序不变筛选",
            ]}
          />
          <Column
            title="右栏"
            subtitle="看与调"
            lines={[
              "选中条目后显示预览与参数",
              "参数改动立刻反映到预览",
              "提示词与来源一并显示，可复制",
            ]}
          />
        </div>
      );
    }
    return (
      <>
        {paramCase ? (
          <div className="rounded-sm border border-line bg-surface p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xs text-ink-faint">
                {CASE_KIND_LABELS[paramCase.kind as keyof typeof CASE_KIND_LABELS] ?? paramCase.kind}
              </span>
              <span className="truncate text-meta font-medium text-ink">{paramCase.title}</span>
              <span className="ml-auto shrink-0 text-2xs text-ink-faint">
                置信度：{CONFIDENCE_LABELS[paramCase.confidence] ?? paramCase.confidence}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {paramEntries.map((key) => {
                const preview = readPreview(paramCase.payloadJson);
                if (!preview || preview[key] === undefined) return null;
                return (
                  <span
                    key={key}
                    className="rounded-xs border border-line bg-sunken px-2 py-1 font-mono text-2xs text-ink-soft"
                  >
                    {PARAM_LABELS[key]} {formatParam(key, preview[key])}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
        <ul className="mt-3 flex flex-col gap-1.5 text-meta leading-relaxed text-ink-soft">
          <li>· 拖动或选择右栏参数，预览当场重放，不需要保存。</li>
          <li>· 改动写入本机 SQLite（app.db），重启应用后仍在。</li>
          <li>· 你手动改过的值标为「用户定义」，不会被内容包更新覆盖。</li>
        </ul>
      </>
    );
  })();

  return (
    <div
      data-onboarding="overlay"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--scrim)] p-6 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        data-onboarding="dialog"
        data-step={step + 1}
        className="flex max-h-[min(86vh,720px)] w-[min(760px,calc(100vw-48px))] flex-col overflow-hidden rounded-md border border-line-strong bg-raised shadow-panel focus-visible:outline-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-2xs tracking-wide text-accent">
              {current.eyebrow}（{step + 1} / {STEP_COUNT}）
            </div>
            <h2 id="onboarding-title" className="mt-1 text-lg font-semibold tracking-tight text-ink">
              {current.title}
            </h2>
            <p className="mt-1.5 text-meta leading-relaxed text-ink-soft">{current.lead}</p>
          </div>
          <button
            type="button"
            aria-label="关闭引导"
            onClick={() => complete("skipped")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line"
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{body}</div>

        <footer className="border-t border-line px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              data-onboarding-action="skip"
              onClick={() => complete("skipped")}
              className="text-meta text-ink-faint underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
            >
              跳过引导
            </button>
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-onboarding-action="prev"
                  icon={<ArrowLeft size={12} strokeWidth={2} aria-hidden />}
                  onClick={() => setStep((value) => value - 1)}
                >
                  上一步
                </Button>
              ) : null}
              {step < STEP_COUNT - 1 ? (
                <Button
                  size="sm"
                  variant="primary"
                  data-onboarding-action="next"
                  onClick={() => setStep((value) => value + 1)}
                >
                  下一步
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  data-onboarding-action="finish"
                  icon={<Check size={12} strokeWidth={2} aria-hidden />}
                  onClick={() => complete("done")}
                >
                  开始使用
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-2xs text-ink-faint">
            引导只出现这一次；跳过或看完都会记录。之后可在设置 → 使用引导重新打开。
          </p>
        </footer>
      </div>
    </div>
  );
}
