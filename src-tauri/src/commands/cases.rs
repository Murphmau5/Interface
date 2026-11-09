use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;
use uuid::Uuid;

use crate::db::Db;
use crate::error::AppError;
use crate::search;

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
    pub platform: String,
    pub component_layer: Option<String>,
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
    pub platform: Option<String>,
    pub component_layer: Option<String>,
}

/// 筛选条件的唯一载荷：前端只维护这一份状态，SQL 直接消费
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaseQueryInput {
    pub scope: Option<String>,
    pub kind: Option<String>,
    pub platform: Option<String>,
    pub confidence: Option<String>,
    pub layer: Option<String>,
    pub category_id: Option<String>,
    pub collection_id: Option<String>,
    pub tag_id: Option<String>,
    pub search: Option<String>,
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CasePage {
    pub items: Vec<CaseSummary>,
    pub total: i64,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Facets {
    pub kinds: HashMap<String, i64>,
    pub platforms: HashMap<String, i64>,
    pub confidences: HashMap<String, i64>,
    pub layers: HashMap<String, i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewCounts {
    pub total: i64,
    pub favorites: i64,
    pub recent: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundleInput {
    pub title: String,
    pub markdown: String,
    pub json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundle {
    pub markdown_path: String,
    pub json_path: String,
    pub file_stem: String,
}

const MAX_PAYLOAD_BYTES: usize = 64 * 1024;
const MAX_EXPORT_BYTES: usize = 256 * 1024;
/// 列表返回体的字节预算：payload 是变长字段，按条数限额挡不住内存
const MAX_LIST_PAYLOAD_BYTES: i64 = 8 * 1024 * 1024;

const CASE_FILTER_WHERE: &str = r#"
WHERE deleted_at IS NULL
  AND (?1 IS NULL OR kind = ?1)
  AND (?2 IS NULL OR platform = ?2)
  AND (?3 IS NULL OR confidence = ?3)
  AND (?4 IS NULL OR component_layer = ?4)
  AND (?5 IS NULL OR category_id = ?5)
  AND (?6 = 0 OR is_favorite = 1)
  AND (?7 = 0 OR updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'))
  AND (?8 IS NULL OR id IN (SELECT case_id FROM collection_cases WHERE collection_id = ?8))
  AND (?9 IS NULL OR id IN (SELECT case_id FROM case_tags WHERE tag_id = ?9))
  AND (?10 IS NULL OR search_text LIKE ?10 OR pinyin_text LIKE ?10)
"#;

fn clean(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

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

fn normalize_order(sort: Option<&str>) -> &'static str {
    match sort.unwrap_or("updated") {
        "created" => "created_at DESC",
        "title" => "title COLLATE NOCASE ASC",
        _ => "updated_at DESC",
    }
}

fn default_layer(kind: &str, category_id: Option<&str>) -> Option<String> {
    if kind != "component" {
        return None;
    }
    match category_id {
        Some("component.button")
        | Some("component.input")
        | Some("component.switch")
        | Some("component.card") => Some("atom".into()),
        Some(_) => Some("pattern".into()),
        None => None,
    }
}

#[tauri::command]
pub async fn cases_query(
    db: State<'_, Db>,
    input: CaseQueryInput,
) -> Result<CasePage, AppError> {
    let scope = input.scope.unwrap_or_else(|| "all".into());
    let kind = clean(input.kind);
    let platform = clean(input.platform);
    let confidence = clean(input.confidence);
    let layer = clean(input.layer);
    let category_id = clean(input.category_id);
    let tag_id = clean(input.tag_id);
    let collection_id = if scope == "collection" {
        clean(input.collection_id)
    } else {
        None
    };

    if let Some(value) = &kind {
        if !CASE_KINDS.contains(&value.as_str()) {
            return Err(AppError::InvalidInput("未知的案例类型".into()));
        }
    }
    if let Some(value) = &confidence {
        if !CONFIDENCE_VALUES.contains(&value.as_str()) {
            return Err(AppError::InvalidInput("置信度取值不合法".into()));
        }
    }
    if let Some(value) = &platform {
        if !search::PLATFORMS.contains(&value.as_str()) {
            return Err(AppError::InvalidInput("平台取值不合法".into()));
        }
    }
    if let Some(value) = &layer {
        if !search::COMPONENT_LAYERS.contains(&value.as_str()) {
            return Err(AppError::InvalidInput("组件层取值不合法".into()));
        }
    }

    let favorite_only = scope == "favorites";
    let recent_only = scope == "recent";
    let pattern = search::search_pattern(input.search.as_deref());
    let limit = input.limit.unwrap_or(500).clamp(1, 1000);
    let offset = input.offset.unwrap_or(0).max(0);
    let order = normalize_order(input.sort.as_deref());

    let count_sql = format!("SELECT COUNT(*) FROM cases {CASE_FILTER_WHERE}");
    let count_query = sqlx::query_scalar::<_, i64>(&count_sql)
        .bind(&kind)
        .bind(&platform)
        .bind(&confidence)
        .bind(&layer)
        .bind(&category_id)
        .bind(if favorite_only { 1i64 } else { 0i64 })
        .bind(if recent_only { 1i64 } else { 0i64 })
        .bind(&collection_id)
        .bind(&tag_id)
        .bind(&pattern);
    let total = count_query.fetch_one(&db.pool).await?;

    // 字节预算在 SQL 里按累计 payload 长度截断，避免大 payload 把返回体撑爆
    let list_sql = format!(
        r#"
        WITH scoped AS (
            SELECT id, kind, title, summary, confidence, is_favorite,
                   category_id, platform, component_layer, created_at, updated_at, payload_json,
                   SUM(LENGTH(payload_json) + LENGTH(title) + LENGTH(summary) + 64)
                       OVER (ORDER BY {order} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                       AS cum_bytes
            FROM cases
            {CASE_FILTER_WHERE}
        )
        SELECT id, kind, title, summary, confidence, is_favorite,
               category_id, platform, component_layer, created_at, updated_at, payload_json
        FROM scoped
        WHERE cum_bytes <= ?13
        ORDER BY {order}
        LIMIT ?11 OFFSET ?12
        "#
    );
    let items = sqlx::query_as::<_, CaseSummary>(&list_sql)
        .bind(&kind)
        .bind(&platform)
        .bind(&confidence)
        .bind(&layer)
        .bind(&category_id)
        .bind(if favorite_only { 1i64 } else { 0i64 })
        .bind(if recent_only { 1i64 } else { 0i64 })
        .bind(&collection_id)
        .bind(&tag_id)
        .bind(&pattern)
        .bind(limit)
        .bind(offset)
        .bind(MAX_LIST_PAYLOAD_BYTES)
        .fetch_all(&db.pool)
        .await?;

    Ok(CasePage { items, total })
}

/// 分面计数全部来自 SQL；对当前作用域与搜索生效，但不受自身维度筛选影响
#[tauri::command]
pub async fn cases_facets(db: State<'_, Db>, input: CaseQueryInput) -> Result<Facets, AppError> {
    let scope = input.scope.unwrap_or_else(|| "all".into());
    let category_id = clean(input.category_id);
    let tag_id = clean(input.tag_id);
    let collection_id = if scope == "collection" {
        clean(input.collection_id)
    } else {
        None
    };
    let pattern = search::search_pattern(input.search.as_deref());
    let favorite_only = scope == "favorites";
    let recent_only = scope == "recent";

    let rows: Vec<(String, String, String, String, i64)> = sqlx::query_as(
        r#"
        SELECT kind, platform, confidence, COALESCE(component_layer, ''), COUNT(*)
        FROM cases
        WHERE deleted_at IS NULL
          AND (?1 IS NULL OR category_id = ?1)
          AND (?2 IS NULL OR id IN (SELECT case_id FROM collection_cases WHERE collection_id = ?2))
          AND (?3 IS NULL OR id IN (SELECT case_id FROM case_tags WHERE tag_id = ?3))
          AND (?4 IS NULL OR search_text LIKE ?4 OR pinyin_text LIKE ?4)
          AND (?5 = 0 OR is_favorite = 1)
          AND (?6 = 0 OR updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days'))
        GROUP BY kind, platform, confidence, component_layer
        "#,
    )
    .bind(&category_id)
    .bind(&collection_id)
    .bind(&tag_id)
    .bind(&pattern)
    .bind(if favorite_only { 1i64 } else { 0i64 })
    .bind(if recent_only { 1i64 } else { 0i64 })
    .fetch_all(&db.pool)
    .await?;

    let mut facets = Facets::default();
    for (kind, platform, confidence, layer, count) in rows {
        *facets.kinds.entry(kind).or_insert(0) += count;
        *facets.platforms.entry(platform).or_insert(0) += count;
        *facets.confidences.entry(confidence).or_insert(0) += count;
        if !layer.is_empty() {
            *facets.layers.entry(layer).or_insert(0) += count;
        }
    }

    Ok(facets)
}

#[tauri::command]
pub async fn cases_view_counts(db: State<'_, Db>) -> Result<ViewCounts, AppError> {
    let (total, favorites, recent): (i64, i64, i64) = sqlx::query_as(
        r#"
        SELECT COUNT(*),
               COALESCE(SUM(is_favorite), 0),
               COALESCE(SUM(CASE WHEN updated_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days') THEN 1 ELSE 0 END), 0)
        FROM cases
        WHERE deleted_at IS NULL
        "#,
    )
    .fetch_one(&db.pool)
    .await?;

    Ok(ViewCounts {
        total,
        favorites,
        recent,
    })
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
    create_case(&db.pool, input).await
}

/// 无 State 的入库核心：命令层与端到端测试共用同一条路径。
pub(crate) async fn create_case(
    pool: &sqlx::SqlitePool,
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

    let platform = clean(input.platform).unwrap_or_else(|| "web".into());
    if !search::PLATFORMS.contains(&platform.as_str()) {
        return Err(AppError::InvalidInput("平台取值不合法".into()));
    }

    let payload = input.payload_json.unwrap_or_else(|| "{}".into());
    validate_payload(&payload)?;

    let category_id = clean(input.category_id);
    if let Some(category) = &category_id {
        let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM categories WHERE id = ?1")
            .bind(category)
            .fetch_optional(pool)
            .await?;
        if exists.is_none() {
            return Err(AppError::InvalidInput("类目不存在".into()));
        }
    }

    let requested_layer = clean(input.component_layer);
    if let Some(value) = &requested_layer {
        if !search::COMPONENT_LAYERS.contains(&value.as_str()) {
            return Err(AppError::InvalidInput("组件层取值不合法".into()));
        }
    }
    let component_layer = requested_layer.or_else(|| default_layer(&input.kind, category_id.as_deref()));

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO cases
            (id, kind, title, summary, payload_json, payload_schema_version,
             confidence, is_favorite, category_id, platform, component_layer,
             created_at, updated_at)
        VALUES
            (?1, ?2, ?3, ?4, ?5, 2, ?6, 0, ?7, ?8, ?9,
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
    .bind(&platform)
    .bind(&component_layer)
    .execute(pool)
    .await?;

    search::refresh_case(pool, &id).await?;

    fetch_case(pool, &id).await
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

    fetch_case(&db.pool, &id).await
}

/// 单文件 Markdown 导出（保留旧入口）
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

/// 一次操作同时落 Markdown 与 JSON，文件名带版本与日期
#[tauri::command]
pub async fn cases_export_bundle(
    db: State<'_, Db>,
    input: ExportBundleInput,
) -> Result<ExportBundle, AppError> {
    if input.markdown.trim().is_empty() {
        return Err(AppError::InvalidInput("导出内容为空".into()));
    }
    if input.markdown.len() > MAX_EXPORT_BYTES || input.json.len() > MAX_EXPORT_BYTES {
        return Err(AppError::InvalidInput("导出内容不能超过 256KB".into()));
    }
    serde_json::from_str::<serde_json::Value>(&input.json)
        .map_err(|_| AppError::InvalidInput("JSON 导出内容不是合法 JSON".into()))?;

    let date: String = sqlx::query_scalar("SELECT strftime('%Y%m%d', 'now', 'localtime')")
        .fetch_one(&db.pool)
        .await?;

    let slug = sanitize_file_stem(&input.title);
    let stem = format!("{slug}-v{}-{date}", env!("CARGO_PKG_VERSION"));
    let dir = db.data_dir.join("exports");
    std::fs::create_dir_all(&dir).map_err(sqlx::Error::Io)?;

    let markdown_path = dir.join(format!("{stem}.md"));
    let json_path = dir.join(format!("{stem}.json"));

    std::fs::write(&markdown_path, input.markdown.as_bytes()).map_err(|err| {
        AppError::InvalidInput(format!("Markdown 写入失败：{err}"))
    })?;
    std::fs::write(&json_path, input.json.as_bytes()).map_err(|err| {
        AppError::InvalidInput(format!(
            "Markdown 已写入 {}，JSON 写入失败：{err}",
            markdown_path.to_string_lossy()
        ))
    })?;

    Ok(ExportBundle {
        markdown_path: markdown_path.to_string_lossy().into_owned(),
        json_path: json_path.to_string_lossy().into_owned(),
        file_stem: stem,
    })
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

    search::refresh_case(&db.pool, &id).await?;

    fetch_case(&db.pool, &id).await
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

pub(crate) async fn fetch_case(pool: &SqlitePool, id: &str) -> Result<CaseSummary, AppError> {
    sqlx::query_as::<_, CaseSummary>(
        r#"
        SELECT id, kind, title, summary, confidence, is_favorite,
               category_id, platform, component_layer, created_at, updated_at, payload_json
        FROM cases
        WHERE id = ?1 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("案例不存在或已删除".into()))
}
