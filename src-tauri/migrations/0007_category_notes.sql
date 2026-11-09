-- 0007_category_notes —— 类目暂缺说明：触觉反馈在 Windows 桌面端无可用通道
ALTER TABLE categories ADD COLUMN note TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO categories (id, domain, group_label, label, sort_order, note)
VALUES ('fb.haptic', 'feedback', '家族归属', '触觉', 80,
        '暂缺，原因：Windows 桌面端无触觉通道');

UPDATE categories
SET note = '暂缺，原因：Windows 桌面端无触觉通道'
WHERE id = 'fb.haptic';
