//! 内容包命令层：本地导入必须是独立可用路径，在线地址只是可选补充。

use tauri::State;

use crate::content_pkg::{
    self, ImportReport, InstalledPackage, PackageLimits, UninstallReport, FEED_URL_SETTING,
};
use crate::db::Db;
use crate::error::AppError;

fn package_error(code: &str, message: impl Into<String>) -> AppError {
    AppError::ContentPackage {
        code: code.into(),
        message: message.into(),
    }
}

#[tauri::command]
pub async fn content_packages_list(db: State<'_, Db>) -> Result<Vec<InstalledPackage>, AppError> {
    content_pkg::list_packages(&db.pool).await
}

/// 本地导入：给定文件路径即可安装，不依赖任何在线服务。
#[tauri::command]
pub async fn content_package_import(
    db: State<'_, Db>,
    path: String,
) -> Result<ImportReport, AppError> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::InvalidInput("没有收到内容包路径".into()));
    }
    let metadata = std::fs::metadata(path)
        .map_err(|err| package_error("E_PKG_MISSING", format!("无法读取内容包文件：{err}")))?;
    if !metadata.is_file() {
        return Err(package_error("E_PKG_MISSING", "内容包路径不是文件"));
    }
    if metadata.len() > PackageLimits::default().max_zip_bytes as u64 {
        return Err(package_error(
            "E_PKG_TOO_LARGE",
            format!(
                "内容包 {} MB，超过 {} MB 上限",
                metadata.len() / (1024 * 1024),
                PackageLimits::default().max_zip_bytes / (1024 * 1024)
            ),
        ));
    }
    let bytes = std::fs::read(path)
        .map_err(|err| package_error("E_PKG_MISSING", format!("读取内容包失败：{err}")))?;
    let keys = content_pkg::resolve_trusted_keys(&db.pool).await?;
    content_pkg::import_package(
        &db.pool,
        &bytes,
        "local",
        Some(path),
        &keys,
        &PackageLimits::default(),
    )
    .await
}

/// 在线安装：地址可由调用方传入，未传时读取设置项 `content.feedUrl`。
#[tauri::command]
pub async fn content_package_install_url(
    db: State<'_, Db>,
    url: Option<String>,
) -> Result<ImportReport, AppError> {
    let limits = PackageLimits::default();
    let url = match url.map(|value| value.trim().to_string()) {
        Some(value) if !value.is_empty() => value,
        _ => {
            let saved: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?1")
                .bind(FEED_URL_SETTING)
                .fetch_optional(&db.pool)
                .await?;
            saved
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    package_error(
                        "E_PKG_DOWNLOAD",
                        "未配置在线内容包地址：本地导入仍然可用",
                    )
                })?
        }
    };

    let bytes = content_pkg::download_package(&url, false, &limits).await?;
    let keys = content_pkg::resolve_trusted_keys(&db.pool).await?;
    content_pkg::import_package(&db.pool, &bytes, "online", Some(&url), &keys, &limits).await
}

#[tauri::command]
pub async fn content_package_uninstall(
    db: State<'_, Db>,
    package_id: String,
) -> Result<UninstallReport, AppError> {
    let package_id = package_id.trim();
    if package_id.is_empty() {
        return Err(AppError::InvalidInput("内容包 id 不能为空".into()));
    }
    content_pkg::uninstall_package(&db.pool, package_id).await
}
