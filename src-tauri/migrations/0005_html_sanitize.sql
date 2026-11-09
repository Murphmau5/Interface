-- 0005_html_sanitize —— 导入 HTML 的入库清洗状态
-- pending：尚未清洗（历史数据默认）
-- cleaned：已通过白名单清洗，可进入预览
-- rejected：无法清洗（超限 / 非 UTF-8 / 含 NUL），保留原文件但不允许预览
-- not-applicable：非 HTML 素材

ALTER TABLE assets ADD COLUMN sanitize_state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE assets ADD COLUMN sanitized_rel_path TEXT;
ALTER TABLE assets ADD COLUMN sanitize_report TEXT;
ALTER TABLE assets ADD COLUMN sanitized_at TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_sanitize_state ON assets (sanitize_state);
