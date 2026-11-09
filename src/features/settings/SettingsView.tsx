import { useState, type ReactNode } from "react";
import {
  Database,
  Download,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAppInfo, useSetSetting, useSettings } from "@/features/settings/api";
import { DEFAULT_LAYOUT, SETTINGS_KEYS } from "@/lib/constants";
import { LICENSE_ENTRIES, LICENSE_POLICY } from "@/lib/licenses";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";

const THEME_OPTIONS = [
  { value: "system", label: "跟随系统", icon: <Monitor size={12} strokeWidth={1.8} aria-hidden /> },
  { value: "dark", label: "深色", icon: <Moon size={12} strokeWidth={1.8} aria-hidden /> },
  { value: "light", label: "浅色", icon: <Sun size={12} strokeWidth={1.8} aria-hidden /> },
] as const;

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-xs leading-normal text-ink-faint">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const reduceMotion = useUiStore((state) => state.reduceMotion);
  const setReduceMotion = useUiStore((state) => state.setReduceMotion);
  const leftWidth = useUiStore((state) => state.leftWidth);
  const middleWidth = useUiStore((state) => state.middleWidth);
  const resetLayout = useUiStore((state) => state.resetLayout);
  const settings = useSettings();
  const appInfo = useAppInfo();
  const setSetting = useSetSetting();

  const storedNote = settings.data?.[SETTINGS_KEYS.note] ?? "";
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);

  const changeTheme = (next: "system" | "dark" | "light") => {
    setThemeMode(next);
    setSetting.mutate({ key: SETTINGS_KEYS.themeMode, value: next });
  };

  const changeReduceMotion = (next: boolean) => {
    setReduceMotion(next);
    setSetting.mutate({ key: SETTINGS_KEYS.reduceMotion, value: next ? "on" : "off" });
  };

  const saveNote = () => {
    const value = (noteDraft ?? "").trim();
    setSetting.mutate(
      { key: SETTINGS_KEYS.note, value },
      {
        onSuccess: () => {
          setNoteDraft(null);
          setNoteStatus(`已写入 settings（key = ${SETTINGS_KEYS.note}）`);
        },
        onError: (error) => setNoteStatus(`写入失败：${error.message}`),
      },
    );
  };

  const reloadNote = () => {
    settings.refetch().then((result) => {
      const value = result.data?.[SETTINGS_KEYS.note] ?? "";
      setNoteDraft(null);
      setNoteStatus(`已从 SQLite 读回：${value ? `“${value}”` : "（空值）"}`);
    });
  };

  const restoreLayout = () => {
    resetLayout();
    setSetting.mutate(
      { key: SETTINGS_KEYS.leftWidth, value: String(DEFAULT_LAYOUT.leftWidth) },
      {
        onSuccess: () =>
          setSetting.mutate({
            key: SETTINGS_KEYS.middleWidth,
            value: String(DEFAULT_LAYOUT.middleWidth),
          }),
      },
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line bg-surface px-6 py-4">
        <div className="label-eyebrow">TOOLS / 设置</div>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-ink">设置</h1>
          <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-2xs text-ink-faint">
            {appInfo.data?.appVersion ? `v${appInfo.data.appVersion}` : "v1.0.1"}
          </span>
        </div>
        <p className="mt-1 text-meta leading-normal text-ink-faint">
          偏好写入 SQLite 的 settings 表；主题默认跟随系统，手动选择后不再跟随。
        </p>
      </header>

      <div
        id="content-list"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5 focus-visible:outline-none"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <Card className="bg-raised px-4 py-2">
            <div className="label-eyebrow py-2">外观</div>
            <SettingRow
              title="主题模式"
              description="跟随系统时监听 Windows 明暗变化并实时切换；深色/浅色是手动偏好。"
            >
              <SegmentedControl
                label="主题模式"
                options={THEME_OPTIONS}
                value={themeMode}
                onChange={changeTheme}
              />
            </SettingRow>
            <SettingRow
              title="减少动效"
              description="开启后预览只播放一次、不循环；系统 prefers-reduced-motion 也会被识别。"
            >
              <Switch
                label="减少动效"
                checked={reduceMotion}
                onChange={changeReduceMotion}
                description=""
              />
            </SettingRow>
            <SettingRow
              title="面板宽度"
              description={`左栏 ${leftWidth}px · 中栏 ${middleWidth}px；拖动分隔条会实时保存。`}
            >
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={12} strokeWidth={2} />}
                onClick={restoreLayout}
              >
                恢复默认
              </Button>
            </SettingRow>
          </Card>

          <Card className="bg-raised px-4 py-2">
            <div className="label-eyebrow py-2">数据通路</div>
            <SettingRow
              title="本地数据库"
              description="应用启动时自动建库并执行版本迁移；数据文件位于应用数据目录。"
            >
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw size={12} strokeWidth={2} />}
                onClick={() => {
                  appInfo.refetch();
                  settings.refetch();
                }}
              >
                重新读取
              </Button>
            </SettingRow>
            <div className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <Database size={13} strokeWidth={1.7} aria-hidden />
                <span className="font-mono text-2xs">{appInfo.data?.dbPath ?? "读取中…"}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-faint">
                <span>案例 {appInfo.data?.caseCount ?? 0} 条</span>
                <span>平台 {appInfo.data?.platform ?? "—"}</span>
                <span>目录 {appInfo.data?.dataDir ?? "—"}</span>
              </div>
              {appInfo.isError ? (
                <p className="text-2xs text-danger">读取失败：{appInfo.error.message}</p>
              ) : null}
            </div>

            <div className="border-t border-line py-3">
              <div className="text-sm font-medium text-ink">写入并读回一条设置</div>
              <p className="mt-0.5 text-xs leading-normal text-ink-faint">
                写入 settings 表后立即可读回；重启应用后该值仍然存在。
              </p>
              <div className="mt-2.5 flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Input
                    aria-label="备注内容"
                    placeholder="输入一段备注，例如 1.0.0 首装验收"
                    value={noteDraft ?? storedNote}
                    maxLength={120}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveNote();
                    }}
                  />
                </div>
                <Button size="sm" variant="primary" onClick={saveNote}>
                  写入
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RefreshCw size={12} strokeWidth={2} />}
                  onClick={reloadNote}
                >
                  读回
                </Button>
              </div>
              <div
                className={cn(
                  "mt-2 rounded-xs border border-line bg-sunken px-2 py-1.5 font-mono text-2xs",
                  noteStatus ? "text-ink-soft" : "text-ink-faint",
                )}
              >
                {noteStatus ?? `当前库中值：${storedNote ? `“${storedNote}”` : "（空）"}`}
              </div>
            </div>
          </Card>

          <Card className="bg-raised px-4 py-2">
            <div className="label-eyebrow py-2">尚未实现（禁用并说明原因）</div>
            <SettingRow
              title="导出备份"
              description="备份导出依赖 assets 对象库与归档格式，Phase 1 未实现，入口保持禁用。"
            >
              <Tooltip content="需要备份格式与还原校验，Phase 1 未实现，因此禁用">
                <span tabIndex={0}>
                  <Button size="sm" variant="secondary" disabled icon={<Download size={12} strokeWidth={2} />}>
                    导出
                  </Button>
                </span>
              </Tooltip>
            </SettingRow>
            <SettingRow
              title="从文件还原"
              description="还原会覆盖本地数据，需要校验与事务设计，Phase 1 未实现。"
            >
              <Tooltip content="还原流程尚未实现，禁用避免误覆盖数据">
                <span tabIndex={0}>
                  <Button size="sm" variant="secondary" disabled icon={<Upload size={12} strokeWidth={2} />}>
                    还原
                  </Button>
                </span>
              </Tooltip>
            </SettingRow>
            <SettingRow title="检查更新" description="尚未接入发布通道，Phase 1 不联网检查版本。">
              <Tooltip content="未接入更新服务，禁用">
                <span tabIndex={0}>
                  <Button size="sm" variant="secondary" disabled>
                    检查更新
                  </Button>
                </span>
              </Tooltip>
            </SettingRow>
          </Card>

          <Card className="bg-raised px-4 py-2">
            <div className="label-eyebrow py-2">关于 / 开源许可</div>
            <div className="border-b border-line py-3">
              <div className="text-sm font-semibold tracking-[0.08em] text-ink">界序 INTERFACE</div>
              <p className="mt-0.5 text-xs leading-normal text-ink-faint">
                版本 {appInfo.data?.appVersion ?? "1.0.1"} · 本项目以 MIT 许可证发布；全部示例案例与演示为自绘。
              </p>
              <p className="mt-1 text-2xs leading-normal text-ink-faint">
                依赖白名单：{LICENSE_POLICY.allowed.join(" / ")}；禁止 {LICENSE_POLICY.forbidden.join(" / ")}。
                可通过 npm run check:licenses 复跑。
              </p>
            </div>
            <ul className="divide-y divide-line">
              {LICENSE_ENTRIES.map((entry) => (
                <li key={entry.name} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-meta text-ink-soft">{entry.name}</span>
                  <span className="shrink-0 font-mono text-2xs text-ink">{entry.license}</span>
                  <span className="hidden shrink-0 text-2xs text-ink-faint sm:inline">{entry.note}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line py-2 text-2xs leading-normal text-ink-faint">
              完整版权与许可证原文见仓库根目录 THIRD_PARTY_NOTICES.md 与 LICENSE。
              字体仅使用系统字体栈，安装包内未打包任何字体文件。
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
