import { useState } from "react";
import { Check, Inbox, Link2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import {
  useApproveCandidate,
  useCandidates,
  useCreateCandidate,
  useRejectCandidate,
} from "@/features/candidates/api";
import { CASE_KIND_LABELS, type CaseKind } from "@/lib/constants";
import type { CandidateRow, CandidateStatus } from "@/lib/ipc";
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
};

export function CandidateView() {
  const [status, setStatus] = useState<CandidateStatus | "all">("pending");
  const candidates = useCandidates(status);
  const createCandidate = useCreateCandidate();
  const approve = useApproveCandidate();
  const reject = useRejectCandidate();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CaseKind>("style");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string; summary: string } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const rows = candidates.data ?? [];

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
          候选只是暂存区。任何条目都必须显式「通过」才会写入案例库；没有免审开关，也不会自动抓取网址。
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
              手动登记与你粘贴的网址都会先进入待审核；系统不会自动请求外部地址。
            </p>
          </form>

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
                  ? "在上方登记一条，或在搜索框的「联网」作用域里粘贴网址。"
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
