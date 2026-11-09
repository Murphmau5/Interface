import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ipc, type CaseQueryInput, type CreateCaseInput } from "@/lib/ipc";

export function useCaseQuery(input: CaseQueryInput) {
  return useQuery({
    queryKey: ["cases", "query", input],
    queryFn: () => ipc.casesQuery(input),
    retry: 1,
  });
}

export function useCaseFacets(input: CaseQueryInput) {
  return useQuery({
    queryKey: ["cases", "facets", input],
    queryFn: () => ipc.casesFacets(input),
    retry: 1,
  });
}

export function useViewCounts() {
  return useQuery({
    queryKey: ["cases", "viewCounts"],
    queryFn: ipc.casesViewCounts,
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
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    void queryClient.invalidateQueries({ queryKey: ["candidates"] });
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

export function useExportBundle() {
  return useMutation({
    mutationFn: (input: { title: string; markdown: string; json: string }) =>
      ipc.casesExportBundle(input),
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags", "list"],
    queryFn: ipc.tagsList,
    retry: 1,
    staleTime: 5_000,
  });
}

export function useCaseTags(caseId: string) {
  return useQuery({
    queryKey: ["tags", "case", caseId],
    queryFn: () => ipc.casesTags(caseId),
    retry: 1,
  });
}

export function useSetCaseTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, labels }: { caseId: string; labels: string[] }) =>
      ipc.casesSetTags(caseId, labels),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      void queryClient.invalidateQueries({ queryKey: ["tags", "case", variables.caseId] });
    },
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections", "list"],
    queryFn: ipc.collectionsList,
    retry: 1,
    staleTime: 5_000,
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => ipc.collectionsCreate(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useAddToCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, caseId }: { collectionId: string; caseId: string }) =>
      ipc.collectionsAddCase(collectionId, caseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useCaseAssets(caseId: string) {
  return useQuery({
    queryKey: ["assets", caseId],
    queryFn: () => ipc.assetsListForCase(caseId),
    retry: 1,
  });
}

export function useImportAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, paths }: { caseId: string | null; paths: string[] }) =>
      ipc.assetsImport(caseId, paths),
    onSuccess: (_data, variables) => {
      if (variables.caseId) {
        void queryClient.invalidateQueries({ queryKey: ["assets", variables.caseId] });
      }
    },
  });
}
