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
  note?: string;
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

export type SanitizeState = "pending" | "cleaned" | "rejected" | "not-applicable";

export interface SanitizeIssue {
  kind: string;
  message: string;
  line: number;
}

export interface SanitizeReport {
  state: "cleaned" | "rejected";
  bytesIn: number;
  bytesOut: number;
  removedTags: number;
  removedAttributes: number;
  removedUrls: number;
  issues: SanitizeIssue[];
  issuesTruncated: boolean;
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
  sanitizeState: SanitizeState;
  sanitizedRelPath: string | null;
  sanitizeReport: string | null;
  sanitizedAt: string | null;
  createdAt: string;
}

export interface ImportOutcome {
  path: string;
  ok: boolean;
  reused: boolean;
  asset: AssetRecord | null;
  sanitize: SanitizeReport | null;
  error: string | null;
}

export interface PreviewHandle {
  label: string;
  url: string;
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

export interface DiscoveryItemResult {
  url: string;
  outcome: "created" | "duplicate" | "failed";
  title?: string | null;
  candidateId?: string | null;
  existingCandidateId?: string | null;
  code?: string | null;
  message?: string | null;
}

export interface DiscoveryBatchResult {
  ok: boolean;
  code: string;
  message: string;
  requested: number;
  created: number;
  duplicates: number;
  failed: number;
  items: DiscoveryItemResult[];
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

export type AiAuthMode = "bearer" | "none";
export type AiScope = "model" | "search";

export interface AiProviderConfig {
  providerId: string;
  baseUrl: string;
  model: string;
  authMode: AiAuthMode;
  timeoutMs: number;
  maxOutputTokens: number;
}

export interface AiSearchConfig {
  providerId: string;
  baseUrl: string;
  authMode: AiAuthMode;
}

/** 前端可见字段只有这三项，不存在任何返回明文 Key 的命令 */
export interface AiCredentialStatus {
  configured: boolean;
  last4: string;
  updatedAt: string | null;
}

export interface AiSettingsSnapshot {
  provider: AiProviderConfig;
  search: AiSearchConfig;
  credential: AiCredentialStatus;
  searchCredential: AiCredentialStatus;
}

export interface AiTestResult {
  ok: boolean;
  code: string;
  message: string;
  latencyMs: number;
  httpStatus: number | null;
}

export interface AiAnalyzeInput {
  kind: string;
  draft: string;
  sourceUrl?: string;
}

export interface AiAnalyzeResult {
  candidate: CandidateRow;
  warnings: string[];
  model: string;
}

export interface AiConfigExport {
  provider: AiProviderConfig;
  search: AiSearchConfig;
  apiKey: string;
  searchApiKey: string;
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

export interface InstalledContentPackage {
  id: string;
  name: string;
  version: string;
  source: string;
  sourceRef: string | null;
  minAppVersion: string;
  manifestSha256: string;
  itemCount: number;
  installedAt: string;
  updatedAt: string;
}

export interface ContentPackageStats {
  created: number;
  updated: number;
  unchanged: number;
  skippedModified: number;
  skippedDeleted: number;
  skippedUserData: number;
  removed: number;
  keptModified: number;
  keptFavorite: number;
  /** 本次导入中被降级的参数个数：声称 verified 但缺 specRef 或原文对不上 */
  degradedParams: number;
}

export interface ContentPackageItemOutcome {
  itemId: string;
  caseId: string;
  outcome: string;
  version: string;
}

export interface ContentPackageImportReport {
  package: InstalledContentPackage;
  stats: ContentPackageStats;
  items: ContentPackageItemOutcome[];
  itemsTruncated: boolean;
}

export interface ContentPackageUninstallReport {
  packageId: string;
  removed: number;
  keptModified: number;
  keptFavorite: number;
}

export interface ContentPackageUpdateCheck {
  configured: boolean;
  feedUrl: string | null;
  status: "not-configured" | "up-to-date" | "update-available";
  packageId: string | null;
  packageName: string | null;
  installedVersion: string | null;
  latestVersion: string | null;
  totalItems: number;
  added: number;
  changed: number;
  removed: number;
  keptModified: number;
  keptDeleted: number;
  unaffected: number;
  affected: number;
}

export interface ContentPackageUpdateSummary {
  added: number;
  updated: number;
  skipped: number;
  kept: number;
  removed: number;
}

export interface ContentPackageUpdateReport {
  report: ContentPackageImportReport;
  summary: ContentPackageUpdateSummary;
  previousVersion: string | null;
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
  assetsSanitizeHtml: (assetId: string) =>
    call<AssetRecord>("assets_sanitize_html", { assetId }),
  previewOpenHtml: (assetId: string) =>
    call<PreviewHandle>("preview_open_html", { assetId }),

  candidatesList: (status?: CandidateStatus | "all") =>
    call<CandidateRow[]>("candidates_list", { status }),
  candidatesCreate: (input: CandidateInput) =>
    call<CandidateRow>("candidates_create", { input }),
  candidatesReject: (id: string, note?: string) =>
    call<CandidateRow>("candidates_reject", { id, note }),
  candidatesApprove: (id: string, edit?: CandidateEdit) =>
    call<CaseSummary>("candidates_approve", { id, edit }),

  discoveryFetchUrl: (input: { url: string; kind: string }) =>
    call<DiscoveryBatchResult>("discovery_fetch_url", { input }),
  discoverySearch: (input: { query: string; kind: string; limit?: number }) =>
    call<DiscoveryBatchResult>("discovery_search", { input }),

  aiSettingsGet: () => call<AiSettingsSnapshot>("ai_settings_get"),
  aiProviderSet: (input: AiProviderConfig) =>
    call<AiProviderConfig>("ai_provider_set", { input }),
  aiSearchSet: (input: AiSearchConfig) =>
    call<AiSearchConfig>("ai_search_set", { input }),
  aiCredentialSet: (scope: AiScope, key: string) =>
    call<AiCredentialStatus>("ai_credential_set", { scope, key }),
  aiCredentialClear: (scope: AiScope) =>
    call<AiCredentialStatus>("ai_credential_clear", { scope }),
  aiTestConnection: (scope: AiScope) =>
    call<AiTestResult>("ai_test_connection", { scope }),
  aiAnalyze: (input: AiAnalyzeInput) =>
    call<AiAnalyzeResult>("ai_analyze", { input }),
  aiConfigExport: () => call<AiConfigExport>("ai_config_export"),

  catalogList: () => call<CatalogDomain[]>("catalog_list"),
  appInfo: () => call<AppInfo>("app_info"),
  systemOpenUrl: (url: string) => call<void>("system_open_url", { url }),

  contentPackagesList: () =>
    call<InstalledContentPackage[]>("content_packages_list"),
  contentPackageImport: (path: string) =>
    call<ContentPackageImportReport>("content_package_import", { path }),
  contentPackageInstallUrl: (url?: string) =>
    call<ContentPackageImportReport>("content_package_install_url", { url }),
  contentPackageUninstall: (packageId: string) =>
    call<ContentPackageUninstallReport>("content_package_uninstall", { packageId }),
  contentPackageCheckUpdate: (url?: string) =>
    call<ContentPackageUpdateCheck>("content_package_check_update", { url }),
  contentPackageApplyUpdate: (url?: string) =>
    call<ContentPackageUpdateReport>("content_package_apply_update", { url }),
};
