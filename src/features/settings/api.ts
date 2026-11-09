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

export const contentPackagesQueryKey = ["contentPackages"] as const;

export function useContentPackages() {
  return useQuery({
    queryKey: contentPackagesQueryKey,
    queryFn: ipc.contentPackagesList,
    retry: 1,
  });
}

/** 内容包会增删案例，导入/卸载后统一刷新案例、标签与统计。 */
function invalidateContentData(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: contentPackagesQueryKey });
  void queryClient.invalidateQueries({ queryKey: ["cases"] });
  void queryClient.invalidateQueries({ queryKey: ["tags"] });
  void queryClient.invalidateQueries({ queryKey: ["collections"] });
}

export function useContentPackageImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => ipc.contentPackageImport(path),
    onSuccess: () => invalidateContentData(queryClient),
  });
}

export function useContentPackageInstallUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url?: string) => ipc.contentPackageInstallUrl(url),
    onSuccess: () => invalidateContentData(queryClient),
  });
}

export function useContentPackageUninstall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) => ipc.contentPackageUninstall(packageId),
    onSuccess: () => invalidateContentData(queryClient),
  });
}

/** 检查更新只在用户点按钮时执行，不做后台轮询。 */
export function useContentPackageCheckUpdate() {
  return useMutation({
    mutationFn: (url?: string) => ipc.contentPackageCheckUpdate(url),
  });
}

export function useContentPackageApplyUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url?: string) => ipc.contentPackageApplyUpdate(url),
    onSuccess: () => invalidateContentData(queryClient),
  });
}
