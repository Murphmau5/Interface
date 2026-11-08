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
}

#[tauri::command]
pub async fn cases_list(
    db: State<'_, Db>,
    kind: Option<String>,
    favorite_only: Option<bool>,
    limit: Option<i64>,
) -> Result<Vec<CaseSummary>, AppError> {
    let limit = limit.unwrap_or(200).clamp(1, 500);
    let kind = kind.filter(|value| !value.trim().is_empty());

    let rows = sqlx::query_as::<_, CaseSummary>(
        r#"
        SELECT id, kind, title, summary, confidence, is_favorite,
               created_at, updated_at, payload_json
        FROM cases
        WHERE deleted_at IS NULL
          AND (?1 IS NULL OR kind = ?1)
          AND (?2 = 0 OR is_favorite = 1)
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ?3
        "#,
    )
    .bind(kind)
    .bind(if favorite_only.unwrap_or(false) { 1 } else { 0 })
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

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO cases
            (id, kind, title, summary, payload_json, payload_schema_version,
             confidence, is_favorite, created_at, updated_at)
        VALUES
            (?1, ?2, ?3, ?4, '{}', 1, ?5, 0,
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        "#,
    )
    .bind(&id)
    .bind(&input.kind)
    .bind(title)
    .bind(summary)
    .bind(&confidence)
    .execute(&db.pool)
    .await?;

    fetch_case(&db, &id).await
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
               created_at, updated_at, payload_json
        FROM cases
        WHERE id = ?1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("案例不存在或已删除".into()))
}
