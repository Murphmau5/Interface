-- 0006_content_packages —— 内容包：来源追踪、条目合并与卸载

-- 来源字段直接挂在 cases 上：合并/卸载都按「条目哈希是否被用户改动」判断，
-- 不依赖外部记录是否完整。
ALTER TABLE cases ADD COLUMN origin_package_id TEXT;
ALTER TABLE cases ADD COLUMN origin_item_id TEXT;
ALTER TABLE cases ADD COLUMN origin_version TEXT;
ALTER TABLE cases ADD COLUMN origin_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_cases_origin_package
    ON cases (origin_package_id)
    WHERE origin_package_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS content_packages (
    id               TEXT PRIMARY KEY NOT NULL,
    name             TEXT NOT NULL,
    version          TEXT NOT NULL,
    source           TEXT NOT NULL,
    source_ref       TEXT,
    min_app_version  TEXT NOT NULL,
    manifest_sha256  TEXT NOT NULL,
    item_count       INTEGER NOT NULL DEFAULT 0,
    installed_at     TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);

-- 每安装一个条目记一行：记录「应用时的内容哈希」，卸载与后续更新都以它为准。
-- state 仅用于展示：active / user-modified / deleted-by-user。
CREATE TABLE IF NOT EXISTS content_package_items (
    package_id       TEXT NOT NULL REFERENCES content_packages(id) ON DELETE CASCADE,
    item_id          TEXT NOT NULL,
    case_id          TEXT,
    item_version     TEXT NOT NULL,
    installed_sha256 TEXT NOT NULL,
    state            TEXT NOT NULL DEFAULT 'active',
    installed_at     TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    PRIMARY KEY (package_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_content_package_items_case
    ON content_package_items (case_id);
