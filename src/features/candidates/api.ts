import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ipc,
  type CandidateEdit,
  type CandidateInput,
  type CandidateStatus,
} from "@/lib/ipc";

export function useCandidates(status: CandidateStatus | "all") {
  return useQuery({
    queryKey: ["candidates", "list", status],
    queryFn: () => ipc.candidatesList(status),
    retry: 1,
  });
}

function useInvalidateReview() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["cases"] });
    void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
  };
}

export function useCreateCandidate() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: (input: CandidateInput) => ipc.candidatesCreate(input),
    onSuccess: invalidate,
  });
}

export function useApproveCandidate() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: ({ id, edit }: { id: string; edit?: CandidateEdit }) =>
      ipc.candidatesApprove(id, edit),
    onSuccess: invalidate,
  });
}

export function useRejectCandidate() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      ipc.candidatesReject(id, note),
    onSuccess: invalidate,
  });
}
