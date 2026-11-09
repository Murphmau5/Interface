import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CaseKind } from "@/lib/constants";
import { ipc, type CreateCaseInput } from "@/lib/ipc";

export type CaseScope = "all" | "kind" | "favorites" | "recent";

export function useCases(scope: CaseScope, kind?: CaseKind, categoryId?: string | null) {
  return useQuery({
    queryKey: ["cases", scope, kind ?? "all", categoryId ?? "all"],
    queryFn: () =>
      ipc.casesList({
        kind: scope === "kind" ? kind : undefined,
        favoriteOnly: scope === "favorites",
        categoryId: categoryId ?? undefined,
        limit: 1000,
      }),
    retry: 1,
  });
}

export function useCaseCounts() {
  return useQuery({
    queryKey: ["cases", "counts"],
    queryFn: ipc.casesCounts,
    retry: 1,
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: ipc.catalogList,
    retry: 1,
    staleTime: 5_000,
  });
}

function useInvalidateCases() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["cases"] });
    void queryClient.invalidateQueries({ queryKey: ["catalog"] });
  };
}

export function useCreateCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: (input: CreateCaseInput) => ipc.casesCreate(input),
    onSuccess: invalidate,
  });
}

export function useRenameCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => ipc.casesRename(id, title),
    onSuccess: invalidate,
  });
}

export function useToggleFavorite() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: (id: string) => ipc.casesToggleFavorite(id),
    onSuccess: invalidate,
  });
}

export function useDeleteCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: (id: string) => ipc.casesSoftDelete(id),
    onSuccess: invalidate,
  });
}

export function useUpdatePayload() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({ id, payloadJson }: { id: string; payloadJson: string }) =>
      ipc.casesUpdatePayload(id, payloadJson),
    onSuccess: invalidate,
  });
}

export function useExportMarkdown() {
  return useMutation({
    mutationFn: ({ title, content }: { title: string; content: string }) =>
      ipc.casesExportMarkdown(title, content),
  });
}
