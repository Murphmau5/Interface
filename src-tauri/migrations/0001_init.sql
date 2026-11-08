-- 0001_init —— Phase 1 最小 schema
-- settings：键值型用户设置（主题、面板宽度、实验记录等）
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- cases：单主表 + kind 判别 + 类型化 JSON payload
CREATE TABLE IF NOT EXISTS cases (
    id                     TEXT PRIMARY KEY NOT NULL,
    kind                   TEXT NOT NULL,
    title                  TEXT NOT NULL,
    summary                TEXT NOT NULL DEFAULT '',
    payload_json           TEXT NOT NULL DEFAULT '{}',
    payload_schema_version INTEGER NOT NULL DEFAULT 1,
    confidence             TEXT NOT NULL DEFAULT 'unknown',
    is_favorite            INTEGER NOT NULL DEFAULT 0,
    deleted_at             TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_kind
    ON cases (kind)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cases_updated
    ON cases (updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cases_favorite
    ON cases (is_favorite)
    WHERE deleted_at IS NULL;
