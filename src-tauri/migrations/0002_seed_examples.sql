-- 0002_seed_examples —— Phase 1 内置示例（用于真实悬停预览）
-- payload 最小结构：{"preview":{"type","durationMs","easing","staggerMs"}}
INSERT OR IGNORE INTO cases
    (id, kind, title, summary, payload_json, payload_schema_version,
     confidence, is_favorite, created_at, updated_at)
VALUES
    (
        '8f2a1c60-6d4b-4a1e-9a3f-2c6b7d5e0a11',
        'motion',
        '列表错峰入场',
        '四条记录以 70ms 间隔上移淡入；悬停即播，移出回首帧。',
        '{"preview":{"type":"motion.stagger","durationMs":900,"easing":"cubic-bezier(0.32,0.72,0,1)","staggerMs":70}}',
        1,
        'verified',
        0,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ),
    (
        '5d9e4b70-2c1f-4f7a-8b6d-9e0a3c5d7f22',
        'feedback',
        '按钮按压反馈',
        '按下时下压 2px 并轻微收缩，松开回弹；640ms 完成一次反馈循环。',
        '{"preview":{"type":"motion.press","durationMs":640,"easing":"cubic-bezier(0.2,0.8,0.2,1)","staggerMs":0}}',
        1,
        'verified',
        0,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ),
    (
        'a1c3e580-4b6d-4f9a-b2c8-7e5d0a3b1c33',
        'theme',
        '深浅主题交叉淡入',
        '深色底板与浅色底板交叉淡入，1000ms 完成一次换肤；悬停可重复观看。',
        '{"preview":{"type":"theme.crossfade","durationMs":1000,"easing":"cubic-bezier(0.4,0,0.2,1)","staggerMs":0}}',
        1,
        'verified',
        0,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    );
