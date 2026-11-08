# D. 数据库 ER 关系设计

> 版本：v0.1.0 · 2026-11-08 · 数据库：SQLite 3 · 迁移目录 `src-tauri/migrations/`
> 说明：本设计采用「单主表 + kind + 类型化 payload + 关联表」（DECISIONS D-003，待用户确认）。
> `theme` kind 为候选（D-017），不影响既有表结构。

## 1. ER 图

```mermaid
erDiagram
    CASES ||--o{ CASE_TAGS : has
    TAGS ||--o{ CASE_TAGS : used_by
    CASES ||--o{ CASE_RELATIONS : from
    CASES ||--o{ CASE_RELATIONS : to
    SOURCES ||--o{ CASES : primary_source
    CASES ||--o{ CASE_ASSETS : links
    ASSETS ||--o{ CASE_ASSETS : referenced_by
    CASES ||--o{ PROMPTS : generates
    CASES ||--o{ AI_ANALYSIS : analyzed_by
    CASES ||--o{ CASE_HISTORY : versions
    CASES ||--o{ COLLECTION_CASES : in
    COLLECTIONS ||--o{ COLLECTION_CASES : contains
    AI_TASKS ||--o{ AI_ANALYSIS : produces
    AI_TASKS }o--o| CASES : targets
    DISCOVERY_TASKS ||--o{ AI_TASKS : spawns
    DISCOVERY_TASKS ||--o{ CANDIDATES : produces
    CANDIDATES ||--o| CASES : approved_to
```

> `CASES` 同时被 `case_relations` 的 from/to 引用，图中拆成两条边以表达自关联。
> `settings` 为独立键值表，无外键。`review_queue` 是视图，不是实体表。

## 2. 表字典

### 2.1 `cases`（案例主表）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID v7（时间有序） |
| `code` | TEXT | UNIQUE NOT NULL | 人读编号，如 `STY-0001` / `MOT-0001` / `FBK-0001` / `CMP-0001` / `THM-0001` |
| `kind` | TEXT | NOT NULL, INDEX | `style/motion/feedback/component`（`theme` 候选）；应用层枚举，不写 DB CHECK |
| `component_layer` | TEXT | NULL, INDEX | 仅 component：`atoms` / `patterns` |
| `name` | TEXT | NOT NULL | 案例名称 |
| `description` | TEXT | NULL | 描述 |
| `platforms_json` | TEXT | NOT NULL | `["desktop","mobile","web"]` |
| `payload_json` | TEXT | NOT NULL | 该 kind 的类型化参数（Zod 校验） |
| `payload_schema_version` | INTEGER | NOT NULL DEFAULT 1 | payload 版本，用于迁移 |
| `confidence_summary_json` | TEXT | NULL | 各置信度级别计数，用于列表芯片 |
| `status` | TEXT | NOT NULL, INDEX | `draft / pending_review / approved / rejected / archived` |
| `origin` | TEXT | NOT NULL | `manual / import / ai_link / ai_discovery / builtin` |
| `source_id` | TEXT | FK → sources.id, NULL | 主来源 |
| `ai_task_id` | TEXT | FK → ai_tasks.id, NULL | 首次分析任务 |
| `discovery_task_id` | TEXT | FK → discovery_tasks.id, NULL, INDEX | 由哪次发现任务产生 |
| `preview_kind` | TEXT | NULL | `html / react / svg / lottie / gif / video / image / none` |
| `preview_entry` | TEXT | NULL | 指向 `preview_source` 对象的入口名，如 `index.html`（对象解析见 `case_assets`） |
| `is_favorite` | INTEGER | NOT NULL DEFAULT 0, INDEX | 0/1 |
| `last_viewed_at` | TEXT | NULL, INDEX | ISO 8601 UTC |
| `view_count` | INTEGER | NOT NULL DEFAULT 0 | 打开详情计数 |
| `created_at` | TEXT | NOT NULL | ISO 8601 UTC |
| `updated_at` | TEXT | NOT NULL | ISO 8601 UTC |
| `deleted_at` | TEXT | NULL, INDEX | 软删除时间；NULL = 未删除 |
| `created_by` | TEXT | NOT NULL | `user / ai` |

索引：

```sql
CREATE INDEX idx_cases_kind_status ON cases(kind, status, deleted_at);
CREATE INDEX idx_cases_component_layer ON cases(component_layer) WHERE component_layer IS NOT NULL;
CREATE INDEX idx_cases_updated ON cases(updated_at DESC);
CREATE INDEX idx_cases_favorite ON cases(is_favorite) WHERE is_favorite = 1;
CREATE INDEX idx_cases_viewed ON cases(last_viewed_at DESC) WHERE last_viewed_at IS NOT NULL;
CREATE UNIQUE INDEX idx_cases_code ON cases(code) WHERE deleted_at IS NULL;
```

约束说明：

- `kind` 故意不加 CHECK：主题域确认后可直接扩展，不触发 SQLite 表重建。
- `component_layer` 冗余为列，是为了 atoms/patterns 筛选与统计；真实值仍在 payload 内，写入时同步。

### 2.2 `tags`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | UUID |
| `name` | TEXT | NOT NULL | 标签名，小写归一 |
| `namespace` | TEXT | NOT NULL | `style/motion/feedback/component/theme/platform/misc` |
| `created_at` | TEXT | NOT NULL | |

唯一：`UNIQUE(namespace, name)`。

> 原需求中的 `categories` 表由「kind + tags.namespace + 预设标签」替代，不单独建表（DECISIONS D-003 的代价之一）。

### 2.3 `case_tags`

| 字段 | 类型 | 约束 |
|---|---|---|
| `case_id` | TEXT | FK → cases, ON DELETE CASCADE |
| `tag_id` | TEXT | FK → tags, ON DELETE CASCADE |
| `source` | TEXT | `user / ai` |
| `created_at` | TEXT | |

PK：`(case_id, tag_id)`；INDEX：`(tag_id, case_id)`。

### 2.4 `case_relations`（跨域关联，D-016）

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | TEXT | PK |
| `from_case_id` | TEXT | FK → cases, ON DELETE CASCADE |
| `to_case_id` | TEXT | FK → cases, ON DELETE CASCADE |
| `relation` | TEXT | `uses_motion / uses_feedback / uses_style / uses_theme / variant_of / duplicates` |
| `note` | TEXT | NULL |
| `created_at` | TEXT | |

UNIQUE：`(from_case_id, to_case_id, relation)`；INDEX：`(to_case_id, relation)`。

> 用于「顶部胶囊通知（组件）→ 关联 信息提示（反馈） + 自顶部滑入（动效）」，不复制对方参数。

### 2.5 `sources`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `url` | TEXT | NULL | 原始 URL；手动导入可为空 |
| `url_canonical` | TEXT | NULL, INDEX | 规范化 URL（去 utm、统一 scheme/host） |
| `site_name` | TEXT | NULL | Dribbble / GitHub 等 |
| `author` | TEXT | NULL | 能确认时填写 |
| `source_type` | TEXT | NOT NULL | `manual / webpage / github / dribbble / behance / codepen / official_doc / other` |
| `discovered_at` | TEXT | NULL | 发现时间 |
| `fetched_at` | TEXT | NULL | 抓取时间 |
| `http_status` | INTEGER | NULL | 抓取状态 |
| `robots_allowed` | INTEGER | NULL | 1/0/NULL 未知 |
| `license_note` | TEXT | NULL | 权限与版权说明 |
| `quote_text` | TEXT | NULL | 允许保存的引用原文 |
| `created_at` | TEXT | NOT NULL | |

唯一：`UNIQUE(url_canonical, source_type)`（NULL 不参与唯一约束；重复由应用层判定）。

### 2.6 `assets`（内容寻址对象库）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | 对象 id |
| `sha256` | TEXT | NOT NULL, UNIQUE, INDEX | 内容寻址键 |
| `rel_path` | TEXT | NOT NULL | `objects/<sha256 前两位>/<sha256>` |
| `mime` | TEXT | NOT NULL | |
| `bytes` | INTEGER | NOT NULL | |
| `width` | INTEGER | NULL | |
| `height` | INTEGER | NULL | |
| `duration_ms` | INTEGER | NULL | 视频/GIF |
| `created_at` | TEXT | NOT NULL | |

- 对象库与案例解耦：同一素材可被多个案例引用，物理只存一份。

### 2.6.1 `case_assets`（案例与对象关联）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `case_id` | TEXT | FK → cases, INDEX, ON DELETE CASCADE | |
| `asset_id` | TEXT | FK → assets, INDEX, ON DELETE RESTRICT | |
| `role` | TEXT | NOT NULL | `preview_source / thumbnail / image / gif / video / lottie / snapshot_light / snapshot_dark / source_html` |
| `license_note` | TEXT | NULL | 来源与授权说明（用户导入必填） |
| `origin` | TEXT | NOT NULL | `self_drawn / user_import` |
| `created_at` | TEXT | NOT NULL | |

UNIQUE：`(case_id, asset_id, role)`。

- 删除关联不删对象；对象清理由引用计数任务在无引用后执行。

### 2.7 `prompts`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `case_id` | TEXT | FK → cases, INDEX, CASCADE | |
| `target` | TEXT | NOT NULL | `general / ui_visual / motion / css / react / react_native / flutter / design_spec` |
| `content_md` | TEXT | NOT NULL | Markdown 正文，含置信度标记 |
| `generated_by` | TEXT | NOT NULL | `ai / user / template` |
| `model` | TEXT | NULL | 生成模型标识 |
| `version` | INTEGER | NOT NULL DEFAULT 1 | |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

UNIQUE：`(case_id, target, version)`。

### 2.8 `collections` / `collection_cases`

`collections`：`id PK`、`name`、`description`、`created_at`、`updated_at`。
`collection_cases`：`collection_id FK CASCADE`、`case_id FK CASCADE`、`added_at`、`order_index`；PK `(collection_id, case_id)`。

> 「我的收藏」是视图：`is_favorite = 1`；`collections` 用于自定义合集，两者不混用。

### 2.9 `ai_tasks`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `case_id` | TEXT | FK → cases, NULL | 已有案例的分析/提示词任务 |
| `discovery_task_id` | TEXT | FK → discovery_tasks, NULL | 发现流程内任务 |
| `type` | TEXT | NOT NULL | `analyze_image / analyze_video / analyze_webpage / generate_prompt / compose_spec` |
| `provider_id` | TEXT | NOT NULL | 如 `openai_compat` |
| `model` | TEXT | NOT NULL | |
| `status` | TEXT | NOT NULL, INDEX | `queued / running / succeeded / failed / canceled` |
| `input_json` | TEXT | NULL | 不含密钥；素材以引用表示 |
| `output_json` | TEXT | NULL | 原始输出，供诊断 |
| `error_code` | TEXT | NULL | 统一错误码 |
| `tokens_in` / `tokens_out` | INTEGER | NULL | |
| `cost_estimate` | REAL | NULL | 本地估算 |
| `cancel_requested` | INTEGER | NOT NULL DEFAULT 0 | |
| `started_at` / `finished_at` | TEXT | NULL | |
| `created_at` | TEXT | NOT NULL | |

### 2.10 `ai_analysis`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `case_id` | TEXT | FK → cases, INDEX, CASCADE | |
| `task_id` | TEXT | FK → ai_tasks | |
| `result_json` | TEXT | NOT NULL | 已通过 Schema 的结构化结果 |
| `schema_version` | INTEGER | NOT NULL | |
| `accepted` | INTEGER | NOT NULL | 是否被采纳 |
| `created_at` | TEXT | NOT NULL | |

### 2.11 `discovery_tasks`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `query_text` | TEXT | NOT NULL | 用户自然语言需求 |
| `filters_json` | TEXT | NULL | 目标分类/平台/来源/数量 |
| `sources_json` | TEXT | NULL | 启用的 Search Provider 与站点 |
| `limit_n` | INTEGER | NOT NULL | 目标数量 |
| `status` | TEXT | NOT NULL, INDEX | `queued / running / paused / completed / failed / canceled` |
| `found_count` / `new_count` / `dup_count` / `failed_count` | INTEGER | DEFAULT 0 | |
| `cancel_requested` | INTEGER | NOT NULL DEFAULT 0 | |
| `schedule_json` | TEXT | NULL | 预留定时；V1 不启用 |
| `created_at` / `started_at` / `finished_at` | TEXT | NULL | |

### 2.11.1 `candidates`（网络候选池，与正式库分表）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `source_url` | TEXT | NOT NULL, INDEX | 来源 URL |
| `source_domain` | TEXT | NOT NULL, INDEX | 展示用域名 |
| `author` | TEXT | NULL | 可确认时记录 |
| `title` | TEXT | NULL | 候选标题 |
| `kind_guess` | TEXT | NULL | `style / motion / feedback / component / theme / unknown` |
| `payload_json` | TEXT | NOT NULL | 候选结构化摘要（未经审核，置信度不得为 `verified`） |
| `discovery_task_id` | TEXT | FK → discovery_tasks, NULL, INDEX | 来自自动发现时记录 |
| `origin` | TEXT | NOT NULL | `network_search / url_paste / ai_discovery` |
| `status` | TEXT | NOT NULL, INDEX | `pending / approved / rejected / expired` |
| `review_note` | TEXT | NULL | |
| `approved_case_id` | TEXT | FK → cases, NULL | 审核通过后回填 |
| `discovered_at` | TEXT | NOT NULL | |
| `reviewed_at` | TEXT | NULL | |

- **候选池与正式库物理分表**：网络候选不得直接写入 `cases`；必须经审核后才生成案例。
- 候选不参与本地搜索排序与本地计数；本地搜索只查 `cases`。

### 2.12 `settings`

| 字段 | 类型 | 约束 |
|---|---|---|
| `key` | TEXT | PK |
| `value_json` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |

基线键：`theme.mode`、`ui.density`、`ui.listView`、`preview.defaultViewport`、`preview.loop`、`preview.speed`、`ai.providerId`、`ai.baseUrl`、`ai.model`、`ai.timeoutMs`、`ai.maxConcurrent`、`ai.maxOutputTokens`、`search.providerId`、`discovery.scheduleEnabled`、`storage.rootPath`、`backup.autoIntervalDays`。密钥不入本表。**不存在 `discovery.requireApproval`**：审核强制开启。

### 2.13 `case_history`

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | TEXT | PK |
| `case_id` | TEXT | FK → cases, INDEX, CASCADE |
| `action` | TEXT | `create / update / approve / reject / archive / restore / merge_duplicate` |
| `before_json` / `after_json` | TEXT | NULL |
| `actor` | TEXT | `user / ai / system` |
| `created_at` | TEXT | NOT NULL |

## 3. 视图

```sql
CREATE VIEW v_review_queue AS
SELECT c.id, c.code, c.kind, c.name, c.status, c.created_at, c.origin,
       s.site_name, s.url
FROM cases c
LEFT JOIN sources s ON s.id = c.source_id
WHERE c.status = 'pending_review' AND c.deleted_at IS NULL
ORDER BY c.created_at ASC;
```

## 4. FTS5

```sql
CREATE VIRTUAL TABLE cases_fts USING fts5(
  name, description, tags_text, prompts_text,
  content='', tokenize='unicode61 remove_diacritics 2'
);
```

- 由应用层在写事务内同步（insert/update/delete 触发器或仓储内显式维护）。
- 中文分词：`unicode61` 对中文按连续字符切分，效果有限；V1 采用「FTS + `LIKE` 兜底 + 标签精确匹配」，是否引入外部分词待确认（B 文档 §15）。
- 预留 `embedding` 扩展位：不建表，V1 不实现（D-013）。

## 5. 迁移、软删除与恢复

- 迁移文件：`0001_init.sql` 起顺序编号；自写迁移器以 `schema_migrations(version, applied_at, checksum)` 记录版本（rusqlite 方案）。
- 每个迁移必须：可重复执行校验、失败回滚（事务内）、在 `docs/` 记录变更。
- 软删除：`deleted_at` 置时间；列表默认 `WHERE deleted_at IS NULL`；恢复置 NULL 并写 `case_history`。
- 唯一约束与软删除：`code` 用「仅未删除行」的部分唯一索引，避免删除后无法复用编号。
- 备份导入前校验 `schema_version`，不兼容时先迁移再导入。

## 6. 数据一致性规则

1. `component_layer` 必须与 payload 内 `componentLayer` 一致；写入时由领域层统一填充。
2. `confidence_summary_json` 由 payload 计算，不允许人工手写。
3. `preview_entry` 必须能在 `case_assets` 中找到对应 `preview_source` 对象且 role 匹配，否则预览命令返回 `E_PREVIEW_SANDBOX`。
4. `status='approved'` 才进入默认知识库列表；`draft/pending_review/rejected` 仅在对应视图出现。
5. 删除案例时：先删 `case_assets` 关联，对象进入回收期由引用计数任务回收（不立即物理删除）。
6. 关联引用不复制参数：详情页聚合查询，主域修改即时反映到关联方展示。
