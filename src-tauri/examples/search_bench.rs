//! 搜索基线量具：1 万条真实结构假数据，统计 LIKE + 拼音的 P50 / P95。
//! 运行：cargo run --example search_bench
//! 不链接 Tauri，避免加载 WebView2 运行时。

#[path = "../src/search.rs"]
mod search;

use std::time::Instant;

use sqlx::SqlitePool;

const VOCAB: [&str; 24] = [
    "按钮", "动效", "卡片", "开关", "导航", "玻璃", "反馈", "主题", "输入框", "新拟态", "弹窗",
    "列表", "页面转场", "微交互", "加载", "空状态", "提示", "校验", "侧边栏", "抽屉", "骨架屏",
    "缓动", "圆角", "阴影",
];

fn p50_p95(mut samples: Vec<f64>) -> (f64, f64) {
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pick = |p: f64| {
        let index = ((samples.len() as f64 - 1.0) * p).round() as usize;
        samples[index]
    };
    (pick(0.5), pick(0.95))
}

#[tokio::main]
async fn main() {
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

    let setup = Instant::now();
    let mut tx = pool.begin().await.unwrap();
    for i in 0..10_000usize {
        let a = VOCAB[i % VOCAB.len()];
        let b = VOCAB[(i / 7) % VOCAB.len()];
        let c = VOCAB[(i / 13) % VOCAB.len()];
        let title = format!("{a}{b}方案 {i:05}");
        let summary = format!("{c}在真实界面中的表现，包含{b}与{a}的参数组合。");
        let (text, pinyin) = search::build_blob(&[&title, &summary, "微交互"]);
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
    println!("SETUP rows=10000 elapsed={:.1}ms", setup.elapsed().as_secs_f64() * 1000.0);

    let queries = [
        "按钮", "动效", "卡片", "开关", "玻璃", "反馈", "主题", "微交互", "anniu", "dongxiao",
        "ka", "boli", "侧边栏", "an",
    ];

    let mut samples: Vec<f64> = Vec::new();
    for round in 0..5 {
        for query in queries {
            let pattern = search::search_pattern(Some(query)).unwrap();
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
            if round == 0 {
                println!("QUERY {query:>8} hits={:>3} {elapsed:.3}ms", rows.len());
            }
            samples.push(elapsed);
        }
    }

    let (p50, p95) = p50_p95(samples.clone());
    let max = samples.iter().cloned().fold(0.0_f64, f64::max);
    let avg = samples.iter().sum::<f64>() / samples.len() as f64;
    println!(
        "SEARCH_BASELINE rows=10000 samples={} avg={avg:.3}ms p50={p50:.3}ms p95={p95:.3}ms max={max:.3}ms engine=like+pinyin",
        samples.len()
    );
}
