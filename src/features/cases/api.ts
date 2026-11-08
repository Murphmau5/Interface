import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CaseKind } from "@/lib/constants";
import { ipc, type CreateCaseInput } from "@/lib/ipc";

export type CaseScope = "all" | "kind" | "favorites" | "recent";

export function useCases(scope: CaseScope, kind?: CaseKind) {
  return useQuery({
    queryKey: ["cases", scope, kind ?? "all"],
    queryFn: () =>
      ipc.casesList({
        kind: scope === "kind" ? kind : undefined,
        favoriteOnly: scope === "favorites",
        limit: 200,
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

function useInvalidateCases() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["cases"] });
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
