-- 0003_categories —— Phase 2：落库的内容域类目 + 案例归类 + 预览规格升 v2
CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY NOT NULL,
    domain      TEXT NOT NULL,
    group_label TEXT NOT NULL,
    label       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_domain
    ON categories (domain, sort_order);

ALTER TABLE cases ADD COLUMN category_id TEXT REFERENCES categories(id);

CREATE INDEX IF NOT EXISTS idx_cases_category
    ON cases (category_id)
    WHERE deleted_at IS NULL;

-- 风格
INSERT OR IGNORE INTO categories (id, domain, group_label, label, sort_order) VALUES
    ('style.neu',       'style', '形态与质感', '新拟态',   10),
    ('style.glass',     'style', '形态与质感', '玻璃拟态', 20),
    ('style.flat',      'style', '形态与质感', '扁平',     30),
    ('style.skeuo',     'style', '形态与质感', '拟物',     40),
    ('style.minimal',   'style', '组织方式',   '极简',     50),
    ('style.bento',     'style', '组织方式',   'Bento',    60),
    ('style.editorial', 'style', '组织方式',   '编辑式',   70),
    ('style.dark',      'style', '组织方式',   'Dark UI',  80);

-- 动效
INSERT OR IGNORE INTO categories (id, domain, group_label, label, sort_order) VALUES
    ('motion.page',    'motion', '转场', '页面转场',   10),
    ('motion.overlay', 'motion', '转场', '浮层转场',   20),
    ('motion.view',    'motion', '转场', '视图切换',   30),
    ('motion.micro',   'motion', '交互', '微交互',     40),
    ('motion.list',    'motion', '交互', '列表与卡片', 50),
    ('motion.scroll',  'motion', '交互', '滚动联动',   60);

-- 反馈与状态
INSERT OR IGNORE INTO categories (id, domain, group_label, label, sort_order) VALUES
    ('feedback.success',    'feedback', '状态反馈', '成功',            10),
    ('feedback.error',      'feedback', '状态反馈', '错误',            20),
    ('feedback.warning',    'feedback', '状态反馈', '警告',            30),
    ('feedback.info',       'feedback', '状态反馈', '信息',            40),
    ('feedback.toast',      'feedback', '反馈组件', 'Toast / Snackbar', 50),
    ('feedback.loading',    'feedback', '反馈组件', '加载与骨架',      60),
    ('feedback.empty',      'feedback', '反馈组件', '空状态与错误页',  70),
    ('feedback.validation', 'feedback', '反馈组件', '表单校验',        80),
    ('feedback.press',      'feedback', '反馈组件', '按压反馈',        90);

-- 组件
INSERT OR IGNORE INTO categories (id, domain, group_label, label, sort_order) VALUES
    ('component.button',       'component', '基础控件 atoms', 'Button',              10),
    ('component.input',        'component', '基础控件 atoms', 'Input / Select',      20),
    ('component.switch',       'component', '基础控件 atoms', 'Switch / Checkbox',   30),
    ('component.card',         'component', '基础控件 atoms', 'Card',                40),
    ('component.nav',          'component', '复合模式 patterns', '导航结构',         50),
    ('component.command',      'component', '复合模式 patterns', '命令面板',         60),
    ('component.settings-row', 'component', '复合模式 patterns', '设置项行',         70),
    ('component.notice',       'component', '复合模式 patterns', '顶部胶囊通知',     80);

-- 主题
INSERT OR IGNORE INTO categories (id, domain, group_label, label, sort_order) VALUES
    ('theme.tokens',   'theme', '结构与映射', 'Token 两层',  10),
    ('theme.parity',   'theme', '结构与映射', '双主题对等',  20),
    ('theme.swap',     'theme', '结构与映射', '换肤策略',    30),
    ('theme.snapshot', 'theme', '案例',       '深浅对照',    40),
    ('theme.system',   'theme', '案例',       '系统跟随',    50);

-- 旧种子归类 + payload 升 v2（只动这三条已知 ID，不碰用户数据）
UPDATE cases
SET category_id = 'motion.list',
    payload_schema_version = 2,
    payload_json = '{"preview":{"v":2,"kind":"motion","durationMs":900,"delayMs":0,"staggerMs":70,"easing":"cubic-bezier(0.32,0.72,0,1)","distance":8,"scale":1,"opacity":0,"blur":0}}'
WHERE id = '8f2a1c60-6d4b-4a1e-9a3f-2c6b7d5e0a11';

UPDATE cases
SET category_id = 'feedback.press',
    payload_schema_version = 2,
    payload_json = '{"preview":{"v":2,"kind":"feedback","triggerMs":0,"holdMs":200,"decayMs":440,"easing":"cubic-bezier(0.2,0.8,0.2,1)","tone":"info"}}'
WHERE id = '5d9e4b70-2c1f-4f7a-8b6d-9e0a3c5d7f22';

UPDATE cases
SET category_id = 'theme.snapshot',
    payload_schema_version = 2,
    payload_json = '{"preview":{"v":2,"kind":"theme","durationMs":1000,"holdMs":600,"easing":"cubic-bezier(0.4,0,0.2,1)"}}'
WHERE id = 'a1c3e580-4b6d-4f9a-b2c8-7e5d0a3b1c33';

-- 每个 kind 至少一条可播放的示例：补组件与新拟态各一条
INSERT OR IGNORE INTO cases
    (id, kind, title, summary, payload_json, payload_schema_version,
     confidence, is_favorite, category_id, created_at, updated_at)
VALUES
    (
        'c4e6a190-8d3f-4b2a-9f71-3a5c8e0d2b44',
        'component',
        '开关切换（Switch）',
        '可点击的 Switch：轨道与滑块两个状态，时长控制切换节奏；右栏可交互，缩略图只做示意。',
        '{"preview":{"v":2,"kind":"component","control":"switch","durationMs":220,"easing":"cubic-bezier(0.32,0.72,0,1)"}}',
        2,
        'verified',
        0,
        'component.switch',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ),
    (
        'e7b9c2a0-5f14-4c8d-8a36-9d1e4b7f0c55',
        'style',
        '新拟态镶嵌面板',
        '内阴影 + 半透明描边的镶嵌质感，不做凸起；圆角与深度由参数面板实时控制。',
        '{"preview":{"v":2,"kind":"style","treatment":"neumorphic","radiusPx":12,"depth":10,"durationMs":320,"easing":"ease-out"}}',
        2,
        'verified',
        0,
        'style.neu',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
