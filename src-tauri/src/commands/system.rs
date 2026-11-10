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

/// 用系统默认浏览器打开参数证据链接；只接受 https，避免命令注入。
#[tauri::command]
pub async fn system_open_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    let valid = trimmed.starts_with("https://")
        && trimmed.len() <= 600
        && !trimmed
            .chars()
            .any(|ch| ch.is_whitespace() || ch.is_control());
    if !valid {
        return Err("只允许打开 https 链接".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn()
            .map_err(|err| format!("打开链接失败：{err}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = trimmed;
        return Err("当前平台暂不支持打开外部链接".into());
    }
    Ok(())
}
