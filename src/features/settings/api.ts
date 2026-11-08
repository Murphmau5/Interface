import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ipc } from "@/lib/ipc";

export const settingsQueryKey = ["settings"] as const;
export const appInfoQueryKey = ["appInfo"] as const;

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: ipc.settingsGetAll,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useAppInfo() {
  return useQuery({
    queryKey: appInfoQueryKey,
    queryFn: ipc.appInfo,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSetSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => ipc.settingsSet(key, value),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<Record<string, string>>(settingsQueryKey, (previous) => ({
        ...(previous ?? {}),
        [variables.key]: variables.value,
      }));
    },
  });
}
