import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Inbox, Link2, Pencil, Search, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import {
  useAiAnalyze,
  useApproveCandidate,
  useCandidates,
  useCreateCandidate,
  useDiscoveryFetchUrl,
  useDiscoverySearch,
  useRejectCandidate,
} from "@/features/candidates/api";
import { useAiSettings } from "@/features/settings/api";
import { CASE_KIND_LABELS, type CaseKind } from "@/lib/constants";
import type {
  CandidateRow,
  CandidateStatus,
  DiscoveryBatchResult,
  DiscoveryItemResult,
} from "@/lib/ipc";
import { formatDateTime } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "all", label: "全部" },
] as const;

const STATUS_LABELS: Record<CandidateStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "手动",
  url: "网址登记",
  import: "导入",
  search: "检索",
  ai: "AI 分析",
};

/** AI 分析上限提示：素材去空白后 1–4000 字（与 Rust 校验一致） */
const AI_DRAFT_MAX_CHARS = 4000;

const CAPTURE_OPTIONS = [
  { value: "url", label: "粘贴网址" },
  { value: "search", label: "搜索检索" },
] as const;

function describeDiscoveryItem(item: DiscoveryItemResult): string {
  if (item.outcome === "created") {
    return `已入候选池：${item.title ?? item.url}`;
  }
  if (item.outcome === "duplicate") {
    const shortId = item.existingCandidateId?.slice(0, 8);
    return `重复，未新建：${item.title ?? item.url}（已存在候选${shortId ? ` ${shortId}` : ""}）`;
  }
  return `失败：${item.code ?? ""} ${item.message ?? ""}`.trim();
}

export function CandidateView() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CandidateStatus | "all">("pending");
  const candidates = useCandidates(status);
  const createCandidate = useCreateCandidate();
  const approve = useApproveCandidate();
  const reject = useRejectCandidate();
  const aiAnalyze = useAiAnalyze();
  const aiSettings = useAiSettings();
  const discoveryFetchUrl = useDiscoveryFetchUrl();
  const discoverySearch = useDiscoverySearch();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CaseKind>("style");
  const [url, setUrl] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [captureMode, setCaptureMode] = useState<"url" | "search">("url");
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureQuery, setCaptureQuery] = useState("");
  const [captureResult, setCaptureResult] = useState<DiscoveryBatchResult | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; summary: string } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const rows = candidates.data ?? [];

  // KEY_READY：模型服务已配置（地址 + 模型 + Key）；未配置时不渲染分析区块
  const aiReady =
    Boolean(aiSettings.data?.provider.baseUrl) &&
    Boolean(aiSettings.data?.provider.model) &&
    Boolean(aiSettings.data?.credential.configured);

  // 搜索采集需要独立的搜索服务 Key；未配置时按钮禁用并引导去设置页
  const searchConfigured = Boolean(aiSettings.data?.searchCredential.configured);

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setFeedback({ tone: "error", text: "候选标题不能为空。" });
      return;
    }
    createCandidate.mutate(
      {
        kind,
        title: trimmed,
        source: url.trim() ? "url" : "manual",
        sourceUrl: url.trim() || undefined,
      },
      {
        onSuccess: (row) => {
          setTitle("");
          setUrl("");
          setFeedback({ tone: "ok", text: `已进入待审核队列：${row.title}` });
          if (status !== "pending" && status !== "all") setStatus("pending");
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: error.message || "登记候选失败。" }),
      },
    );
  };

  const handleFetchUrl = () => {
    const target = captureUrl.trim();
    if (!target) {
      setFeedback({ tone: "error", text: "请先粘贴要抓取的网址。" });
      return;
    }
    discoveryFetchUrl.mutate(
      { url: target, kind },
      {
        onSuccess: (result) => {
          setCaptureResult(result);
          if (result.ok) setCaptureUrl("");
          if (status !== "pending" && status !== "all") setStatus("pending");
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: error.message || "抓取失败，请稍后重试。" }),
      },
    );
  };

  const handleSearch = () => {
    const query = captureQuery.trim();
    if (!query) {
      setFeedback({ tone: "error", text: "请输入检索关键词。" });
      return;
    }
    discoverySearch.mutate(
      { query, kind },
      {
        onSuccess: (result) => {
          setCaptureResult(result);
          if (result.ok) setCaptureQuery("");
          if (status !== "pending" && status !== "all") setStatus("pending");
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: error.message || "检索失败，请稍后重试。" }),
      },
    );
  };

  const handleAiAnalyze = () => {
    const draft = aiDraft.trim();
    if (!draft) {
      setFeedback({ tone: "error", text: "请先粘贴待分析素材。" });
      return;
    }
    aiAnalyze.mutate(
      { kind, draft },
      {
        onSuccess: (result) => {
          setAiDraft("");
          const warningText = result.warnings.length > 0 ? `提示：${result.warnings.join("；")}` : "";
          setFeedback({
            tone: "ok",
            text: `AI 分析已入待审核队列：${result.candidate.title}（模型 ${result.model}）。${warningText}`,
          });
          if (status !== "pending" && status !== "all") setStatus("pending");
        },
        onError: (error) =>
          setFeedback({
            tone: "error",
            text: error.message || "AI 分析失败，请稍后重试。",
          }),
      },
    );
  };

  const handleApprove = (row: CandidateRow) => {
    const edit =
      editing && editing.id === row.id
        ? { title: editing.title.trim(), summary: editing.summary.trim() }
        : undefined;
    if (edit && !edit.title) {
      setFeedback({ tone: "error", text: "标题不能为空。" });
      return;
    }
    approve.mutate(
      { id: row.id, edit },
      {
        onSuccess: (created) => {
          setEditing(null);
          setFeedback({
            tone: "ok",
            text: `已通过并写入案例库：${created.title}。可到「全部案例」查看。`,
          });
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: error.message || "审核写入失败。" }),
      },
    );
  };

  const handleReject = (row: CandidateRow) => {
    reject.mutate(
      { id: row.id, note: "审核未通过" },
      {
        onSuccess: () => {
          setEditing(null);
          setFeedback({ tone: "ok", text: `已拒绝：${row.title}，未写入案例库。` });
        },
        onError: (error) =>
          setFeedback({ tone: "error", text: error.message || "拒绝失败。" }),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-6 pb-4 pt-5">
        <div className="label-eyebrow">DISCOVERY / 审核</div>
        <div className="mt-1.5 flex items-center gap-2">
          <h1 className="text-display font-semibold tracking-tight text-ink">候选池</h1>
          <span className="rounded-pill border border-line px-2 py-0.5 font-mono text-2xs text-ink-faint">
            {rows.length}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-meta leading-normal text-ink-faint">
          候选只是暂存区。任何条目都必须显式「通过」才会写入案例库；没有免审开关。联网采集只在你会显式点击时发起请求。
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-4">
          <form
            onSubmit={handleCreate}
            className="rounded-md border border-line bg-raised p-3 shadow-ambient"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
              <Input
                aria-label="候选标题"
                value={title}
                placeholder="候选标题，例如「玻璃拟态导航栏」"
                onChange={(event) => setTitle(event.target.value)}
              />
              <Select
                aria-label="候选类型"
                options={Object.entries(CASE_KIND_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                value={kind}
                onChange={(event) => setKind(event.target.value as CaseKind)}
              />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                aria-label="来源网址（可选）"
                value={url}
                placeholder="可选：https://…（只登记，不抓取）"
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button type="submit" size="sm" disabled={createCandidate.isPending}>
                <Inbox size={12} strokeWidth={1.8} aria-hidden />
                登记候选
              </Button>
            </div>
            <p className="mt-2 text-2xs leading-normal text-ink-faint">
              手动登记不会发起网络请求；需要抓取网页正文请用上方「联网采集」。
            </p>
          </form>

          <div className="rounded-md border border-line bg-raised p-3 shadow-ambient">
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Link2 size={13} strokeWidth={1.8} className="text-accent" aria-hidden />
              <span className="text-meta font-medium text-ink-soft">联网采集</span>
              <SegmentedControl
                label="采集方式"
                options={CAPTURE_OPTIONS}
                value={captureMode}
                onChange={setCaptureMode}
              />
              <div className="w-[140px]">
                <Select
                  aria-label="采集类型"
                  options={Object.entries(CASE_KIND_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as CaseKind)}
                />
              </div>
            </div>

            {captureMode === "url" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-48 flex-1">
                    <Input
                      aria-label="采集网址"
                      value={captureUrl}
                      placeholder="https://example.com/article"
                      onChange={(event) => setCaptureUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleFetchUrl();
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={discoveryFetchUrl.isPending}
                    onClick={handleFetchUrl}
                  >
                    <Link2 size={12} strokeWidth={1.8} aria-hidden />
                    抓取并登记
                  </Button>
                </div>
                <p className="mt-2 text-2xs leading-normal text-ink-faint">
                  不需要任何 Key，只抓取公开 http/https 页面；内网与本机地址会被拒绝。
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-48 flex-1">
                    <Input
                      aria-label="检索关键词"
                      value={captureQuery}
                      placeholder="例如：玻璃拟态导航栏"
                      disabled={!searchConfigured}
                      onChange={(event) => setCaptureQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleSearch();
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!searchConfigured || discoverySearch.isPending}
                    onClick={handleSearch}
                  >
                    <Search size={12} strokeWidth={1.8} aria-hidden />
                    检索并采集
                  </Button>
                  {!searchConfigured ? (
                    <>
                      <span className="text-2xs leading-normal text-ink-faint">
                        搜索服务未配置（需要 Key）
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => navigate("/settings")}>
                        去设置
                      </Button>
                    </>
                  ) : null}
                </div>
                <p className="mt-2 text-2xs leading-normal text-ink-faint">
                  结果会逐条写入候选池，仍需人工审核才会进入案例库。
                </p>
              </>
            )}

            {captureResult ? (
              <div className="mt-3 space-y-1 rounded-sm border border-line bg-sunken px-3 py-2">
                {captureResult.items.map((item, index) => (
                  <div
                    key={`${item.url}-${index}`}
                    className="flex min-w-0 items-baseline gap-2 text-2xs leading-normal"
                  >
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-ink-faint"
                      title={item.url}
                    >
                      {item.url}
                    </span>
                    <span
                      className={
                        item.outcome === "failed"
                          ? "shrink-0 text-danger"
                          : "shrink-0 text-ink-soft"
                      }
                    >
                      {describeDiscoveryItem(item)}
                    </span>
                  </div>
                ))}
                {captureResult.items.length === 0 && !captureResult.ok ? (
                  <div className="text-2xs leading-normal text-danger">
                    {captureResult.code} {captureResult.message}
                  </div>
                ) : null}
                <p className="pt-1 font-mono text-2xs text-ink-faint">
                  请求 {captureResult.requested} · 新增 {captureResult.created} · 重复{" "}
                  {captureResult.duplicates} · 失败 {captureResult.failed}
                </p>
              </div>
            ) : null}
          </div>

          {aiReady ? (
            <div className="rounded-md border border-line bg-raised p-3 shadow-ambient">
              <div className="flex items-center gap-2 pb-2">
                <Sparkles size={13} strokeWidth={1.8} className="text-accent" aria-hidden />
                <span className="text-meta font-medium text-ink-soft">AI 发起分析</span>
                <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-2xs text-ink-faint">
                  {aiSettings.data?.provider.model}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px]">
                <Input
                  aria-label="AI 分析素材"
                  placeholder="粘贴待分析的界面素材描述（去空白后 1–4000 字，仅本次使用，不落草稿）"
                  value={aiDraft}
                  maxLength={AI_DRAFT_MAX_CHARS}
                  onChange={(event) => setAiDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleAiAnalyze();
                    }
                  }}
                />
                <Select
                  aria-label="AI 分析类型"
                  options={Object.entries(CASE_KIND_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  value={kind}
                  onChange={(event) => setKind(event.target.value as CaseKind)}
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  icon={<Sparkles size={12} strokeWidth={2} aria-hidden />}
                  disabled={aiAnalyze.isPending}
                  onClick={handleAiAnalyze}
                >
                  发起分析
                </Button>
                <span className="text-2xs leading-normal text-ink-faint">
                  结果写入候选池（来源「AI 分析」），审核通过才进入案例库。
                </span>
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div
              role="status"
              className={
                feedback.tone === "ok"
                  ? "rounded-sm border border-accent-line bg-accent-soft px-3 py-2 text-xs text-ink"
                  : "rounded-sm border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger"
              }
            >
              {feedback.text}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              label="候选状态"
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
            <span className="font-mono text-2xs text-ink-faint">状态与计数来自 SQL</span>
          </div>

          {candidates.isPending ? <LoadingState /> : null}

          {candidates.isError ? (
            <EmptyState
              title="读取候选失败"
              description={candidates.error.message}
              action={
                <Button size="sm" onClick={() => void candidates.refetch()}>
                  重试
                </Button>
              }
            />
          ) : null}

          {!candidates.isPending && !candidates.isError && rows.length === 0 ? (
            <EmptyState
              compact
              title={status === "pending" ? "待审核队列为空" : "这里还没有候选"}
              description={
                status === "pending"
                  ? "在上方登记一条，或用「联网采集」粘贴网址。"
                  : "切换状态筛选查看其他候选。"
              }
            />
          ) : null}

          {rows.map((row) => {
            const isEditing = editing?.id === row.id;
            return (
              <article
                key={row.id}
                className="rounded-md border border-line bg-raised p-3 shadow-ambient"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      aria-label="编辑候选标题"
                      value={editing.title}
                      onChange={(event) =>
                        setEditing({ ...editing, title: event.target.value })
                      }
                    />
                    <Input
                      aria-label="编辑候选摘要"
                      value={editing.summary}
                      placeholder="摘要（可选）"
                      onChange={(event) =>
                        setEditing({ ...editing, summary: event.target.value })
                      }
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium text-ink">{row.title}</h2>
                      {row.summary ? (
                        <p className="mt-1 line-clamp-2 text-meta leading-normal text-ink-soft">
                          {row.summary}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-xs border border-line px-1.5 py-0.5 text-2xs text-ink-faint">
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-ink-faint">
                  <span className="rounded-xs border border-line px-1.5 py-0.5 text-ink-soft">
                    {CASE_KIND_LABELS[row.kind as CaseKind] ?? row.kind}
                  </span>
                  <span>{SOURCE_LABELS[row.source] ?? row.source}</span>
                  <span className="font-mono">{formatDateTime(row.createdAt)}</span>
                  {row.sourceUrl ? (
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <Link2 size={11} strokeWidth={1.8} aria-hidden />
                      <span className="truncate">{row.sourceUrl}</span>
                    </span>
                  ) : null}
                </div>

                {row.status === "pending" ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={approve.isPending}
                      onClick={() => handleApprove(row)}
                    >
                      <Check size={12} strokeWidth={2} aria-hidden />
                      {isEditing ? "保存并通过" : "通过"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={reject.isPending}
                      onClick={() => handleReject(row)}
                    >
                      <X size={12} strokeWidth={2} aria-hidden />
                      拒绝
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing(
                          isEditing
                            ? null
                            : { id: row.id, title: row.title, summary: row.summary },
                        )
                      }
                    >
                      <Pencil size={12} strokeWidth={1.8} aria-hidden />
                      {isEditing ? "取消编辑" : "编辑后入库"}
                    </Button>
                  </div>
                ) : row.approvedCaseId ? (
                  <p className="mt-2 font-mono text-2xs text-ink-faint">
                    已入库案例 {row.approvedCaseId.slice(0, 8)}
                  </p>
                ) : row.reviewNote ? (
                  <p className="mt-2 text-2xs text-ink-faint">备注：{row.reviewNote}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
