use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::db::Db;
use crate::error::AppError;

pub const CASE_KINDS: [&str; 5] = ["style", "motion", "feedback", "component", "theme"];
pub const CONFIDENCE_VALUES: [&str; 3] = ["unknown", "estimated", "user_defined"];
const MAX_TITLE_CHARS: usize = 120;
const MAX_SUMMARY_CHARS: usize = 400;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CaseSummary {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub confidence: String,
    pub is_favorite: bool,
    pub category_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub payload_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCaseInput {
    pub title: String,
    pub kind: String,
    pub confidence: Option<String>,
    pub summary: Option<String>,
    pub category_id: Option<String>,
    pub payload_json: Option<String>,
}

const MAX_PAYLOAD_BYTES: usize = 64 * 1024;
const MAX_EXPORT_BYTES: usize = 256 * 1024;

fn validate_payload(payload: &str) -> Result<(), AppError> {
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(AppError::InvalidInput("payload 不能超过 64KB".into()));
    }
    let parsed: serde_json::Value = serde_json::from_str(payload)
        .map_err(|_| AppError::InvalidInput("payload 不是合法 JSON".into()))?;
    let object = parsed
        .as_object()
        .ok_or_else(|| AppError::InvalidInput("payload 必须是 JSON 对象".into()))?;
    if let Some(preview) = object.get("preview") {
        if !preview.is_object() {
            return Err(AppError::InvalidInput("preview 必须是 JSON 对象".into()));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn cases_list(
    db: State<'_, Db>,
    kind: Option<String>,
    favorite_only: Option<bool>,
    category_id: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<CaseSummary>, AppError> {
    let limit = limit.unwrap_or(200).clamp(1, 1000);
    let kind = kind.filter(|value| !value.trim().is_empty());
    let category_id = category_id.filter(|value| !value.trim().is_empty());

    let rows = sqlx::query_as::<_, CaseSummary>(
        r#"
        SELECT id, kind, title, summary, confidence, is_favorite,
               category_id, created_at, updated_at, payload_json
        FROM cases
        WHERE deleted_at IS NULL
          AND (?1 IS NULL OR kind = ?1)
          AND (?2 = 0 OR is_favorite = 1)
          AND (?3 IS NULL OR category_id = ?3)
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ?4
        "#,
    )
    .bind(kind)
    .bind(if favorite_only.unwrap_or(false) { 1 } else { 0 })
    .bind(category_id)
    .bind(limit)
    .fetch_all(&db.pool)
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn cases_counts(db: State<'_, Db>) -> Result<HashMap<String, i64>, AppError> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT kind, COUNT(*) FROM cases WHERE deleted_at IS NULL GROUP BY kind",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(rows.into_iter().collect())
}

#[tauri::command]
pub async fn cases_create(
    db: State<'_, Db>,
    input: CreateCaseInput,
) -> Result<CaseSummary, AppError> {
    let title = input.title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::InvalidInput(
            "标题不能为空且不能超过 120 个字符".into(),
        ));
    }
    if !CASE_KINDS.contains(&input.kind.as_str()) {
        return Err(AppError::InvalidInput("未知的案例类型".into()));
    }

    let summary = input.summary.unwrap_or_default();
    if summary.chars().count() > MAX_SUMMARY_CHARS {
        return Err(AppError::InvalidInput("摘要不能超过 400 个字符".into()));
    }

    let confidence = input.confidence.unwrap_or_else(|| "user_defined".into());
    if !CONFIDENCE_VALUES.contains(&confidence.as_str()) {
        return Err(AppError::InvalidInput("置信度取值不合法".into()));
    }

    let payload = input.payload_json.unwrap_or_else(|| "{}".into());
    validate_payload(&payload)?;

    let category_id = input.category_id.filter(|value| !value.trim().is_empty());
    if let Some(category) = &category_id {
        let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM categories WHERE id = ?1")
            .bind(category)
            .fetch_optional(&db.pool)
            .await?;
        if exists.is_none() {
            return Err(AppError::InvalidInput("类目不存在".into()));
        }
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO cases
            (id, kind, title, summary, payload_json, payload_schema_version,
             confidence, is_favorite, category_id, created_at, updated_at)
        VALUES
            (?1, ?2, ?3, ?4, ?5, 2, ?6, 0, ?7,
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        "#,
    )
    .bind(&id)
    .bind(&input.kind)
    .bind(title)
    .bind(summary)
    .bind(&payload)
    .bind(&confidence)
    .bind(&category_id)
    .execute(&db.pool)
    .await?;

    fetch_case(&db, &id).await
}

#[tauri::command]
pub async fn cases_update_payload(
    db: State<'_, Db>,
    id: String,
    payload_json: String,
) -> Result<CaseSummary, AppError> {
    validate_payload(&payload_json)?;

    let affected = sqlx::query(
        r#"
        UPDATE cases
        SET payload_json = ?2,
            payload_schema_version = 2,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1 AND deleted_at IS NULL
        "#,
    )
    .bind(&id)
    .bind(&payload_json)
    .execute(&db.pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("案例不存在或已删除".into()));
    }

    fetch_case(&db, &id).await
}

/// 导出 Markdown 到应用数据目录下的 exports/，返回真实绝对路径
#[tauri::command]
pub async fn cases_export_markdown(
    db: State<'_, Db>,
    title: String,
    content: String,
) -> Result<String, AppError> {
    if content.trim().is_empty() {
        return Err(AppError::InvalidInput("导出内容为空".into()));
    }
    if content.len() > MAX_EXPORT_BYTES {
        return Err(AppError::InvalidInput("导出内容不能超过 256KB".into()));
    }

    let stamp: String = sqlx::query_scalar("SELECT strftime('%Y%m%d-%H%M%S', 'now', 'localtime')")
        .fetch_one(&db.pool)
        .await?;

    let slug = sanitize_file_stem(&title);
    let dir = db.data_dir.join("exports");
    std::fs::create_dir_all(&dir).map_err(sqlx::Error::Io)?;
    let path = dir.join(format!("{slug}-{stamp}.md"));
    std::fs::write(&path, content.as_bytes()).map_err(sqlx::Error::Io)?;

    Ok(path.to_string_lossy().into_owned())
}

fn sanitize_file_stem(title: &str) -> String {
    let mut stem: String = title
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .take(48)
        .collect();

    while stem.ends_with('.') || stem.ends_with(' ') {
        stem.pop();
    }

    if stem.trim().is_empty() {
        "case".into()
    } else {
        stem
    }
}

#[tauri::command]
pub async fn cases_rename(
    db: State<'_, Db>,
    id: String,
    title: String,
) -> Result<CaseSummary, AppError> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::InvalidInput(
            "标题不能为空且不能超过 120 个字符".into(),
        ));
    }

    let affected = sqlx::query(
        r#"
        UPDATE cases
        SET title = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1 AND deleted_at IS NULL
        "#,
    )
    .bind(&id)
    .bind(title)
    .execute(&db.pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("案例不存在或已删除".into()));
    }

    fetch_case(&db, &id).await
}

#[tauri::command]
pub async fn cases_toggle_favorite(db: State<'_, Db>, id: String) -> Result<bool, AppError> {
    let favorite: Option<i64> = sqlx::query_scalar(
        r#"
        UPDATE cases
        SET is_favorite = 1 - is_favorite,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1 AND deleted_at IS NULL
        RETURNING is_favorite
        "#,
    )
    .bind(&id)
    .fetch_optional(&db.pool)
    .await?;

    favorite
        .map(|value| value != 0)
        .ok_or_else(|| AppError::NotFound("案例不存在或已删除".into()))
}

#[tauri::command]
pub async fn cases_soft_delete(db: State<'_, Db>, id: String) -> Result<(), AppError> {
    let affected = sqlx::query(
        r#"
        UPDATE cases
        SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1 AND deleted_at IS NULL
        "#,
    )
    .bind(&id)
    .execute(&db.pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound("案例不存在或已删除".into()));
    }

    Ok(())
}

async fn fetch_case(db: &Db, id: &str) -> Result<CaseSummary, AppError> {
    sqlx::query_as::<_, CaseSummary>(
        r#"
        SELECT id, kind, title, summary, confidence, is_favorite,
               category_id, created_at, updated_at, payload_json
        FROM cases
        WHERE id = ?1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("案例不存在或已删除".into()))
}
