import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCreateCase } from "@/features/cases/api";
import {
  CASE_KIND_LABELS,
  CONFIDENCE_OPTIONS,
  type CaseKind,
} from "@/lib/constants";

interface CreateCaseFormProps {
  kind: CaseKind;
  onCreated: (id: string) => void;
}

export function CreateCaseForm({ kind, onCreated }: CreateCaseFormProps) {
  const [title, setTitle] = useState("");
  const [confidence, setConfidence] = useState("unknown");
  const [error, setError] = useState<string | null>(null);
  const createCase = useCreateCase();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("请输入案例标题");
      return;
    }

    createCase.mutate(
      { title: trimmed, kind, confidence },
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

      <div className="mt-2 flex items-end gap-2">
        <div className="min-w-0 flex-1">
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
