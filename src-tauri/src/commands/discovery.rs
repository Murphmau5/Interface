//! 联网采集命令层：粘贴网址（无需 Key）与搜索采集（需搜索 Key）。
//!
//! 所有失败都转成逐条结果，调用方不会静默吞掉；成功条目只写候选池，
//! 仍须走人工审核才能入库。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai;
use crate::commands::ai::read_key;
use crate::commands::candidates::insert_candidate;
use crate::commands::cases::CASE_KINDS;
use crate::db::Db;
use crate::error::AppError;
use crate::fetch::{self, FetchOptions, FetchedPage};

const MAX_TITLE_CHARS: usize = 120;
const MAX_SUMMARY_CHARS: usize = 400;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchUrlInput {
    pub url: String,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySearchInput {
    pub query: String,
    pub kind: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchItemResult {
    pub url: String,
    pub outcome: String,
    pub title: Option<String>,
    pub candidate_id: Option<String>,
    pub existing_candidate_id: Option<String>,
    pub code: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FetchBatchResult {
    pub ok: bool,
    pub code: String,
    pub message: String,
    pub requested: usize,
    pub created: usize,
    pub duplicates: usize,
    pub failed: usize,
    pub items: Vec<FetchItemResult>,
}

impl FetchBatchResult {
    fn new() -> Self {
        Self::default()
    }

    fn push(&mut self, item: FetchItemResult) {
        self.requested += 1;
        match item.outcome.as_str() {
            "created" => self.created += 1,
            "duplicate" => self.duplicates += 1,
            _ => self.failed += 1,
        }
        self.items.push(item);
    }

    fn failed_request(code: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            code: code.into(),
            message: message.into(),
            ..Self::default()
        }
    }
}

fn ensure_kind(kind: &str) -> Result<(), AppError> {
    if CASE_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(AppError::InvalidInput("未知的案例类型".into()))
    }
}

fn error_parts(err: &AppError) -> (String, String) {
    match err {
        AppError::Fetch { code, message } => (code.clone(), message.clone()),
        AppError::AiProvider { code, message } => (code.clone(), message.clone()),
        AppError::InvalidInput(message) => ("E_URL_INVALID".into(), message.clone()),
        other => ("E_FETCH_FAILED".into(), other.to_string()),
    }
}

fn failed_item(url: &str, err: &AppError) -> FetchItemResult {
    let (code, message) = error_parts(err);
    FetchItemResult {
        url: url.to_string(),
        outcome: "failed".into(),
        title: None,
        candidate_id: None,
        existing_candidate_id: None,
        code: Some(code),
        message: Some(message),
    }
}

fn page_title(page: &FetchedPage) -> String {
    let title = page.title.trim();
    let title = if title.is_empty() {
        reqwest::Url::parse(&page.url)
            .ok()
            .and_then(|url| url.host_str().map(|host| host.to_string()))
            .unwrap_or_else(|| "未命名网页".into())
    } else {
        title.to_string()
    };
    title.chars().take(MAX_TITLE_CHARS).collect()
}

fn page_summary(page: &FetchedPage) -> String {
    let description = page.description.trim();
    let text = if description.is_empty() {
        page.text.trim()
    } else {
        description
    };
    text.chars().take(MAX_SUMMARY_CHARS).collect()
}

async fn import_page(
    pool: &sqlx::SqlitePool,
    url: &str,
    kind: &str,
    source: &str,
) -> FetchItemResult {
    import_page_with(pool, url, kind, source, &FetchOptions::default()).await
}

/// 供端到端测试注入 `allow_loopback`；生产入口只走上面的默认守卫。
pub(crate) async fn import_page_with(
    pool: &sqlx::SqlitePool,
    url: &str,
    kind: &str,
    source: &str,
    options: &FetchOptions,
) -> FetchItemResult {
    let page = match fetch::fetch_page(url, options).await {
        Ok(page) => page,
        Err(err) => return failed_item(url, &err),
    };

    match fetch::find_duplicate(pool, &page.url, &page.text).await {
        Err(err) => failed_item(url, &err),
        Ok(Some(duplicate)) => duplicate_item(url, duplicate),
        Ok(None) => {
            let payload = fetch::build_payload(&page);
            let key = fetch::url_key(&page.url);
            match insert_candidate(
                pool,
                kind,
                &page_title(&page),
                &page_summary(&page),
                &payload,
                source,
                Some(&key),
            )
            .await
            {
                Ok(row) => FetchItemResult {
                    url: page.url.clone(),
                    outcome: "created".into(),
                    title: Some(row.title),
                    candidate_id: Some(row.id),
                    existing_candidate_id: None,
                    code: None,
                    message: Some("已写入候选池，待人工审核".into()),
                },
                Err(err) => failed_item(url, &err),
            }
        }
    }
}

fn duplicate_item(url: &str, duplicate: fetch::DuplicateKind) -> FetchItemResult {
    match duplicate {
        fetch::DuplicateKind::Url { id, title, status } => FetchItemResult {
            url: url.to_string(),
            outcome: "duplicate".into(),
            title: Some(title),
            candidate_id: None,
            existing_candidate_id: Some(id),
            code: None,
            message: Some(format!("同一网址已存在候选（{status}），未重复创建")),
        },
        fetch::DuplicateKind::Content {
            id,
            title,
            similarity,
        } => FetchItemResult {
            url: url.to_string(),
            outcome: "duplicate".into(),
            title: Some(title),
            candidate_id: None,
            existing_candidate_id: Some(id),
            code: None,
            message: Some(format!(
                "内容与已有候选近似（{:.0}%），未重复创建",
                similarity * 100.0
            )),
        },
    }
}

#[tauri::command]
pub async fn discovery_fetch_url(
    db: State<'_, Db>,
    input: FetchUrlInput,
) -> Result<FetchBatchResult, AppError> {
    ensure_kind(&input.kind)?;
    let mut batch = FetchBatchResult::new();
    let item = import_page(&db.pool, &input.url, &input.kind, "url").await;
    let failed = item.outcome == "failed";
    let code = item.code.clone().unwrap_or_default();
    let message = item.message.clone().unwrap_or_default();
    batch.push(item);
    batch.ok = !failed;
    batch.code = if failed { code } else { "OK".into() };
    batch.message = if failed {
        message
    } else {
        format!("已处理 {} 个网址", batch.requested)
    };
    Ok(batch)
}

#[tauri::command]
pub async fn discovery_search(
    db: State<'_, Db>,
    input: DiscoverySearchInput,
) -> Result<FetchBatchResult, AppError> {
    ensure_kind(&input.kind)?;
    let query = input.query.trim();
    if query.is_empty() {
        return Ok(FetchBatchResult::failed_request(
            "E_URL_INVALID",
            "检索关键词为空",
        ));
    }

    let cfg = ai::load_search(&db.pool).await?;
    let key = if cfg.auth_mode == "bearer" {
        read_key("search")?
    } else {
        None
    };
    let limit = input.limit.unwrap_or(5).clamp(1, 10);
    let hits = match fetch::search_web(&cfg, key.as_deref(), query, limit).await {
        Ok(hits) => hits,
        Err(err) => {
            let (code, message) = error_parts(&err);
            return Ok(FetchBatchResult::failed_request(&code, message));
        }
    };

    if hits.is_empty() {
        let mut batch = FetchBatchResult::new();
        batch.ok = true;
        batch.code = "OK".into();
        batch.message = "没有检索到结果".into();
        return Ok(batch);
    }

    let mut batch = FetchBatchResult::new();
    for hit in hits {
        let item = import_page(&db.pool, &hit.url, &input.kind, "search").await;
        batch.push(item);
    }
    batch.ok = true;
    batch.code = "OK".into();
    batch.message = format!(
        "检索到 {} 条：新增 {}，重复 {}，失败 {}",
        batch.requested, batch.created, batch.duplicates, batch.failed
    );
    Ok(batch)
}
