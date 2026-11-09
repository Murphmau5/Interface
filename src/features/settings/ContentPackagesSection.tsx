import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Link2, PackageOpen, RefreshCw, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  useContentPackageImport,
  useContentPackageInstallUrl,
  useContentPackageUninstall,
  useContentPackages,
  useSetSetting,
  useSettings,
} from "@/features/settings/api";
import { SETTINGS_KEYS } from "@/lib/constants";
import type { ContentPackageImportReport, ContentPackageStats } from "@/lib/ipc";
import { formatDateTime } from "@/lib/utils";

type Status = { tone: "ok" | "error"; text: string };

function statsText(stats: ContentPackageStats): string {
  const parts = [
    stats.created ? `新增 ${stats.created}` : "",
    stats.updated ? `更新 ${stats.updated}` : "",
    stats.unchanged ? `无变化 ${stats.unchanged}` : "",
    stats.skippedModified ? `保留用户改动 ${stats.skippedModified}` : "",
    stats.skippedDeleted ? `跳过已删除 ${stats.skippedDeleted}` : "",
    stats.removed ? `移除 ${stats.removed}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "没有条目需要变化";
}

function errorText(error: Error): string {
  const code = (error as { code?: string }).code;
  return code ? `${error.message}（${code}）` : error.message;
}

function reportText(report: ContentPackageImportReport): string {
  const suffix = report.itemsTruncated ? "（条目详情已截断，统计完整）" : "";
  return `${report.package.name} v${report.package.version} 已安装：${statsText(
    report.stats,
  )}${suffix}`;
}

/** 内容包：本地导入独立可用；在线地址只是可选补充。 */
export function ContentPackagesSection() {
  const settings = useSettings();
  const setSetting = useSetSetting();
  const packages = useContentPackages();
  const importPackage = useContentPackageImport();
  const installUrl = useContentPackageInstallUrl();
  const uninstall = useContentPackageUninstall();

  const [status, setStatus] = useState<Status | null>(null);
  const [path, setPath] = useState("");
  const [feedDraft, setFeedDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const importRef = useRef(importPackage.mutate);

  const feedUrl = settings.data?.[SETTINGS_KEYS.contentFeedUrl] ?? "";
  const feedValue = feedDraft ?? feedUrl;

  useEffect(() => {
    importRef.current = importPackage.mutate;
  }, [importPackage.mutate]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const window_ = getCurrentWebviewWindow();
        const off = await window_.onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          const zip = event.payload.paths.find((item) => item.toLowerCase().endsWith(".zip"));
          if (!zip) {
            setStatus({ tone: "error", text: "请拖入 .zip 内容包文件" });
            return;
          }
          importRef.current(zip, {
            onSuccess: (report) => {
              setStatus({ tone: "ok", text: reportText(report) });
              setPath("");
            },
            onError: (error) => setStatus({ tone: "error", text: errorText(error) }),
          });
        });
        if (disposed) {
          off();
        } else {
          unlisten = off;
        }
      } catch {
        setStatus({
          tone: "error",
          text: "当前环境不支持文件拖拽；请填写内容包路径后导入。",
        });
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const runImport = () => {
    const value = path.trim();
    if (!value) {
      setStatus({ tone: "error", text: "请先填写内容包文件的完整路径" });
      return;
    }
    importPackage.mutate(value, {
      onSuccess: (report) => {
        setStatus({ tone: "ok", text: reportText(report) });
        setPath("");
      },
      onError: (error) => setStatus({ tone: "error", text: errorText(error) }),
    });
  };

  const saveFeed = () => {
    setSetting.mutate(
      { key: SETTINGS_KEYS.contentFeedUrl, value: feedValue.trim() },
      {
        onSuccess: () => {
          setFeedDraft(null);
          setStatus({
            tone: "ok",
            text: feedValue.trim() ? "在线地址已保存" : "在线地址已清空，本地导入不受影响",
          });
        },
        onError: (error) => setStatus({ tone: "error", text: errorText(error) }),
      },
    );
  };

  const runOnlineInstall = () => {
    installUrl.mutate(feedValue.trim() || undefined, {
      onSuccess: (report) => setStatus({ tone: "ok", text: reportText(report) }),
      onError: (error) => setStatus({ tone: "error", text: errorText(error) }),
    });
  };

  const runUninstall = (packageId: string) => {
    if (confirming !== packageId) {
      setConfirming(packageId);
      return;
    }
    setConfirming(null);
    uninstall.mutate(packageId, {
      onSuccess: (report) => {
        const kept = report.keptModified + report.keptFavorite;
        setStatus({
          tone: "ok",
          text:
            kept > 0
              ? `已卸载，移除 ${report.removed} 条；保留 ${report.keptModified} 条用户改动、${report.keptFavorite} 条收藏，并已解除绑定`
              : `已卸载，移除 ${report.removed} 条`,
        });
      },
      onError: (error) => setStatus({ tone: "error", text: errorText(error) }),
    });
  };

  const busy = importPackage.isPending || installUrl.isPending || uninstall.isPending;

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          <h2 className="settings-card-title">本地导入</h2>
          <p className="settings-card-desc">
            签名 zip 内容包；拖到窗口或填写路径即可安装，不需要任何在线服务。
          </p>
        </div>
        <div className="settings-dropzone">把 .zip 内容包拖到此窗口</div>
        <div className="settings-row-block">
          <div className="settings-row-title">内容包文件路径</div>
          <div className="settings-field-row">
            <div className="min-w-0 flex-1">
              <Input
                aria-label="内容包文件路径"
                placeholder="例如 D:\\下载\\jiexu-demo-1.0.0.zip"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") runImport();
                }}
              />
            </div>
            <Button
              size="sm"
              variant="primary"
              icon={<Upload size={12} strokeWidth={2} />}
              disabled={busy}
              onClick={runImport}
            >
              导入
            </Button>
          </div>
          <div className={status?.tone === "error" ? "settings-readout is-error" : "settings-readout"}>
            {status?.text ?? "manifest、逐文件哈希、签名、路径与可执行文件都会在写入前校验。"}
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h2 className="settings-card-title">在线地址</h2>
          <p className="settings-card-desc">
            可选。配置后可从固定地址拉取更新；留空也能完整使用本地导入。
          </p>
        </div>
        <div className="settings-row-block">
          <div className="settings-row-title">内容包地址</div>
          <div className="settings-field-row">
            <div className="min-w-0 flex-1">
              <Input
                aria-label="在线内容包地址"
                placeholder="https://example.com/packages/demo.zip"
                value={feedValue}
                onChange={(event) => setFeedDraft(event.target.value)}
              />
            </div>
            <Button size="sm" variant="secondary" disabled={busy} onClick={saveFeed}>
              保存地址
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Link2 size={12} strokeWidth={2} />}
              disabled={busy}
              onClick={runOnlineInstall}
            >
              在线安装
            </Button>
          </div>
          <p className="settings-footnote-inline">
            下载只接受 http / https，逐跳校验重定向；下载后仍走与本地导入相同的 manifest、哈希与签名校验。
          </p>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <div className="settings-field-row">
            <h2 className="settings-card-title" style={{ flex: 1 }}>
              已安装内容包
            </h2>
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={12} strokeWidth={2} />}
              onClick={() => packages.refetch()}
            >
              刷新
            </Button>
          </div>
          <p className="settings-card-desc">
            卸载只移除该包带来且未被改动的条目；用户改过、收藏过或自建的案例会保留并解除绑定。
          </p>
        </div>
        {packages.isLoading ? (
          <div className="settings-row-block">
            <div className="settings-readout">读取已安装内容包…</div>
          </div>
        ) : packages.isError ? (
          <div className="settings-row-block">
            <div className="settings-readout is-error">
              读取失败：{packages.error.message}
            </div>
          </div>
        ) : (packages.data?.length ?? 0) === 0 ? (
          <div className="settings-row-block">
            <div className="settings-readout">
              <span className="inline-flex items-center gap-2">
                <PackageOpen size={13} strokeWidth={1.8} aria-hidden />
                尚未安装内容包
              </span>
            </div>
          </div>
        ) : (
          <ul className="settings-package-list">
            {packages.data?.map((item) => (
              <li key={item.id} className="settings-package-row">
                <div className="settings-package-main">
                  <span className="settings-package-name">{item.name}</span>
                  <span className="settings-package-meta">
                    v{item.version} · {item.itemCount} 条 · {item.source === "online" ? "在线" : "本地"} ·{" "}
                    {formatDateTime(item.installedAt)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={confirming === item.id ? "primary" : "secondary"}
                  icon={<Trash2 size={12} strokeWidth={2} />}
                  disabled={busy}
                  onClick={() => runUninstall(item.id)}
                >
                  {confirming === item.id ? "确认移除" : "卸载"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
