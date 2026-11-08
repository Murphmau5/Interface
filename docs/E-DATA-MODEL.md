# E. 核心数据模型 TypeScript 定义

> 版本：v0.1.0 · 2026-11-08 · 状态：设计稿，不落业务代码
> 约定：时间 ISO 8601 UTC；时长 `*Ms` 毫秒；尺寸 `*Px` CSS 像素；数据库 snake_case ↔ IPC camelCase。
> 每个 kind 一个 Zod schema；AI 输出必须过 schema；`theme` 为候选 kind（待确认）。

## 1. 基础枚举与置信度

```ts
export type CaseKind = 'style' | 'motion' | 'feedback' | 'component' | 'theme'; // theme 待确认
export type ConfirmedCaseKind = Exclude<CaseKind, 'theme'>;

export type Platform = 'desktop' | 'mobile' | 'web';

export type CaseStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export type CaseOrigin =
  | 'manual'
  | 'import'
  | 'ai_link'
  | 'ai_discovery'
  | 'builtin';

export type ConfidenceLevel =
  | 'verified'
  | 'estimated'
  | 'user_defined'
  | 'unknown';

/**
 * 字段级置信度。禁止用案例级 boolean 代替。
 * evidence 记录来源，如 "css:/assets/btn.css"、"ai:vision:v1"、"user:2026-11-08"。
 */
export interface FieldClaim<T> {
  value: T | null;
  confidence: ConfidenceLevel;
  evidence?: string;
}

export interface ConfidenceSummary {
  verified: number;
  estimated: number;
  user_defined: number;
  unknown: number;
}

export const claimed = <T>(
  value: T,
  confidence: ConfidenceLevel = 'unknown',
  evidence?: string,
): FieldClaim<T> => ({ value, confidence, evidence });

export const unknown = <T>(): FieldClaim<T> => ({
  value: null,
  confidence: 'unknown',
});
```

## 2. 通用实体

```ts
export interface Tag {
  id: string;
  name: string;
  namespace: 'style' | 'motion' | 'feedback' | 'component' | 'theme' | 'platform' | 'misc';
  createdAt: string;
}

export type AssetRole =
  | 'preview_source'
  | 'thumbnail'
  | 'image'
  | 'gif'
  | 'video'
  | 'lottie'
  | 'snapshot_light'
  | 'snapshot_dark'
  | 'source_html';

/** 内容寻址对象（物理只存一份） */
export interface AssetObject {
  id: string;
  sha256: string;
  relPath: string;      // objects/<sha256 前两位>/<sha256>
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  createdAt: string;
}

/** 案例与对象的关联（role/origin 属于关联，不属于对象） */
export interface CaseAsset {
  id: string;
  caseId: string;
  assetId: string;
  role: AssetRole;
  origin: 'self_drawn' | 'user_import';
  licenseNote?: string;
  createdAt: string;
}

/** 读取时聚合的 DTO：CaseAsset + AssetObject */
export interface Asset extends CaseAsset {
  sha256: string;
  relPath: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

export type SourceType =
  | 'manual'
  | 'webpage'
  | 'github'
  | 'dribbble'
  | 'behance'
  | 'codepen'
  | 'official_doc'
  | 'other';

export interface Source {
  id: string;
  url?: string;
  urlCanonical?: string;
  siteName?: string;
  author?: string;
  sourceType: SourceType;
  discoveredAt?: string;
  fetchedAt?: string;
  httpStatus?: number;
  robotsAllowed?: boolean;
  licenseNote?: string;
  quoteText?: string;
  createdAt: string;
}

export type PreviewKind =
  | 'html'
  | 'react'
  | 'svg'
  | 'lottie'
  | 'gif'
  | 'video'
  | 'image'
  | 'none';

export type CaseRelationType =
  | 'uses_motion'
  | 'uses_feedback'
  | 'uses_style'
  | 'uses_theme'
  | 'variant_of'
  | 'duplicates';

export interface CaseRelation {
  id: string;
  fromCaseId: string;
  toCaseId: string;
  relation: CaseRelationType;
  note?: string;
  createdAt: string;
}

/**
 * 跨案例引用的唯一真相：`case_relations` 表（D-016）。
 * 任何 payload 内不得再存 `styleRefs / motionRefs / feedbackRefs / relatedIds`，
 * 避免同一关系两份数据、修改后漂移。
 */
```

## 3. 四个已确认 kind 的 payload

### 3.1 风格 Style

```ts
export type StyleFamily =
  | 'neumorphism'
  | 'glassmorphism'
  | 'flat'
  | 'minimalism'
  | 'material'
  | 'fluent'
  | 'liquid_glass'
  | 'skeuomorphism'
  | 'bento'
  | 'editorial'
  | 'dark_ui'
  | 'cyberpunk'
  | 'other';

export interface StyleColorSet {
  background: FieldClaim<string>;   // #RRGGBB 或 CSS 颜色
  primary: FieldClaim<string>;
  secondary: FieldClaim<string>;
  neutralHue?: FieldClaim<number>;  // 建议色相，如 220
}

export interface StyleMaterial {
  shadow: FieldClaim<string>;
  border: FieldClaim<string>;
  radius: FieldClaim<string>;
  surface: FieldClaim<string>;
}

export interface StyleTypography {
  fontFamily: FieldClaim<string>;
  scale: FieldClaim<Record<string, string>>; // token → font-size/line-height
  weightRange: FieldClaim<string>;
}

export interface StyleComponentSpec {
  button: FieldClaim<string>;   // 文字化规格 + 可选 CSS 片段
  card: FieldClaim<string>;
  input: FieldClaim<string>;
}

export interface StyleSnapshotRefs {
  lightAssetId?: string;
  darkAssetId?: string;
}

export interface StylePayload {
  kind: 'style';
  styleFamily: StyleFamily;
  intro: FieldClaim<string>;
  visualTraits: FieldClaim<string[]>;
  colors: StyleColorSet;
  material: StyleMaterial;
  typography: StyleTypography;
  components: StyleComponentSpec;
  motionHints?: FieldClaim<string[]>;
  /** 必填：风格详情必须并排 light/dark */
  snapshots: StyleSnapshotRefs;
}
```

### 3.2 动效 Motion

```ts
export type MotionCategory =
  | 'page'
  | 'card'
  | 'dialog'
  | 'micro'
  | 'other';

export type MotionTrigger =
  | 'click'
  | 'hover'
  | 'focus'
  | 'scroll'
  | 'load'
  | 'route_change'
  | 'state_change'
  | 'timeout'
  | 'unknown';

export type MotionDirection =
  | 'expand' | 'collapse'
  | 'enter' | 'exit'
  | 'up' | 'down' | 'left' | 'right'
  | 'scale' | 'fade' | 'shared_element'
  | 'unknown';

export interface MotionParams {
  category: MotionCategory;
  trigger: FieldClaim<MotionTrigger>;
  durationMs: FieldClaim<number>;
  easing: FieldClaim<string>;        // 如 cubic-bezier(...) / ease-out
  delayMs: FieldClaim<number>;
  direction: FieldClaim<MotionDirection>;
  distancePx: FieldClaim<number>;
  properties: FieldClaim<string[]>;  // transform/opacity/filter…
  states: FieldClaim<string[]>;      // 初始/中间/结束状态名
  reducedMotionFallback?: FieldClaim<string>;
}

export interface MotionPayload {
  kind: 'motion';
  params: MotionParams;
  /** 可调参数清单；不可调（视频/GIF）必须为空并说明 */
  adjustable: Array<
    'play' | 'loop' | 'speed' | 'duration' | 'easing' | 'distance' | 'state' | 'viewport'
  >;
  runtime: 'html' | 'react_spec' | 'svg' | 'lottie' | 'media' | 'none';
}
```

### 3.3 交互反馈 Feedback

```ts
export type FeedbackChannel =
  | 'toast'
  | 'snackbar'
  | 'tooltip'
  | 'inline'
  | 'banner'
  | 'dialog'
  | 'empty_state'
  | 'haptic'
  | 'other';

export type FeedbackSemantic =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

export interface FeedbackTiming {
  appearMs: FieldClaim<number>;
  dwellMs: FieldClaim<number>;
  dismissMs: FieldClaim<number>;
  autoDismiss: FieldClaim<boolean>;
}

export interface FeedbackPayload {
  kind: 'feedback';
  channel: FeedbackChannel;
  semantic: FeedbackSemantic;
  trigger: FieldClaim<string>;      // 什么用户行为触发
  visual: FieldClaim<string>;
  timing: FeedbackTiming;
  interaction: FieldClaim<string>;  // 可点击/可关闭/可撤销
  scenarios: FieldClaim<string[]>;
}
```

### 3.4 组件 Component（atoms / patterns 两层）

```ts
export type ComponentLayer = 'atoms' | 'patterns';

export type AtomName =
  | 'button' | 'input' | 'select' | 'switch' | 'slider'
  | 'checkbox' | 'radio' | 'card' | 'table' | 'avatar'
  | 'badge' | 'progress' | 'other';

export type PatternName =
  | 'capsule_notice'      // 顶部胶囊通知
  | 'top_nav' | 'bottom_nav' | 'bottom_tabs'
  | 'sidebar' | 'command_palette' | 'search_bar'
  | 'settings_row' | 'banner' | 'empty_state'
  | 'pull_to_refresh' | 'pagination' | 'breadcrumb'
  | 'other';

export type PatternPlacement = 'top' | 'bottom' | 'inline' | 'overlay' | 'fullscreen';

export type PatternLifecycle =
  | 'persistent'     // 常驻
  | 'temporary'      // 临时，自动消退
  | 'dismissible';   // 可关闭

/** 仅 patterns 必填的呈现元数据 */
export interface PatternMeta {
  placement: PatternPlacement;
  lifecycle: PatternLifecycle;
  dwellMs: FieldClaim<number>;
  dismissMs: FieldClaim<number>;
  onClick: FieldClaim<string>;
  onDismiss: FieldClaim<string>;
  /** 触发位置与占位，如 "安全区下方 8px" */
  anchor?: FieldClaim<string>;
}

export interface ComponentVisualSpec {
  anatomy: FieldClaim<string[]>;     // 结构分层：容器/图标/文本/动作
  states: FieldClaim<string[]>;      // default/hover/pressed/focus/disabled
  tokens: FieldClaim<Record<string, string>>;
  notes?: FieldClaim<string>;
}

export interface ComponentPayload {
  kind: 'component';
  componentLayer: ComponentLayer;
  atom?: AtomName;                   // layer = atoms 时必填
  pattern?: PatternName;             // layer = patterns 时必填
  patternMeta?: PatternMeta;         // layer = patterns 时必填
  visual: ComponentVisualSpec;
}
```

### 3.5 主题 Theme（候选，待确认）

```ts
export type PolaritySupport = 'light_only' | 'dark_only' | 'both' | 'follow_system';

export interface ThemeTokenOverride {
  token: string;                     // 语义 Token 名
  light?: FieldClaim<string>;
  dark?: FieldClaim<string>;
}

export interface ThemeInheritance {
  parentThemeId?: string;
  overrides: ThemeTokenOverride[];
  conflictPolicy: FieldClaim<'child_wins' | 'parent_wins' | 'manual'>;
}

export interface ThemePayload {
  kind: 'theme';
  polarity: PolaritySupport;
  brandSeed: FieldClaim<string>;
  accentDerivation: FieldClaim<string>;  // 强调色如何由品牌色推导
  tokenOverrides: ThemeInheritance;
  systemFollowing: FieldClaim<boolean>;
  snapshots: StyleSnapshotRefs;           // 复用双快照引用结构
}
```

## 4. 判别联合与案例实体

```ts
export type CasePayload =
  | StylePayload
  | MotionPayload
  | FeedbackPayload
  | ComponentPayload
  | ThemePayload;   // 待确认

export type CaseOf<K extends CaseKind> = Extract<CasePayload, { kind: K }>;

export interface CaseBase {
  id: string;
  code: string;                  // STY-0001 / MOT-0001 / FBK-0001 / CMP-0001 / THM-0001
  kind: CaseKind;
  componentLayer?: ComponentLayer; // 冗余列，仅 component
  name: string;
  description?: string;
  platforms: Platform[];
  status: CaseStatus;
  origin: CaseOrigin;
  sourceId?: string;
  aiTaskId?: string;
  previewKind: PreviewKind;
  previewEntry?: string;
  isFavorite: boolean;
  lastViewedAt?: string;
  viewCount: number;
  confidenceSummary: ConfidenceSummary;
  payloadSchemaVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  createdBy: 'user' | 'ai';
}

export type Case = CaseBase & { payload: CasePayload };

/** 类型收窄帮助：kind 与 payload.kind 必须一致 */
export type TypedCase<K extends CaseKind> =
  CaseBase & { kind: K; payload: CaseOf<K> };
```

## 5. Zod Schema（结构示例）

```ts
import { z } from 'zod';

export const confidenceLevelSchema = z.enum([
  'verified', 'estimated', 'user_defined', 'unknown',
]);

export const fieldClaimSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: confidenceLevelSchema,
    evidence: z.string().optional(),
  });

const motionPayloadSchema = z.object({
  kind: z.literal('motion'),
  params: z.object({
    category: z.enum(['page', 'card', 'dialog', 'micro', 'other']),
    trigger: fieldClaimSchema(z.enum([
      'click', 'hover', 'focus', 'scroll', 'load', 'route_change',
      'state_change', 'timeout', 'unknown',
    ])),
    durationMs: fieldClaimSchema(z.number().int().min(0).max(10000)),
    easing: fieldClaimSchema(z.string().min(1)),
    delayMs: fieldClaimSchema(z.number().int().min(0).max(10000)),
    direction: fieldClaimSchema(z.enum([
      'expand', 'collapse', 'enter', 'exit', 'up', 'down', 'left', 'right',
      'scale', 'fade', 'shared_element', 'unknown',
    ])),
    distancePx: fieldClaimSchema(z.number().min(0).max(2000)),
    properties: fieldClaimSchema(z.array(z.string())),
    states: fieldClaimSchema(z.array(z.string())),
    reducedMotionFallback: fieldClaimSchema(z.string()).optional(),
  }),
  adjustable: z.array(z.enum([
    'play', 'loop', 'speed', 'duration', 'easing', 'distance', 'state', 'viewport',
  ])),
  runtime: z.enum(['html', 'react_spec', 'svg', 'lottie', 'media', 'none']),
});

const componentPayloadSchema = z.discriminatedUnion('componentLayer', [
  z.object({
    kind: z.literal('component'),
    componentLayer: z.literal('atoms'),
    atom: z.enum([
      'button', 'input', 'select', 'switch', 'slider', 'checkbox', 'radio',
      'card', 'table', 'avatar', 'badge', 'progress', 'other',
    ]),
    visual: z.object({
      anatomy: fieldClaimSchema(z.array(z.string())),
      states: fieldClaimSchema(z.array(z.string())),
      tokens: fieldClaimSchema(z.record(z.string(), z.string())),
      notes: fieldClaimSchema(z.string()).optional(),
    }),
  }),
  z.object({
    kind: z.literal('component'),
    componentLayer: z.literal('patterns'),
    pattern: z.enum([
      'capsule_notice', 'top_nav', 'bottom_nav', 'bottom_tabs', 'sidebar',
      'command_palette', 'search_bar', 'settings_row', 'banner', 'empty_state',
      'pull_to_refresh', 'pagination', 'breadcrumb', 'other',
    ]),
    patternMeta: z.object({
      placement: z.enum(['top', 'bottom', 'inline', 'overlay', 'fullscreen']),
      lifecycle: z.enum(['persistent', 'temporary', 'dismissible']),
      dwellMs: fieldClaimSchema(z.number().int().min(0)),
      dismissMs: fieldClaimSchema(z.number().int().min(0)),
      onClick: fieldClaimSchema(z.string()),
      onDismiss: fieldClaimSchema(z.string()),
      anchor: fieldClaimSchema(z.string()).optional(),
    }),
    visual: z.object({
      anatomy: fieldClaimSchema(z.array(z.string())),
      states: fieldClaimSchema(z.array(z.string())),
      tokens: fieldClaimSchema(z.record(z.string(), z.string())),
      notes: fieldClaimSchema(z.string()).optional(),
    }),
  }),
]);

export const casePayloadSchema = z.union([
  /* stylePayloadSchema, feedbackPayloadSchema, componentPayloadSchema, themePayloadSchema */
  motionPayloadSchema,
  componentPayloadSchema,
] as const);
```

> 完整实现时（Phase 1）补齐 style / feedback / theme schema，并加入「`payload.kind` 必须等于 `Case.kind`」「AI 不得输出 verified」的跨字段校验。

## 6. AI 输出与审核

```ts
export interface AiFieldResult<T> {
  value: T | null;
  confidence: Exclude<ConfidenceLevel, 'verified'>; // AI 永远不能给 verified
  rationale?: string;
}

export interface AiCaseDraft {
  name: string;
  kind: CaseKind;
  platforms: Platform[];
  tags: string[];
  description?: string;
  payload: CasePayload;
  promptDrafts?: Partial<Record<PromptTarget, string>>;
  warnings?: string[];
}

export type AiTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface AiTask {
  id: string;
  caseId?: string;
  discoveryTaskId?: string;
  type: 'analyze_image' | 'analyze_video' | 'analyze_webpage'
      | 'generate_prompt' | 'compose_spec';
  providerId: string;
  model: string;
  status: AiTaskStatus;
  errorCode?: string;
  tokensIn?: number;
  tokensOut?: number;
  costEstimate?: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export type PromptTarget =
  | 'general'
  | 'ui_visual'
  | 'motion'
  | 'css'
  | 'react'
  | 'react_native'
  | 'flutter'
  | 'design_spec';

export interface Prompt {
  id: string;
  caseId: string;
  target: PromptTarget;
  contentMd: string;
  generatedBy: 'ai' | 'user' | 'template';
  model?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

## 7. 查询、筛选与列表 DTO

```ts
export type ActiveType = 'all' | CaseKind;

export type LibraryView = 'grid' | 'table';

export type CaseSort =
  | 'recent_added'
  | 'recent_viewed'
  | 'most_viewed'
  | 'most_favorite'
  | 'name_asc';

/** 搜索作用域：默认本地；联网需显式触发（Ctrl+Enter 或点击提示） */
export type SearchScope = 'local' | 'network';

export interface Candidate {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  author?: string;
  title?: string;
  kindGuess: CaseKind | 'unknown';
  payload: CasePayload;
  discoveryTaskId?: string;
  origin: 'network_search' | 'url_paste' | 'ai_discovery';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewNote?: string;
  approvedCaseId?: string;
  discoveredAt: string;
  reviewedAt?: string;
}

/** 网络候选只在此结构中呈现，不并入 CaseListItem，不参与本地排序 */
export interface CandidateListItem {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  author?: string;
  title?: string;
  kindGuess: CaseKind | 'unknown';
  discoveredAt: string;
  badge: 'network_candidate' | 'unreviewed';
}

export interface CaseFilters {
  activeType: ActiveType;        // 左栏与底部条带共用（D-018）
  platform?: Platform;
  status?: CaseStatus;
  origin?: CaseOrigin;
  confidence?: ConfidenceLevel;
  componentLayer?: ComponentLayer;
  hasDualSnapshot?: boolean;
  tags?: string[];
  query?: string;                // 顶部搜索
}

export interface CaseListQuery extends CaseFilters {
  sort: CaseSort;
  limit: number;
  offset: number;
}

export interface CaseListItem {
  id: string;
  code: string;
  kind: CaseKind;
  name: string;
  platforms: Platform[];
  status: CaseStatus;
  origin: CaseOrigin;
  confidenceSummary: ConfidenceSummary;
  thumbnailAssetId?: string;
  hasDualSnapshot: boolean;
  isFavorite: boolean;
  updatedAt: string;
  componentLayer?: ComponentLayer;
}

export interface CaseDetail extends Case {
  tags: Tag[];
  assets: Asset[];
  source?: Source;
  prompts: Prompt[];
  relations: CaseRelation[];
  historyCount: number;
}

export interface TypeCounts {
  all: number;
  style: number;
  motion: number;
  feedback: number;
  component: number;
  theme: number;   // 未确认时返回 0 并标记 unavailable
}

export interface CaseCounts {
  total: number;
  byType: TypeCounts;
  pendingReview: number;
  favorites: number;
  recent: number;
}
```

## 8. 设置与主题

```ts
export type ThemeMode = 'system' | 'dark' | 'light';

export interface AppSettings {
  'theme.mode': ThemeMode;                 // 默认 'system'
  'ui.density': 'comfortable' | 'compact';
  'ui.listView': LibraryView;
  'preview.defaultViewport': 'mobile' | 'desktop';
  'preview.loop': boolean;
  'preview.speed': number;                 // 0.25–3
  'ai.providerId': string | null;
  'ai.baseUrl': string | null;             // OpenAI 兼容端点，非密钥
  'ai.model': string | null;
  'ai.timeoutMs': number;
  'ai.maxConcurrent': number;
  'ai.maxOutputTokens': number;
  'search.providerId': string | null;
  'discovery.scheduleEnabled': boolean; // 预留；V1 默认 false；审核不可关闭
  'storage.rootPath': string | null;
  'backup.autoIntervalDays': number;       // 0 = 关闭
}

export interface SystemThemeInfo {
  mode: 'dark' | 'light';
  accentColor?: string;   // Windows 强调色，仅作参考，不直接作为品牌强调色
}
```

## 9. 预览协议

```ts
export type PreviewAction =
  | 'play' | 'pause' | 'replay' | 'reset'
  | 'setLoop' | 'setSpeed' | 'setDuration'
  | 'setEasing' | 'setDistance' | 'setState' | 'setViewport';

export interface PreviewManifest {
  caseId: string;
  entryUrl: string;             // preview://case/<id>/...
  runtime: 'html' | 'react_spec' | 'svg' | 'lottie' | 'media';
  viewport: { width: number; height: number; scale: number };
  capabilities: PreviewAction[];
  adjustable: Array<'duration' | 'easing' | 'distance' | 'state'>;
  csp: string;
}

export type HostToPreviewMessage =
  | { type: 'init'; params: Record<string, unknown> }
  | { type: 'control'; action: PreviewAction; value?: unknown };

export type PreviewToHostMessage =
  | { type: 'ready' }
  | { type: 'state'; playing: boolean; progress: number; stateName?: string }
  | { type: 'error'; code: string; message: string };
```

## 10. Provider 接口

完整定义、能力矩阵与配置见 [F-PROVIDERS.md](F-PROVIDERS.md)。类型基线：

```ts
export interface AIProvider {
  readonly id: string;
  readonly capabilities: AiCapability[];
  chat(input: ChatInput, signal?: AbortSignal): Promise<ChatResult>;
  analyzeImage(input: ImageInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  analyzeVideo(input: VideoInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  analyzeWebPage(input: WebPageInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  generatePrompt(input: PromptInput, signal?: AbortSignal): Promise<string>;
  classifyCase(input: ClassifyInput, signal?: AbortSignal): Promise<AiCaseDraft>;
  extractDesignTokens(input: TokenInput, signal?: AbortSignal): Promise<TokenResult>;
}

export interface SearchProvider {
  readonly id: string;
  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult[]>;
  getResults(taskId: string): Promise<SearchResult[]>;
  getPageContent(url: string, signal?: AbortSignal): Promise<PageContent>;
  getSourceMetadata(url: string): Promise<SourceMetadata>;
}
```
