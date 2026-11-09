import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Compass,
  Database,
  Download,
  Info,
  Keyboard,
  LayoutPanelLeft,
  Monitor,
  Moon,
  PackageOpen,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { AiSettingsSection } from "@/features/settings/AiSection";
import { ContentPackagesSection } from "@/features/settings/ContentPackagesSection";
import { useAppInfo, useSetSetting, useSettings } from "@/features/settings/api";
import { DEFAULT_LAYOUT, SETTINGS_KEYS } from "@/lib/constants";
import { LICENSE_ENTRIES, LICENSE_POLICY } from "@/lib/licenses";
import { SHORTCUT_ENTRIES } from "@/lib/shortcuts";
import { useUiStore } from "@/stores/uiStore";

const THEME_OPTIONS = [
  { value: "system", label: "跟随系统", icon: <Monitor size={12} strokeWidth={1.8} aria-hidden /> },
  { value: "dark", label: "深色", icon: <Moon size={12} strokeWidth={1.8} aria-hidden /> },
  { value: "light", label: "浅色", icon: <Sun size={12} strokeWidth={1.8} aria-hidden /> },
] as const;

type SettingsSectionId =
  | "appearance"
  | "ai"
  | "shortcuts"
  | "onboarding"
  | "layout"
  | "content"
  | "storage"
  | "backup"
  | "about";

interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
}

interface SettingsGroup {
  id: string;
  label: string;
  sections: SettingsSection[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "preferences",
    label: "偏好",
    sections: [
      {
        id: "appearance",
        label: "外观与主题",
        title: "外观与主题",
        description: "主题默认跟随系统；手动选择后不再跟随。偏好写入本地 settings 表。",
        icon: Palette,
        keywords: ["主题", "深色", "浅色", "系统", "外观", "颜色", "动效", "动画"],
      },
      {
        id: "layout",
        label: "布局与面板",
        title: "布局与面板",
        description: "左栏与中栏宽度实时保存；窗口最小宽度 1000px，避免内容被压到不可读。",
        icon: LayoutPanelLeft,
        keywords: ["布局", "面板", "宽度", "左栏", "中栏", "恢复", "默认", "窗口"],
      },
      {
        id: "shortcuts",
        label: "快捷键",
        title: "快捷键",
        description: "只读展示当前版本实际生效的按键；命令面板与全局快捷键共用这一份口径。",
        icon: Keyboard,
        keywords: ["快捷键", "键盘", "命令面板", "Ctrl", "Esc", "搜索", "新建", "导出"],
      },
      {
        id: "onboarding",
        label: "使用引导",
        title: "使用引导",
        description: "三段说明：案例存的是什么、三栏各管什么、参数改动如何生效并保存。首次启动自动出现一次，之后可在这里重新打开。",
        icon: Compass,
        keywords: ["引导", "新手", "教程", "首次", "onboarding", "三栏", "参数"],
      },
      {
        id: "ai",
        label: "AI 接线",
        title: "AI 接线",
        description: "自带 Key（BYOK）连接模型与搜索服务；Key 存储于 Windows 凭据管理器，不写入数据库、不写入日志、不随导出包导出。",
        icon: Sparkles,
        keywords: ["AI", "模型", "搜索", "Key", "密钥", "凭据", "BYOK", "Tavily", "Brave", "Bing", "Ollama", "接口", "测试", "导出"],
      },
    ],
  },
  {
    id: "data",
    label: "数据",
    sections: [
      {
        id: "content",
        label: "内容包",
        title: "内容包",
        description: "签名 zip 内容包：本地导入即装，在线地址可选；更新按版本合并，卸载不伤自建数据。",
        icon: PackageOpen,
        keywords: ["内容包", "素材包", "导入", "在线", "更新", "卸载", "签名", "zip", "manifest", "哈希"],
      },
      {
        id: "storage",
        label: "存储与数据库",
        title: "存储与数据库",
        description: "案例保存在本机 SQLite；启动时自动建库并执行版本迁移，不联网。",
        icon: Database,
        keywords: ["数据库", "存储", "sqlite", "路径", "条数", "迁移", "本地"],
      },
      {
        id: "backup",
        label: "备份与更新",
        title: "备份与更新",
        description: "备份、还原与更新检查尚未接入，入口保持禁用并标注原因。",
        icon: Download,
        keywords: ["备份", "导出", "还原", "更新", "检查", "版本"],
      },
    ],
  },
  {
    id: "about",
    label: "关于",
    sections: [
      {
        id: "about",
        label: "关于界序",
        title: "关于界序",
        description: "版本信息、数据位置与第三方开源许可。",
        icon: Info,
        keywords: ["关于", "版本", "许可", "license", "开源", "版权"],
      },
    ],
  },
];

const ALL_SECTIONS = SETTINGS_GROUPS.flatMap((group) => group.sections);

function matchesQuery(section: SettingsSection, query: string): boolean {
  const haystack = [section.label, section.title, section.description, ...section.keywords]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <h2 className="settings-card-title">{title}</h2>
        {description ? <p className="settings-card-desc">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description?: ReactNode;
  control?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-title">{title}</div>
        {description ? <div className="settings-row-desc">{description}</div> : null}
      </div>
      {control ? <div className="settings-row-control">{control}</div> : null}
    </div>
  );
}

function UnavailableControl({ label = "未接入" }: { label?: string }) {
  return (
    <>
      <span className="settings-row-value">{label}</span>
      <ChevronRight size={15} strokeWidth={1.8} aria-hidden />
    </>
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
  const openOnboarding = useUiStore((state) => state.openOnboarding);

  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState<SettingsSectionId>("appearance");
  const storedNote = settings.data?.[SETTINGS_KEYS.note] ?? "";
  const onboardingRecord = settings.data?.[SETTINGS_KEYS.onboarding] ?? null;
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((group) => ({
      ...group,
      sections: group.sections.filter((section) => matchesQuery(section, normalizedQuery)),
    })).filter((group) => group.sections.length > 0);
  }, [normalizedQuery]);

  const activeSection = ALL_SECTIONS.find((section) => section.id === sectionId) ?? ALL_SECTIONS[0];

  // 输入搜索词后，如果当前分区被过滤掉，就落到第一个命中项，避免左栏无选中项而右栏停在旧内容
  const changeQuery = (next: string) => {
    setQuery(next);
    const normalized = next.trim().toLowerCase();
    if (!normalized) return;
    const visibleSections = ALL_SECTIONS.filter((section) => matchesQuery(section, normalized));
    if (visibleSections.length === 0) return;
    setSectionId((current) =>
      visibleSections.some((section) => section.id === current) ? current : visibleSections[0].id,
    );
  };

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

  const refreshData = () => {
    appInfo.refetch();
    settings.refetch();
  };

  const sectionContent = (() => {
    switch (activeSection.id) {
      case "appearance":
        return (
          <>
            <SettingCard title="主题" description="跟随系统时监听 Windows 明暗变化并实时切换。">
              <SettingRow
                title="主题模式"
                description="深色 / 浅色是手动偏好；选择后不再跟随系统。"
                control={
                  <SegmentedControl
                    label="主题模式"
                    options={THEME_OPTIONS}
                    value={themeMode}
                    onChange={changeTheme}
                  />
                }
              />
            </SettingCard>
            <SettingCard title="动效" description="减少装饰性动画，内容本身的预览仍会播放一次。">
              <SettingRow
                title="减少动效"
                description="预览只播放一次、不循环；系统 prefers-reduced-motion 也会被识别。"
                control={
                  <Switch
                    compact
                    label="减少动效"
                    checked={reduceMotion}
                    onChange={changeReduceMotion}
                  />
                }
              />
            </SettingCard>
          </>
        );
      case "shortcuts":
        return (
          <>
            <SettingCard
              title="键盘快捷键"
              description="只读展示；都是应用内按键，不注册系统级全局热键。焦点在输入框里时单键快捷键不抢键，命令面板打开时其余按键不向下传。"
            >
              <table className="shortcut-table">
                <thead>
                  <tr>
                    <th scope="col">按键</th>
                    <th scope="col">动作</th>
                    <th scope="col">生效范围</th>
                    <th scope="col">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {SHORTCUT_ENTRIES.map((entry) => (
                    <tr key={`${entry.keys.join("+")}-${entry.label}`}>
                      <td>
                        <span className="shortcut-keys">
                          {entry.keys.map((key) => (
                            <kbd key={key} className="shortcut-key">
                              {key}
                            </kbd>
                          ))}
                        </span>
                      </td>
                      <td className="shortcut-label">{entry.label}</td>
                      <td className="shortcut-scope">{entry.scope}</td>
                      <td className="shortcut-note">{entry.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SettingCard>
          </>
        );
      case "onboarding":
        return (
          <>
            <SettingCard
              title="首次使用引导"
              description="首次启动自动出现一次；跳过或看完都会写入标记，不会再次弹出。"
            >
              <SettingRow
                title="重新查看引导"
                description="三段：这里的案例是什么、三栏各管什么、参数改动如何生效并保存。只讲怎么用。"
                control={
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Compass size={12} strokeWidth={2} aria-hidden />}
                    onClick={openOnboarding}
                  >
                    打开引导
                  </Button>
                }
              />
              <SettingRow
                title="记录状态"
                description={`标记键 ${SETTINGS_KEYS.onboarding}，写入本地 settings 表。`}
                control={
                  <span className="settings-row-value">
                    {onboardingRecord === "v1:done"
                      ? "已看完"
                      : onboardingRecord === "v1:skipped"
                        ? "已跳过"
                        : "未记录"}
                  </span>
                }
              />
            </SettingCard>
          </>
        );
      case "ai":
        return <AiSettingsSection />;
      case "content":
        return <ContentPackagesSection />;
      case "layout":
        return (
          <>
            <SettingCard title="面板宽度" description="拖动分隔条会实时保存；恢复默认只影响左栏与中栏。">
              <SettingRow
                title="左栏宽度"
                description="范围 196–320px。"
                control={<span className="settings-row-value">{leftWidth}px</span>}
              />
              <SettingRow
                title="中栏宽度"
                description="范围 300–560px；详情栏自动占满剩余空间。"
                control={<span className="settings-row-value">{middleWidth}px</span>}
              />
              <SettingRow
                title="恢复默认布局"
                description={`左栏 ${DEFAULT_LAYOUT.leftWidth}px、中栏 ${DEFAULT_LAYOUT.middleWidth}px。`}
                control={
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw size={12} strokeWidth={2} />}
                    onClick={restoreLayout}
                  >
                    恢复默认
                  </Button>
                }
              />
            </SettingCard>
            <SettingCard title="窗口行为" description="这些值固定，不提供修改入口。">
              <SettingRow
                title="最小窗口宽度"
                description="低于 1000px 三栏会挤压内容，因此不再允许继续缩小。"
                control={<span className="settings-row-value">1000px</span>}
              />
              <SettingRow
                title="内嵌标题栏"
                description="拖动标题栏可移动窗口，双击可最大化 / 还原。"
                control={<span className="settings-row-value">已启用</span>}
              />
            </SettingCard>
          </>
        );
      case "storage":
        return (
          <>
            <SettingCard
              title="本地数据库"
              description="启动时自动建库并执行版本迁移；数据文件位于应用数据目录。"
            >
              <SettingRow
                title="数据库状态"
                description={
                  appInfo.isError ? `读取失败：${appInfo.error.message}` : "SQLite · 本地模式 · 不联网"
                }
                control={
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw size={12} strokeWidth={2} />}
                    onClick={refreshData}
                  >
                    重新读取
                  </Button>
                }
              />
              <div className="settings-row-block">
                <div className="settings-row-title">数据库文件</div>
                <div className="settings-readout">{appInfo.data?.dbPath ?? "读取中…"}</div>
                <div className="settings-field-row">
                  <span className="settings-row-value">案例 {appInfo.data?.caseCount ?? 0} 条</span>
                  <span className="settings-row-value">平台 {appInfo.data?.platform ?? "—"}</span>
                </div>
              </div>
            </SettingCard>
            <SettingCard
              title="设置写入自检"
              description="写入 settings 表后立即可读回；重启应用后该值仍然存在。"
            >
              <div className="settings-row-block">
                <div className="settings-row-title">备注值</div>
                <div className="settings-field-row">
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label="备注内容"
                      placeholder="输入一段备注，例如 1.0.3 首装验收"
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
                <div className="settings-readout">
                  {noteStatus ?? `当前库中值：${storedNote ? `“${storedNote}”` : "（空）"}`}
                </div>
              </div>
            </SettingCard>
          </>
        );
      case "backup":
        return (
          <>
            <SettingCard
              title="备份与还原"
              description="依赖归档格式与还原校验，Phase 1 未实现，入口保持禁用。"
            >
              <SettingRow
                title="导出备份"
                description="需要 assets 对象库与归档格式，当前版本不生成备份文件。"
                control={<UnavailableControl />}
              />
              <SettingRow
                title="从文件还原"
                description="还原会覆盖本地数据，需要校验与事务设计，当前版本不提供。"
                control={<UnavailableControl />}
              />
            </SettingCard>
            <SettingCard title="更新" description="尚未接入发布通道，不联网检查版本。">
              <SettingRow
                title="检查更新"
                description="安装包升级路径已按覆盖安装处理；应用内检查更新尚未接入。"
                control={<UnavailableControl />}
              />
            </SettingCard>
          </>
        );
      case "about":
        return (
          <>
            <SettingCard title="版本" description="安装包与程序版本保持一致。">
              <SettingRow
                title="当前版本"
                description="发布时附带安装包与 SHA256 校验和。"
                control={
                  <span className="settings-row-value">
                    v{appInfo.data?.appVersion ?? "1.0.3"}
                  </span>
                }
              />
              <SettingRow
                title="运行平台"
                description="当前仅发布 Windows x64 安装包。"
                control={<span className="settings-row-value">{appInfo.data?.platform ?? "—"}</span>}
              />
              <SettingRow
                title="案例总数"
                description="统计口径为未软删除的全部案例。"
                control={<span className="settings-row-value">{appInfo.data?.caseCount ?? 0}</span>}
              />
              <div className="settings-row-block">
                <div className="settings-row-title">数据目录</div>
                <div className="settings-readout">{appInfo.data?.dataDir ?? "读取中…"}</div>
              </div>
            </SettingCard>
            <SettingCard
              title="开源许可"
              description={`依赖白名单：${LICENSE_POLICY.allowed.join(" / ")}；禁止 ${LICENSE_POLICY.forbidden.join(" / ")}。可通过 npm run check:licenses 复跑。`}
            >
              <ul className="settings-license-list">
                {LICENSE_ENTRIES.map((entry) => (
                  <li key={entry.name} className="settings-license-row">
                    <span className="settings-license-name">{entry.name}</span>
                    <span className="settings-license-spdx">{entry.license}</span>
                    <span className="settings-license-note">{entry.note}</span>
                  </li>
                ))}
              </ul>
              <p className="settings-footnote">
                完整版权与许可证原文见仓库根目录 THIRD_PARTY_NOTICES.md 与 LICENSE。字体仅使用系统字体栈，安装包内未打包任何字体文件。
              </p>
            </SettingCard>
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <section className="settings-view">
      <aside className="settings-rail" aria-label="设置分区">
        <div className="settings-rail-head">
          <div className="settings-search">
            <Search size={14} strokeWidth={1.8} aria-hidden />
            <input
              type="search"
              data-search-input
              value={query}
              aria-label="搜索设置"
              placeholder="搜索设置"
              onChange={(event) => changeQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="settings-search-clear"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
              >
                <X size={12} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <nav className="settings-rail-nav" aria-label="设置分组">
          {filteredGroups.length === 0 ? (
            <p className="settings-rail-empty">没有匹配的设置</p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.id} className="settings-rail-group">
                <div className="settings-rail-label">{group.label}</div>
                {group.sections.map((section) => {
                  const Icon = section.icon;
                  const active = section.id === sectionId;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={active ? "settings-rail-item is-active" : "settings-rail-item"}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setSectionId(section.id)}
                    >
                      <Icon size={15} strokeWidth={1.7} aria-hidden />
                      <span>{section.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </nav>
      </aside>

      <div
        id="content-list"
        tabIndex={-1}
        className="settings-content focus-visible:outline-none"
      >
        <div className="settings-content-inner">
          <header className="settings-page-head">
            <h1 className="settings-page-title">{activeSection.title}</h1>
            <p className="settings-page-desc">{activeSection.description}</p>
          </header>
          <div className="settings-section">{sectionContent}</div>
        </div>
      </div>
    </section>
  );
}
