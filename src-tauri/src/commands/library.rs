use std::collections::HashSet;

use serde::Serialize;
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::db::Db;
use crate::error::AppError;

const MAX_LABEL_CHARS: usize = 24;
const MAX_TAGS_PER_CASE: usize = 12;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub id: String,
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRef {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub count: i64,
    pub created_at: String,
}

fn normalize_label(value: &str) -> Result<String, AppError> {
    let label = value.trim();
    if label.is_empty() || label.chars().count() > MAX_LABEL_CHARS {
        return Err(AppError::InvalidInput(format!(
            "名称不能为空且不能超过 {MAX_LABEL_CHARS} 个字符"
        )));
    }
    Ok(label.to_string())
}

#[tauri::command]
pub async fn tags_list(db: State<'_, Db>) -> Result<Vec<TagCount>, AppError> {
    let rows = sqlx::query_as::<_, TagCount>(
        r#"
        SELECT t.id, t.label, COUNT(c.id) AS count
        FROM tags t
        LEFT JOIN case_tags ct ON ct.tag_id = t.id
        LEFT JOIN cases c ON c.id = ct.case_id AND c.deleted_at IS NULL
        GROUP BY t.id
        ORDER BY count DESC, t.label COLLATE NOCASE ASC
        LIMIT 500
        "#,
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn tags_create(db: State<'_, Db>, label: String) -> Result<TagRef, AppError> {
    let label = normalize_label(&label)?;

    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT OR IGNORE INTO tags (id, label) VALUES (?1, ?2)")
        .bind(&id)
        .bind(&label)
        .execute(&db.pool)
        .await?;

    let existing: (String, String) = sqlx::query_as("SELECT id, label FROM tags WHERE label = ?1")
        .bind(&label)
        .fetch_one(&db.pool)
        .await?;

    Ok(TagRef {
        id: existing.0,
        label: existing.1,
    })
}

#[tauri::command]
pub async fn cases_tags(db: State<'_, Db>, case_id: String) -> Result<Vec<TagRef>, AppError> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        r#"
        SELECT t.id, t.label
        FROM case_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.case_id = ?1
        ORDER BY t.label COLLATE NOCASE ASC
        "#,
    )
    .bind(&case_id)
    .fetch_all(&db.pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, label)| TagRef { id, label })
        .collect())
}

/// 用一组标签名整体替换该案例的标签；同名标签复用，不重复建
#[tauri::command]
pub async fn cases_set_tags(
    db: State<'_, Db>,
    case_id: String,
    labels: Vec<String>,
) -> Result<Vec<TagRef>, AppError> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM cases WHERE id = ?1 AND deleted_at IS NULL")
        .bind(&case_id)
        .fetch_optional(&db.pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("案例不存在或已删除".into()));
    }

    let mut seen: HashSet<String> = HashSet::new();
    let mut normalized: Vec<String> = Vec::new();
    for raw in labels {
        let label = raw.trim();
        if label.is_empty() {
            continue;
        }
        if label.chars().count() > MAX_LABEL_CHARS {
            return Err(AppError::InvalidInput(format!(
                "标签「{label}」超过 {MAX_LABEL_CHARS} 个字符"
            )));
        }
        if seen.insert(label.to_lowercase()) {
            normalized.push(label.to_string());
        }
    }
    if normalized.len() > MAX_TAGS_PER_CASE {
        return Err(AppError::InvalidInput(format!(
            "单个案例最多 {MAX_TAGS_PER_CASE} 个标签"
        )));
    }

    let mut tx = db.pool.begin().await?;
    sqlx::query("DELETE FROM case_tags WHERE case_id = ?1")
        .bind(&case_id)
        .execute(&mut *tx)
        .await?;

    for label in &normalized {
        let tag_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT OR IGNORE INTO tags (id, label) VALUES (?1, ?2)")
            .bind(&tag_id)
            .bind(label)
            .execute(&mut *tx)
            .await?;
        let id: String = sqlx::query_scalar("SELECT id FROM tags WHERE label = ?1")
            .bind(label)
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("INSERT OR IGNORE INTO case_tags (case_id, tag_id) VALUES (?1, ?2)")
            .bind(&case_id)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    cases_tags(db, case_id).await
}

#[tauri::command]
pub async fn collections_list(db: State<'_, Db>) -> Result<Vec<CollectionSummary>, AppError> {
    let rows = sqlx::query_as::<_, CollectionSummary>(
        r#"
        SELECT c.id, c.name, c.description, c.created_at,
               COUNT(CASE WHEN a.deleted_at IS NULL THEN cc.case_id END) AS count
        FROM collections c
        LEFT JOIN collection_cases cc ON cc.collection_id = c.id
        LEFT JOIN cases a ON a.id = cc.case_id
        GROUP BY c.id
        ORDER BY c.created_at ASC
        LIMIT 500
        "#,
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn collections_create(
    db: State<'_, Db>,
    name: String,
) -> Result<CollectionSummary, AppError> {
    let name = normalize_label(&name)?;
    let id = Uuid::new_v4().to_string();

    let affected = sqlx::query(
        "INSERT OR IGNORE INTO collections (id, name) VALUES (?1, ?2)",
    )
    .bind(&id)
    .bind(&name)
    .execute(&db.pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::InvalidInput("同名合集已存在".into()));
    }

    let row = sqlx::query_as::<_, CollectionSummary>(
        "SELECT id, name, description, 0 AS count, created_at FROM collections WHERE id = ?1",
    )
    .bind(&id)
    .fetch_one(&db.pool)
    .await?;

    Ok(row)
}

#[tauri::command]
pub async fn collections_add_case(
    db: State<'_, Db>,
    collection_id: String,
    case_id: String,
) -> Result<(), AppError> {
    let case_exists: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM cases WHERE id = ?1 AND deleted_at IS NULL")
            .bind(&case_id)
            .fetch_optional(&db.pool)
            .await?;
    if case_exists.is_none() {
        return Err(AppError::NotFound("案例不存在或已删除".into()));
    }

    let collection_exists: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM collections WHERE id = ?1")
            .bind(&collection_id)
            .fetch_optional(&db.pool)
            .await?;
    if collection_exists.is_none() {
        return Err(AppError::NotFound("合集不存在".into()));
    }

    sqlx::query(
        "INSERT OR IGNORE INTO collection_cases (collection_id, case_id) VALUES (?1, ?2)",
    )
    .bind(&collection_id)
    .bind(&case_id)
    .execute(&db.pool)
    .await?;

    sqlx::query(
        "UPDATE collections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
    )
    .bind(&collection_id)
    .execute(&db.pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn collections_remove_case(
    db: State<'_, Db>,
    collection_id: String,
    case_id: String,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM collection_cases WHERE collection_id = ?1 AND case_id = ?2")
        .bind(&collection_id)
        .bind(&case_id)
        .execute(&db.pool)
        .await?;
    Ok(())
}
