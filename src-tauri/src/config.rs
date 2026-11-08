use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub const DB_FILE_NAME: &str = "app.db";
pub const ASSETS_DIR_NAME: &str = "assets";

/// 安装版数据落在应用数据目录；绝不允许写回开发工作区。
pub fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| format!("无法解析应用数据目录：{err}"))
}
