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
  categoryId: string | null;
  platform: string;
  componentLayer: string | null;
  createdAt: string;
  updatedAt: string;
  payloadJson: string;
}

export interface CreateCaseInput {
  title: string;
  kind: string;
  confidence?: string;
  summary?: string;
  categoryId?: string;
  payloadJson?: string;
  platform?: string;
  componentLayer?: string;
}

export type CaseScope = "all" | "kind" | "favorites" | "recent" | "collection";

export interface CaseQueryInput {
  scope?: CaseScope;
  kind?: string;
  platform?: string;
  confidence?: string;
  layer?: string;
  categoryId?: string;
  collectionId?: string;
  tagId?: string;
  search?: string;
  sort?: "updated" | "created" | "title";
  limit?: number;
  offset?: number;
}

export interface CasePage {
  items: CaseSummary[];
  total: number;
}

export interface Facets {
  kinds: Record<string, number>;
  platforms: Record<string, number>;
  confidences: Record<string, number>;
  layers: Record<string, number>;
}

export interface ViewCounts {
  total: number;
  favorites: number;
  recent: number;
}

export interface CatalogCategory {
  id: string;
  label: string;
  count: number;
}

export interface CatalogGroup {
  label: string;
  categories: CatalogCategory[];
}

export interface CatalogDomain {
  domain: string;
  total: number;
  groups: CatalogGroup[];
}

export interface TagCount {
  id: string;
  label: string;
  count: number;
}

export interface TagRef {
  id: string;
  label: string;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  count: number;
  createdAt: string;
}

export interface AssetRecord {
  id: string;
  sha256: string;
  kind: string;
  mime: string;
  byteSize: number;
  relPath: string;
  originalName: string;
  needsCleaning: boolean;
  createdAt: string;
}

export interface ImportOutcome {
  path: string;
  ok: boolean;
  reused: boolean;
  asset: AssetRecord | null;
  error: string | null;
}

export type CandidateStatus = "pending" | "approved" | "rejected";

export interface CandidateRow {
  id: string;
  kind: string;
  title: string;
  summary: string;
  payloadJson: string;
  source: string;
  sourceUrl: string | null;
  status: CandidateStatus;
  reviewNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  approvedCaseId: string | null;
}

export interface CandidateInput {
  kind: string;
  title: string;
  summary?: string;
  payloadJson?: string;
  source?: "manual" | "url" | "import" | "search";
  sourceUrl?: string;
}

export interface CandidateEdit {
  title?: string;
  summary?: string;
  payloadJson?: string;
}

export interface ExportBundle {
  markdownPath: string;
  jsonPath: string;
  fileStem: string;
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

  casesQuery: (input: CaseQueryInput) => call<CasePage>("cases_query", { input }),
  casesFacets: (input: CaseQueryInput) => call<Facets>("cases_facets", { input }),
  casesViewCounts: () => call<ViewCounts>("cases_view_counts"),
  casesCreate: (input: CreateCaseInput) => call<CaseSummary>("cases_create", { input }),
  casesRename: (id: string, title: string) => call<CaseSummary>("cases_rename", { id, title }),
  casesToggleFavorite: (id: string) => call<boolean>("cases_toggle_favorite", { id }),
  casesSoftDelete: (id: string) => call<void>("cases_soft_delete", { id }),
  casesUpdatePayload: (id: string, payloadJson: string) =>
    call<CaseSummary>("cases_update_payload", { id, payloadJson }),
  casesExportMarkdown: (title: string, content: string) =>
    call<string>("cases_export_markdown", { title, content }),
  casesExportBundle: (input: { title: string; markdown: string; json: string }) =>
    call<ExportBundle>("cases_export_bundle", { input }),
  casesCounts: () => call<Record<string, number>>("cases_counts"),

  tagsList: () => call<TagCount[]>("tags_list"),
  tagsCreate: (label: string) => call<TagRef>("tags_create", { label }),
  casesTags: (caseId: string) => call<TagRef[]>("cases_tags", { caseId }),
  casesSetTags: (caseId: string, labels: string[]) =>
    call<TagRef[]>("cases_set_tags", { caseId, labels }),

  collectionsList: () => call<CollectionSummary[]>("collections_list"),
  collectionsCreate: (name: string) => call<CollectionSummary>("collections_create", { name }),
  collectionsAddCase: (collectionId: string, caseId: string) =>
    call<void>("collections_add_case", { collectionId, caseId }),
  collectionsRemoveCase: (collectionId: string, caseId: string) =>
    call<void>("collections_remove_case", { collectionId, caseId }),

  assetsImport: (caseId: string | null, paths: string[]) =>
    call<ImportOutcome[]>("assets_import", { caseId, paths }),
  assetsListForCase: (caseId: string) => call<AssetRecord[]>("assets_list_for_case", { caseId }),

  candidatesList: (status?: CandidateStatus | "all") =>
    call<CandidateRow[]>("candidates_list", { status }),
  candidatesCreate: (input: CandidateInput) =>
    call<CandidateRow>("candidates_create", { input }),
  candidatesReject: (id: string, note?: string) =>
    call<CandidateRow>("candidates_reject", { id, note }),
  candidatesApprove: (id: string, edit?: CandidateEdit) =>
    call<CaseSummary>("candidates_approve", { id, edit }),

  catalogList: () => call<CatalogDomain[]>("catalog_list"),
  appInfo: () => call<AppInfo>("app_info"),
};
