import { useState, type ReactNode } from "react";
import { KeyRound, Plug, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  useAiConfigExport,
  useAiCredentialClear,
  useAiCredentialSet,
  useAiProviderSet,
  useAiSearchSet,
  useAiSettings,
  useAiTestConnection,
} from "@/features/settings/api";
import type { AiAuthMode, AiScope } from "@/lib/ipc";

// AI 接线文案集中词条：涉及凭据安全红线的表述只允许这一处来源
const AI_COPY = {
  providerCardTitle: "模型服务",
  providerCardDesc: "OpenAI 兼容端点；认证方式选「无认证」时可用于 Ollama 等本地模型。",
  searchCardTitle: "搜索服务",
  searchCardDesc: "四类服务各按官方接口测试连通性；地址留空表示未配置，允许保存但不允许测试。",
  keyCardTitle: "密钥",
  keyCardDesc:
    "Key 存储于 Windows 凭据管理器：不写入数据库、不写入日志、不随导出包导出。同用户权限的进程仍可能读取，这不是加密保护。",
  keyPlaceholder: "粘贴 Key 后保存；保存后仅展示末四位",
  testCardTitle: "连接测试",
  testCardDesc: "按已保存的配置发起一次真实的最小请求（max_tokens = 1）；可能产生极小用量。",
  exportCardTitle: "配置导出",
  exportCardDesc: "导出仅包含白名单字段，密钥字段恒为空字符串。",
  testModel: "测试模型",
  testSearch: "测试搜索",
  exportConfig: "导出配置",
  statusUnconfigured: "未配置",
  statusConfiguredPrefix: "已配置（••••",
  saveProvider: "保存模型服务",
  saveSearch: "保存搜索服务",
  clear: "清除",
  baseUrlLabel: "服务地址",
  modelLabel: "模型名",
  authLabel: "认证方式",
  providerLabel: "搜索服务",
  timeoutLabel: "请求超时",
  tokensLabel: "最大输出",
  modelKeyTitle: "模型 Key",
  searchKeyTitle: "搜索 Key",
} as const;

const AUTH_MODE_OPTIONS = [
  { value: "bearer", label: "Bearer Key" },
  { value: "none", label: "无认证" },
] as const;

const SEARCH_PROVIDER_OPTIONS = [
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave" },
  { value: "bing", label: "Bing" },
  { value: "custom", label: "自定义" },
] as const;

interface CredentialMeta {
  configured: boolean;
  last4: string;
  updatedAt: string | null;
}

function credentialLabel(status: CredentialMeta | undefined): string {
  if (!status?.configured) return AI_COPY.statusUnconfigured;
  return `${AI_COPY.statusConfiguredPrefix}${status.last4}）`;
}

function AiCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
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

function AiRow({
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

function KeyRow({
  scope,
  title,
  status,
}: {
  scope: AiScope;
  title: string;
  status: CredentialMeta | undefined;
}) {
  const credentialSet = useAiCredentialSet();
  const credentialClear = useAiCredentialClear();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    const value = draft.trim();
    if (!value) {
      setMessage("请先粘贴 Key");
      return;
    }
    credentialSet.mutate(
      { scope, key: value },
      {
        onSuccess: (result) => {
          setDraft("");
          setMessage(`已保存：${credentialLabel(result)}`);
        },
        onError: (error) => setMessage(`保存失败：${error.message}`),
      },
    );
  };

  const clear = () => {
    credentialClear.mutate(scope, {
      onSuccess: () => setMessage("已清除凭据"),
      onError: (error) => setMessage(`清除失败：${error.message}`),
    });
  };

  return (
    <div className="settings-row-block">
      <div className="settings-field-row">
        <div className="settings-row-title">{title}</div>
        <span className="settings-row-value">{credentialLabel(status)}</span>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 size={12} strokeWidth={2} />}
          disabled={!status?.configured || credentialClear.isPending}
          onClick={clear}
        >
          {AI_COPY.clear}
        </Button>
      </div>
      <div className="settings-field-row">
        <div className="min-w-0 flex-1">
          <Input
            aria-label={`${title}输入`}
            type="password"
            autoComplete="off"
            placeholder={AI_COPY.keyPlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<KeyRound size={12} strokeWidth={2} />}
          disabled={credentialSet.isPending || draft.trim().length === 0}
          onClick={save}
        >
          保存 Key
        </Button>
      </div>
      {status?.updatedAt ? (
        <div className="settings-row-desc">更新于 {status.updatedAt}</div>
      ) : null}
      {message ? <div className="settings-readout">{message}</div> : null}
    </div>
  );
}

export function AiSettingsSection() {
  const settings = useAiSettings();
  const providerSet = useAiProviderSet();
  const searchSet = useAiSearchSet();
  const testConnection = useAiTestConnection();
  const configExport = useAiConfigExport();

  const data = settings.data;
  const [providerDraft, setProviderDraft] = useState<{
    baseUrl: string;
    model: string;
    authMode: AiAuthMode;
  } | null>(null);
  const [searchDraft, setSearchDraft] = useState<{
    providerId: string;
    baseUrl: string;
    authMode: AiAuthMode;
  } | null>(null);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [exportedJson, setExportedJson] = useState<string | null>(null);

  // 草稿只存「用户改动」；未改动时直接跟随查询结果，避免用 effect 同步状态
  const providerValues = providerDraft ?? (data
    ? {
        baseUrl: data.provider.baseUrl,
        model: data.provider.model,
        authMode: data.provider.authMode,
      }
    : null);
  const searchValues = searchDraft ?? (data
    ? {
        providerId: data.search.providerId,
        baseUrl: data.search.baseUrl,
        authMode: data.search.authMode,
      }
    : null);

  const saveProvider = () => {
    if (!data || !providerValues) return;
    providerSet.mutate(
      {
        ...data.provider,
        baseUrl: providerValues.baseUrl,
        model: providerValues.model,
        authMode: providerValues.authMode,
      },
      {
        onSuccess: (normalized) => {
          setProviderDraft({
            baseUrl: normalized.baseUrl,
            model: normalized.model,
            authMode: normalized.authMode,
          });
          setProviderStatus("已保存（地址已按规则规范化）");
        },
        onError: (error) => setProviderStatus(`保存失败：${error.message}`),
      },
    );
  };

  const saveSearch = () => {
    if (!data || !searchValues) return;
    searchSet.mutate(
      {
        ...data.search,
        providerId: searchValues.providerId,
        baseUrl: searchValues.baseUrl,
        authMode: searchValues.authMode,
      },
      {
        onSuccess: (normalized) => {
          setSearchDraft({
            providerId: normalized.providerId,
            baseUrl: normalized.baseUrl,
            authMode: normalized.authMode,
          });
          setSearchStatus("已保存");
        },
        onError: (error) => setSearchStatus(`保存失败：${error.message}`),
      },
    );
  };

  const runTest = (scope: AiScope) => {
    testConnection.mutate(scope, {
      onSuccess: (result) => {
        const latency = `${result.latencyMs}ms`;
        const http = result.httpStatus === null ? "—" : String(result.httpStatus);
        const text = result.ok
          ? `连接成功 · ${latency} · HTTP ${http}`
          : `${result.message}（${result.code}，HTTP ${http}，${latency}）`;
        if (scope === "model") {
          setProviderStatus(text);
        } else {
          setSearchStatus(text);
        }
      },
      onError: (error) => {
        if (scope === "model") {
          setProviderStatus(`测试失败：${error.message}`);
        } else {
          setSearchStatus(`测试失败：${error.message}`);
        }
      },
    });
  };

  const runExport = () => {
    configExport.mutate(undefined, {
      onSuccess: (result) => setExportedJson(JSON.stringify(result, null, 2)),
      onError: (error) => setExportedJson(`导出失败：${error.message}`),
    });
  };

  const testButtonText = (scope: AiScope) =>
    scope === "model" ? AI_COPY.testModel : AI_COPY.testSearch;

  return (
    <>
      <AiCard title={AI_COPY.providerCardTitle} description={AI_COPY.providerCardDesc}>
        <div className="settings-row-block">
          <div className="settings-field-row">
            <div className="min-w-0 flex-1">
              <Input
                aria-label={AI_COPY.baseUrlLabel}
                placeholder="https://api.example.com/v1（本地模型可用 http://127.0.0.1:11434）"
                value={providerValues?.baseUrl ?? ""}
                onChange={(event) =>
                  setProviderDraft((current) => ({
                    ...(current ??
                      providerValues ?? { baseUrl: "", model: "", authMode: "bearer" as AiAuthMode }),
                    baseUrl: event.target.value,
                  }))
                }
              />
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={!data || providerSet.isPending}
              onClick={saveProvider}
            >
              {AI_COPY.saveProvider}
            </Button>
          </div>
          <div className="settings-field-row">
            <div className="min-w-0 flex-1">
              <Input
                aria-label={AI_COPY.modelLabel}
                placeholder="模型名，例如 qwen2.5:7b"
                value={providerValues?.model ?? ""}
                onChange={(event) =>
                  setProviderDraft((current) => ({
                    ...(current ??
                      providerValues ?? { baseUrl: "", model: "", authMode: "bearer" as AiAuthMode }),
                    model: event.target.value,
                  }))
                }
              />
            </div>
            <SegmentedControl
              label={AI_COPY.authLabel}
              options={AUTH_MODE_OPTIONS}
              value={providerValues?.authMode ?? "bearer"}
              onChange={(next) =>
                setProviderDraft((current) => ({
                  ...(current ??
                    providerValues ?? { baseUrl: "", model: "", authMode: "bearer" as AiAuthMode }),
                  authMode: next as AiAuthMode,
                }))
              }
            />
          </div>
          <div className="settings-field-row">
            <span className="settings-row-value">
              {AI_COPY.timeoutLabel} {data?.provider.timeoutMs ?? "—"}ms
            </span>
            <span className="settings-row-value">
              {AI_COPY.tokensLabel} {data?.provider.maxOutputTokens ?? "—"} tokens
            </span>
          </div>
          {providerStatus ? <div className="settings-readout">{providerStatus}</div> : null}
        </div>
      </AiCard>

      <AiCard title={AI_COPY.searchCardTitle} description={AI_COPY.searchCardDesc}>
        <AiRow
          title={AI_COPY.providerLabel}
          control={
            <SegmentedControl
              label={AI_COPY.providerLabel}
              options={SEARCH_PROVIDER_OPTIONS}
              value={searchValues?.providerId ?? "tavily"}
              onChange={(next) =>
                setSearchDraft((current) => ({
                  ...(current ??
                    searchValues ?? { providerId: "tavily", baseUrl: "", authMode: "bearer" as AiAuthMode }),
                  providerId: String(next),
                }))
              }
            />
          }
        />
        <div className="settings-row-block">
          <div className="settings-field-row">
            <div className="min-w-0 flex-1">
              <Input
                aria-label={`${AI_COPY.searchCardTitle}地址`}
                placeholder="https://api.tavily.com 等官方或兼容地址"
                value={searchValues?.baseUrl ?? ""}
                onChange={(event) =>
                  setSearchDraft((current) => ({
                    ...(current ??
                      searchValues ?? { providerId: "tavily", baseUrl: "", authMode: "bearer" as AiAuthMode }),
                    baseUrl: event.target.value,
                  }))
                }
              />
            </div>
            <SegmentedControl
              label={AI_COPY.authLabel}
              options={AUTH_MODE_OPTIONS}
              value={searchValues?.authMode ?? "bearer"}
              onChange={(next) =>
                setSearchDraft((current) => ({
                  ...(current ??
                    searchValues ?? { providerId: "tavily", baseUrl: "", authMode: "bearer" as AiAuthMode }),
                  authMode: next as AiAuthMode,
                }))
              }
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!data || searchSet.isPending}
              onClick={saveSearch}
            >
              {AI_COPY.saveSearch}
            </Button>
          </div>
          {searchStatus ? <div className="settings-readout">{searchStatus}</div> : null}
        </div>
      </AiCard>

      <AiCard title={AI_COPY.keyCardTitle} description={AI_COPY.keyCardDesc}>
        <KeyRow
          scope="model"
          title={AI_COPY.modelKeyTitle}
          status={data?.credential}
        />
        <KeyRow
          scope="search"
          title={AI_COPY.searchKeyTitle}
          status={data?.searchCredential}
        />
      </AiCard>

      <AiCard title={AI_COPY.testCardTitle} description={AI_COPY.testCardDesc}>
        <AiRow
          title={AI_COPY.testModel}
          description={providerStatus ?? undefined}
          control={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plug size={12} strokeWidth={2} />}
              disabled={testConnection.isPending}
              onClick={() => runTest("model")}
            >
              {testButtonText("model")}
            </Button>
          }
        />
        <AiRow
          title={AI_COPY.testSearch}
          description={searchStatus ?? undefined}
          control={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plug size={12} strokeWidth={2} />}
              disabled={testConnection.isPending}
              onClick={() => runTest("search")}
            >
              {testButtonText("search")}
            </Button>
          }
        />
      </AiCard>

      <AiCard title={AI_COPY.exportCardTitle} description={AI_COPY.exportCardDesc}>
        <AiRow
          title={AI_COPY.exportConfig}
          control={
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw size={12} strokeWidth={2} />}
              disabled={configExport.isPending}
              onClick={runExport}
            >
              {AI_COPY.exportConfig}
            </Button>
          }
        />
        {exportedJson ? (
          <div className="settings-row-block">
            <div className="settings-readout">{exportedJson}</div>
          </div>
        ) : null}
      </AiCard>
    </>
  );
}
