import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCatalog, useCreateCase } from "@/features/cases/api";
import {
  CASE_KIND_LABELS,
  CONFIDENCE_OPTIONS,
  PLATFORM_OPTIONS,
  type CaseKind,
} from "@/lib/constants";
import { defaultPreviewSpec, serializePreview } from "@/lib/preview";

interface CreateCaseFormProps {
  kind: CaseKind;
  /** 当前左栏选中的类目，新建时默认带上 */
  categoryId?: string | null;
  onCreated: (id: string) => void;
}

export function CreateCaseForm({ kind, categoryId, onCreated }: CreateCaseFormProps) {
  const [title, setTitle] = useState("");
  const [confidence, setConfidence] = useState("unknown");
  const [platform, setPlatform] = useState("web");
  const [category, setCategory] = useState(categoryId ?? "");
  const [lastCategoryId, setLastCategoryId] = useState(categoryId ?? null);
  const [error, setError] = useState<string | null>(null);
  const createCase = useCreateCase();
  const catalog = useCatalog();

  // 左栏换类目时同步默认值；在渲染期调整，避免 effect 里 setState 引发级联渲染
  if (categoryId !== lastCategoryId) {
    setLastCategoryId(categoryId ?? null);
    setCategory(categoryId ?? "");
  }

  const domain = catalog.data?.find((entry) => entry.domain === kind);
  const categoryOptions = [
    { value: "", label: "未归类" },
    ...(domain?.groups.flatMap((group) =>
      group.categories.map((entry) => ({
        value: entry.id,
        label: `${group.label} / ${entry.label}`,
      })),
    ) ?? []),
  ];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("请输入案例标题");
      return;
    }

    createCase.mutate(
      {
        title: trimmed,
        kind,
        confidence,
        platform,
        categoryId: category || undefined,
        payloadJson: serializePreview("{}", defaultPreviewSpec(kind)),
      },
      {
        onSuccess: (created) => {
          setTitle("");
          setError(null);
          onCreated(created.id);
        },
        onError: (mutationError) => {
          setError(mutationError.message);
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-line bg-raised p-3 shadow-ambient"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="label-eyebrow">新建「{CASE_KIND_LABELS[kind]}」案例</span>
        <span className="font-mono text-2xs text-ink-faint">cases · SQLite</span>
      </div>

      <Input
        aria-label="案例标题"
        value={title}
        maxLength={120}
        placeholder="给这条案例一个可检索的名字"
        onChange={(event) => {
          setTitle(event.target.value);
          if (error) setError(null);
        }}
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <Select
            aria-label="所属类目"
            label="类目"
            options={categoryOptions}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        <div className="min-w-0">
          <Select
            aria-label="置信度"
            label="置信度"
            options={CONFIDENCE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={confidence}
            onChange={(event) => setConfidence(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-2">
        <Select
          aria-label="平台"
          label="平台"
          options={PLATFORM_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
        />
      </div>

      <div className="mt-2 flex justify-end">
        <Button
          type="submit"
          variant="primary"
          icon={<Plus size={13} strokeWidth={2} />}
          disabled={createCase.isPending || !title.trim()}
        >
          {createCase.isPending ? "写入中" : "添加"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs leading-normal text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
