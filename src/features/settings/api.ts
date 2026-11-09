import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AiProviderConfig, AiScope, AiSearchConfig } from "@/lib/ipc";
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

export const aiSettingsQueryKey = ["aiSettings"] as const;

export function useAiSettings() {
  return useQuery({
    queryKey: aiSettingsQueryKey,
    queryFn: ipc.aiSettingsGet,
  });
}

function invalidateAiSettings(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: aiSettingsQueryKey });
}

export function useAiProviderSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AiProviderConfig) => ipc.aiProviderSet(input),
    onSuccess: () => invalidateAiSettings(queryClient),
  });
}

export function useAiSearchSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AiSearchConfig) => ipc.aiSearchSet(input),
    onSuccess: () => invalidateAiSettings(queryClient),
  });
}

export function useAiCredentialSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, key }: { scope: AiScope; key: string }) =>
      ipc.aiCredentialSet(scope, key),
    onSuccess: () => invalidateAiSettings(queryClient),
  });
}

export function useAiCredentialClear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: AiScope) => ipc.aiCredentialClear(scope),
    onSuccess: () => invalidateAiSettings(queryClient),
  });
}

export function useAiTestConnection() {
  return useMutation({
    mutationFn: (scope: AiScope) => ipc.aiTestConnection(scope),
  });
}

export function useAiConfigExport() {
  return useMutation({
    mutationFn: () => ipc.aiConfigExport(),
  });
}
