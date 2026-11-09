use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::commands::cases::{self, CaseSummary, CreateCaseInput, CASE_KINDS};
use crate::db::Db;
use crate::error::AppError;

const MAX_TITLE_CHARS: usize = 120;
const MAX_SUMMARY_CHARS: usize = 400;
const MAX_PAYLOAD_BYTES: usize = 64 * 1024;
const SOURCES: [&str; 4] = ["manual", "url", "import", "search"];
const STATUSES: [&str; 3] = ["pending", "approved", "rejected"];

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CandidateRow {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub payload_json: String,
    pub source: String,
    pub source_url: Option<String>,
    pub status: String,
    pub review_note: Option<String>,
    pub created_at: String,
    pub decided_at: Option<String>,
    pub approved_case_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateInput {
    pub kind: String,
    pub title: String,
    pub summary: Option<String>,
    pub payload_json: Option<String>,
    pub source: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateEdit {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub payload_json: Option<String>,
}

fn validate_payload(payload: &str) -> Result<(), AppError> {
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::InvalidInput("payload 不能超过 64KB".into()));
    }
    let parsed: serde_json::Value = serde_json::from_str(payload)
        .map_err(|_| AppError::InvalidInput("payload 不是合法 JSON".into()))?;
    if !parsed.is_object() {
        return Err(AppError::InvalidInput("payload 必须是 JSON 对象".into()));
    }
    Ok(())
}

fn select_sql() -> &'static str {
    r#"
    SELECT id, kind, title, summary, payload_json, source, source_url,
           status, review_note, created_at, decided_at, approved_case_id
    FROM candidates
    "#
}

#[tauri::command]
pub async fn candidates_list(
    db: State<'_, Db>,
    status: Option<String>,
) -> Result<Vec<CandidateRow>, AppError> {
    let status = status.filter(|value| value != "all");
    if let Some(value) = &status {
        if !STATUSES.contains(&value.as_str()) {
            return Err(AppError::InvalidInput("候选状态不合法".into()));
        }
    }

    // payload 最大 64KB，条数限额挡不住内存；按累计字节截断
    let rows = sqlx::query_as::<_, CandidateRow>(
        r#"
        WITH scoped AS (
            SELECT id, kind, title, summary, payload_json, source, source_url,
                   status, review_note, created_at, decided_at, approved_case_id,
                   SUM(LENGTH(payload_json) + LENGTH(title) + LENGTH(summary) + 64)
                       OVER (ORDER BY created_at DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                       AS cum_bytes
            FROM candidates
            WHERE (?1 IS NULL OR status = ?1)
        )
        SELECT id, kind, title, summary, payload_json, source, source_url,
               status, review_note, created_at, decided_at, approved_case_id
        FROM scoped
        WHERE cum_bytes <= 4194304
        ORDER BY created_at DESC
        LIMIT 500
        "#,
    )
    .bind(&status)
    .fetch_all(&db.pool)
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn candidates_create(
    db: State<'_, Db>,
    input: CandidateInput,
) -> Result<CandidateRow, AppError> {
    let title = input.title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::InvalidInput(
            "候选标题不能为空且不能超过 120 个字符".into(),
        ));
    }
    if !CASE_KINDS.contains(&input.kind.as_str()) {
        return Err(AppError::InvalidInput("未知的候选类型".into()));
    }

    let summary = input.summary.unwrap_or_default();
    if summary.chars().count() > MAX_SUMMARY_CHARS {
        return Err(AppError::InvalidInput("候选摘要不能超过 400 个字符".into()));
    }

    let source = input.source.unwrap_or_else(|| "manual".into());
    if !SOURCES.contains(&source.as_str()) {
        return Err(AppError::InvalidInput("候选来源不合法".into()));
    }

    let source_url = input
        .source_url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if source == "url" {
        match &source_url {
            Some(url) if url.starts_with("http://") || url.starts_with("https://") => {}
            Some(_) => {
                return Err(AppError::InvalidInput(
                    "网址必须以 http:// 或 https:// 开头".into(),
                ))
            }
            None => return Err(AppError::InvalidInput("缺少网址".into())),
        }
    }

    let payload = input.payload_json.unwrap_or_else(|| "{}".into());
    validate_payload(&payload)?;

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO candidates
            (id, kind, title, summary, payload_json, source, source_url)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
    )
    .bind(&id)
    .bind(&input.kind)
    .bind(title)
    .bind(summary)
    .bind(&payload)
    .bind(&source)
    .bind(&source_url)
    .execute(&db.pool)
    .await?;

    fetch_candidate(&db, &id).await
}

/// 拒绝：只落状态，不写 cases
#[tauri::command]
pub async fn candidates_reject(
    db: State<'_, Db>,
    id: String,
    note: Option<String>,
) -> Result<CandidateRow, AppError> {
    ensure_pending(&db, &id).await?;

    sqlx::query(
        r#"
        UPDATE candidates
        SET status = 'rejected',
            review_note = ?2,
            decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1
        "#,
    )
    .bind(&id)
    .bind(note)
    .execute(&db.pool)
    .await?;

    fetch_candidate(&db, &id).await
}

/// 通过（可带编辑）：唯一入库路径，没有免审开关
#[tauri::command]
pub async fn candidates_approve(
    db: State<'_, Db>,
    id: String,
    edit: Option<CandidateEdit>,
) -> Result<CaseSummary, AppError> {
    let candidate = ensure_pending(&db, &id).await?;

    let title = edit
        .as_ref()
        .and_then(|value| value.title.clone())
        .unwrap_or(candidate.title);
    let summary = edit
        .as_ref()
        .and_then(|value| value.summary.clone())
        .unwrap_or(candidate.summary);
    let payload = edit
        .as_ref()
        .and_then(|value| value.payload_json.clone())
        .unwrap_or(candidate.payload_json);

    let confidence = if candidate.source == "manual" {
        "user_defined"
    } else {
        "estimated"
    };

    let pool = db.pool.clone();
    let created = cases::cases_create(
        db,
        CreateCaseInput {
            title,
            kind: candidate.kind,
            confidence: Some(confidence.into()),
            summary: Some(summary),
            category_id: None,
            payload_json: Some(payload),
            platform: Some("web".into()),
            component_layer: None,
        },
    )
    .await?;

    sqlx::query(
        r#"
        UPDATE candidates
        SET status = 'approved',
            approved_case_id = ?2,
            decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1
        "#,
    )
    .bind(&id)
    .bind(&created.id)
    .execute(&pool)
    .await?;

    Ok(created)
}

async fn ensure_pending(db: &Db, id: &str) -> Result<CandidateRow, AppError> {
    let candidate = fetch_candidate(db, id).await?;
    if candidate.status != "pending" {
        return Err(AppError::InvalidInput(format!(
            "该候选已是「{}」状态，不能重复审核",
            candidate.status
        )));
    }
    Ok(candidate)
}

async fn fetch_candidate(db: &Db, id: &str) -> Result<CandidateRow, AppError> {
    let sql = format!("{} WHERE id = ?1", select_sql());
    sqlx::query_as::<_, CandidateRow>(&sql)
        .bind(id)
        .fetch_optional(&db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("候选不存在".into()))
}
