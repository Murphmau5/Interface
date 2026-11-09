use pinyin::ToPinyin;
use sqlx::SqlitePool;

pub const PLATFORMS: [&str; 4] = ["web", "ios", "android", "desktop"];
pub const COMPONENT_LAYERS: [&str; 3] = ["atom", "pattern", "template"];

/// 小写 + 折叠空白；中文保持原样
pub fn normalize_text(input: &str) -> String {
    input
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// 拼音物化：全拼（anniu）+ 首字母（an），用 `|` 分隔
pub fn pinyin_blob(input: &str) -> String {
    let mut full = String::new();
    let mut initials = String::new();

    for ch in input.chars() {
        if let Some(py) = ch.to_pinyin() {
            let plain = py.plain();
            full.push_str(plain);
            if let Some(first) = plain.chars().next() {
                initials.push(first);
            }
        }
    }

    format!("{full}|{initials}")
}

/// 搜索列 = 小写文本；拼音列 = 全拼|首字母
pub fn build_blob(fields: &[&str]) -> (String, String) {
    let joined = fields.join(" ");
    let text = normalize_text(&joined);
    let pinyin = pinyin_blob(&joined);
    (text, pinyin)
}

/// 查询串归一化；空串返回 None。返回 LIKE 模式（含 %）
pub fn search_pattern(search: Option<&str>) -> Option<String> {
    let needle = normalize_text(search?.trim());
    if needle.is_empty() {
        return None;
    }
    Some(format!("%{needle}%"))
}

/// 依据标题 / 摘要 / 类目名重建一条案例的搜索列
pub async fn refresh_case(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    let row: Option<(String, String, String)> = sqlx::query_as(
        r#"
        SELECT c.title, c.summary, COALESCE(cat.label, '')
        FROM cases c
        LEFT JOIN categories cat ON cat.id = c.category_id
        WHERE c.id = ?1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    let Some((title, summary, category)) = row else {
        return Ok(());
    };

    let (text, pinyin) = build_blob(&[&title, &summary, &category]);
    sqlx::query("UPDATE cases SET search_text = ?2, pinyin_text = ?3 WHERE id = ?1")
        .bind(id)
        .bind(text)
        .bind(pinyin)
        .execute(pool)
        .await?;

    Ok(())
}

/// 老库补写：只处理 search_text 为空的行，可重复执行
pub async fn backfill(pool: &SqlitePool) -> Result<usize, sqlx::Error> {
    let ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM cases WHERE deleted_at IS NULL AND search_text = ''")
            .fetch_all(pool)
            .await?;

    for id in &ids {
        refresh_case(pool, id).await?;
    }

    Ok(ids.len())
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use super::*;

    const VOCAB: [&str; 24] = [
        "按钮", "动效", "卡片", "开关", "导航", "玻璃", "反馈", "主题", "输入框", "新拟态",
        "弹窗", "列表", "页面转场", "微交互", "加载", "空状态", "提示", "校验", "侧边栏", "抽屉",
        "骨架屏", "缓动", "圆角", "阴影",
    ];

    fn p50_p95(mut samples: Vec<f64>) -> (f64, f64) {
        samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let pick = |p: f64| {
            let index = ((samples.len() as f64 - 1.0) * p).round() as usize;
            samples[index]
        };
        (pick(0.5), pick(0.95))
    }

    /// 1 万条真实结构假数据上的 LIKE + 拼音基线；用
    /// `cargo test --lib search::tests::baseline_latency -- --ignored --nocapture` 运行
    #[test]
    #[ignore]
    fn baseline_latency() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
            sqlx::query(
                r#"
                CREATE TABLE cases (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL DEFAULT '',
                    category_id TEXT,
                    search_text TEXT NOT NULL DEFAULT '',
                    pinyin_text TEXT NOT NULL DEFAULT '',
                    deleted_at TEXT,
                    updated_at TEXT NOT NULL
                )
                "#,
            )
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("CREATE TABLE categories (id TEXT PRIMARY KEY, label TEXT NOT NULL)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO categories (id, label) VALUES ('motion.micro', '微交互')")
                .execute(&pool)
                .await
                .unwrap();

            let mut tx = pool.begin().await.unwrap();
            for i in 0..10_000usize {
                let a = VOCAB[i % VOCAB.len()];
                let b = VOCAB[(i / 7) % VOCAB.len()];
                let c = VOCAB[(i / 13) % VOCAB.len()];
                let title = format!("{a}{b}方案 {i:05}");
                let summary = format!("{c}在真实界面中的表现，包含{b}与{a}的参数组合。");
                let (text, pinyin) = build_blob(&[&title, &summary, "微交互"]);
                sqlx::query(
                    r#"
                    INSERT INTO cases (id, title, summary, category_id, search_text, pinyin_text, updated_at)
                    VALUES (?1, ?2, ?3, 'motion.micro', ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    "#,
                )
                .bind(format!("case-{i:05}"))
                .bind(&title)
                .bind(&summary)
                .bind(&text)
                .bind(&pinyin)
                .execute(&mut *tx)
                .await
                .unwrap();
            }
            tx.commit().await.unwrap();

            let queries = [
                "按钮", "动效", "卡片", "开关", "玻璃", "反馈", "主题", "微交互", "anniu", "dongxiao",
                "ka", "boli", "侧边栏", "an",
            ];

            let mut samples: Vec<f64> = Vec::new();
            for _ in 0..5 {
                for query in queries {
                    let pattern = search_pattern(Some(query)).unwrap();
                    let started = Instant::now();
                    let rows: Vec<String> = sqlx::query_scalar(
                        r#"
                        SELECT id FROM cases
                        WHERE deleted_at IS NULL
                          AND (search_text LIKE ?1 OR pinyin_text LIKE ?1)
                        ORDER BY updated_at DESC
                        LIMIT 200
                        "#,
                    )
                    .bind(&pattern)
                    .fetch_all(&pool)
                    .await
                    .unwrap();
                    let elapsed = started.elapsed().as_secs_f64() * 1000.0;
                    assert!(!rows.is_empty(), "查询「{query}」应有命中");
                    samples.push(elapsed);
                }
            }

            let (p50, p95) = p50_p95(samples.clone());
            let max = samples.iter().cloned().fold(0.0_f64, f64::max);
            println!(
                "SEARCH_BASELINE rows=10000 samples={} p50={p50:.3}ms p95={p95:.3}ms max={max:.3}ms engine=like+pinyin",
                samples.len()
            );
        });
    }
}
