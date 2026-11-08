use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::Db;
use crate::error::AppError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_version: String,
    pub data_dir: String,
    pub db_path: String,
    pub platform: String,
    pub case_count: i64,
}

#[tauri::command]
pub async fn app_info(app: AppHandle, db: State<'_, Db>) -> Result<AppInfo, AppError> {
    let case_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE deleted_at IS NULL")
            .fetch_one(&db.pool)
            .await?;

    Ok(AppInfo {
        app_version: app.package_info().version.to_string(),
        data_dir: db.data_dir.display().to_string(),
        db_path: db.db_path().display().to_string(),
        platform: std::env::consts::OS.to_string(),
        case_count,
    })
}
