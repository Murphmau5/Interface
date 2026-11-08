use std::collections::HashMap;

use tauri::State;

use crate::db::Db;
use crate::error::AppError;

const MAX_KEY_LEN: usize = 128;
const MAX_VALUE_LEN: usize = 16 * 1024;

#[tauri::command]
pub async fn settings_get_all(db: State<'_, Db>) -> Result<HashMap<String, String>, AppError> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(&db.pool)
        .await?;
    Ok(rows.into_iter().collect())
}

#[tauri::command]
pub async fn settings_set(db: State<'_, Db>, key: String, value: String) -> Result<(), AppError> {
    let key = key.trim();
    if key.is_empty() || key.chars().count() > MAX_KEY_LEN {
        return Err(AppError::InvalidInput("设置键不能为空且不能超过 128 个字符".into()));
    }
    if value.chars().count() > MAX_VALUE_LEN {
        return Err(AppError::InvalidInput("设置值不能超过 16 KB".into()));
    }

    sqlx::query(
        r#"
        INSERT INTO settings (key, value, updated_at)
        VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(&db.pool)
    .await?;

    Ok(())
}
