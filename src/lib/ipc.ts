import { invoke } from "@tauri-apps/api/core";

export interface AppErrorEnvelope {
  code: string;
  message: string;
  retryable: boolean;
  details?: string;
}

export interface CaseSummary {
  id: string;
  kind: string;
  title: string;
  summary: string;
  confidence: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  payloadJson: string;
}

export interface CreateCaseInput {
  title: string;
  kind: string;
  confidence?: string;
  summary?: string;
}

export interface AppInfo {
  appVersion: string;
  dataDir: string;
  dbPath: string;
  platform: string;
  caseCount: number;
}

export class IpcError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: string;

  constructor(envelope: AppErrorEnvelope) {
    super(envelope.message);
    this.name = envelope.code;
    this.code = envelope.code;
    this.retryable = envelope.retryable;
    this.details = envelope.details;
  }
}

function isEnvelope(value: unknown): value is AppErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.retryable === "boolean"
  );
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isEnvelope(error)) throw new IpcError(error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }
}

export const ipc = {
  settingsGetAll: () => call<Record<string, string>>("settings_get_all"),
  settingsSet: (key: string, value: string) => call<void>("settings_set", { key, value }),
  casesList: (options?: {
    kind?: string;
    favoriteOnly?: boolean;
    limit?: number;
  }) =>
    call<CaseSummary[]>("cases_list", {
      kind: options?.kind,
      favoriteOnly: options?.favoriteOnly ?? false,
      limit: options?.limit ?? 200,
    }),
  casesCreate: (input: CreateCaseInput) => call<CaseSummary>("cases_create", { input }),
  casesRename: (id: string, title: string) => call<CaseSummary>("cases_rename", { id, title }),
  casesToggleFavorite: (id: string) => call<boolean>("cases_toggle_favorite", { id }),
  casesSoftDelete: (id: string) => call<void>("cases_soft_delete", { id }),
  casesCounts: () => call<Record<string, number>>("cases_counts"),
  appInfo: () => call<AppInfo>("app_info"),
};
