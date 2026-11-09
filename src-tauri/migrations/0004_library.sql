-- 0004_library —— Phase 2 收口：搜索、标签/合集、素材内容寻址、候选审核

-- 搜索列：写入时物化小写文本与拼音（全拼 + 首字母），查询走 LIKE
ALTER TABLE cases ADD COLUMN platform TEXT NOT NULL DEFAULT 'web';
ALTER TABLE cases ADD COLUMN component_layer TEXT;
ALTER TABLE cases ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN pinyin_text TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_cases_filters
    ON cases (kind, platform, confidence, component_layer)
    WHERE deleted_at IS NULL;

-- 不建 search_text 索引：LIKE '%kw%' 用不到它，只会白占磁盘与页缓存

-- 组件层：按已有类目分组回填，不让老数据在筛选里凭空消失
UPDATE cases
SET component_layer = 'atom'
WHERE kind = 'component' AND deleted_at IS NULL
  AND category_id IN ('component.button', 'component.input', 'component.switch', 'component.card');

UPDATE cases
SET component_layer = 'pattern'
WHERE kind = 'component' AND deleted_at IS NULL
  AND component_layer IS NULL AND category_id IS NOT NULL;

-- 标签
CREATE TABLE IF NOT EXISTS tags (
    id         TEXT PRIMARY KEY NOT NULL,
    label      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS case_tags (
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (case_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_case_tags_tag ON case_tags (tag_id);

-- 合集（用户自定义的视图分组，不是内容分类）
CREATE TABLE IF NOT EXISTS collections (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS collection_cases (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    case_id       TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    added_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (collection_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_cases_case ON collection_cases (case_id);

-- 素材：按 sha256 内容寻址，同一文件只存一份
CREATE TABLE IF NOT EXISTS assets (
    id             TEXT PRIMARY KEY NOT NULL,
    sha256         TEXT NOT NULL UNIQUE,
    kind           TEXT NOT NULL,
    mime           TEXT NOT NULL,
    byte_size      INTEGER NOT NULL,
    rel_path       TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    needs_cleaning INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS case_assets (
    case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'attachment',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (case_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_case_assets_asset ON case_assets (asset_id);

-- 候选池：任何外部/生成内容都必须显式审核后才写入 cases
CREATE TABLE IF NOT EXISTS candidates (
    id               TEXT PRIMARY KEY NOT NULL,
    kind             TEXT NOT NULL,
    title            TEXT NOT NULL,
    summary          TEXT NOT NULL DEFAULT '',
    payload_json     TEXT NOT NULL DEFAULT '{}',
    source           TEXT NOT NULL DEFAULT 'manual',
    source_url       TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    review_note      TEXT,
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    decided_at       TEXT,
    approved_case_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidates_status
    ON candidates (status, created_at DESC);
