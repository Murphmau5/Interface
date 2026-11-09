use std::path::{Path, PathBuf};

use serde::Serialize;
use sqlx::FromRow;
use tauri::State;
use uuid::Uuid;

use crate::db::Db;
use crate::error::AppError;
use crate::sha256::Sha256;

const MAX_IMPORT_BYTES: u64 = 32 * 1024 * 1024;
const MAX_FILES_PER_BATCH: usize = 20;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub sha256: String,
    pub kind: String,
    pub mime: String,
    pub byte_size: i64,
    pub rel_path: String,
    pub original_name: String,
    pub needs_cleaning: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub path: String,
    pub ok: bool,
    pub reused: bool,
    pub asset: Option<AssetRecord>,
    pub error: Option<String>,
}

fn extension_of(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    let filtered: String = ext
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(8)
        .collect();
    if filtered.is_empty() {
        "bin".into()
    } else {
        filtered
    }
}

fn classify(ext: &str) -> (&'static str, &'static str) {
    match ext {
        "png" => ("image", "image/png"),
        "jpg" | "jpeg" => ("image", "image/jpeg"),
        "gif" => ("image", "image/gif"),
        "webp" => ("image", "image/webp"),
        "svg" => ("image", "image/svg+xml"),
        "avif" => ("image", "image/avif"),
        "mp4" => ("video", "video/mp4"),
        "webm" => ("video", "video/webm"),
        "mov" => ("video", "video/quicktime"),
        "mp3" => ("audio", "audio/mpeg"),
        "wav" => ("audio", "audio/wav"),
        "ogg" => ("audio", "audio/ogg"),
        "m4a" => ("audio", "audio/mp4"),
        "woff" => ("font", "font/woff"),
        "woff2" => ("font", "font/woff2"),
        "ttf" => ("font", "font/ttf"),
        "otf" => ("font", "font/otf"),
        "html" | "htm" => ("html", "text/html"),
        "css" => ("text", "text/css"),
        "js" | "mjs" => ("text", "text/javascript"),
        "json" => ("text", "application/json"),
        "md" | "txt" => ("text", "text/plain"),
        "pdf" => ("document", "application/pdf"),
        "zip" => ("archive", "application/zip"),
        "7z" => ("archive", "application/x-7z-compressed"),
        "rar" => ("archive", "application/vnd.rar"),
        _ => ("other", "application/octet-stream"),
    }
}

fn asset_select() -> &'static str {
    r#"
    SELECT id, sha256, kind, mime, byte_size, rel_path, original_name,
           needs_cleaning, created_at
    FROM assets
    "#
}

/// 批量导入：内容哈希命名、同一文件只存一份；逐个文件返回结果，失败不静默
#[tauri::command]
pub async fn assets_import(
    db: State<'_, Db>,
    case_id: Option<String>,
    paths: Vec<String>,
) -> Result<Vec<ImportOutcome>, AppError> {
    if paths.is_empty() {
        return Err(AppError::InvalidInput("没有收到文件路径".into()));
    }
    if paths.len() > MAX_FILES_PER_BATCH {
        return Err(AppError::InvalidInput(format!(
            "一次最多导入 {MAX_FILES_PER_BATCH} 个文件"
        )));
    }

    let case_id = case_id.filter(|value| !value.trim().is_empty());
    if let Some(id) = &case_id {
        let exists: Option<i64> =
            sqlx::query_scalar("SELECT 1 FROM cases WHERE id = ?1 AND deleted_at IS NULL")
                .bind(id)
                .fetch_optional(&db.pool)
                .await?;
        if exists.is_none() {
            return Err(AppError::NotFound("案例不存在或已删除".into()));
        }
    }

    let objects_root = db.data_dir.join("objects");
    std::fs::create_dir_all(&objects_root).map_err(sqlx::Error::Io)?;

    let mut outcomes = Vec::with_capacity(paths.len());

    for raw in paths {
        let path = PathBuf::from(&raw);

        let metadata = match std::fs::metadata(&path) {
            Ok(value) => value,
            Err(err) => {
                outcomes.push(ImportOutcome {
                    path: raw,
                    ok: false,
                    reused: false,
                    asset: None,
                    error: Some(format!("无法读取文件：{err}")),
                });
                continue;
            }
        };

        if !metadata.is_file() {
            outcomes.push(ImportOutcome {
                path: raw,
                ok: false,
                reused: false,
                asset: None,
                error: Some("不是文件（文件夹暂不支持导入）".into()),
            });
            continue;
        }

        if metadata.len() > MAX_IMPORT_BYTES {
            outcomes.push(ImportOutcome {
                path: raw,
                ok: false,
                reused: false,
                asset: None,
                error: Some(format!(
                    "文件 {} MB，超过 {} MB 上限",
                    metadata.len() / (1024 * 1024),
                    MAX_IMPORT_BYTES / (1024 * 1024)
                )),
            });
            continue;
        }

        let bytes = match std::fs::read(&path) {
            Ok(value) => value,
            Err(err) => {
                outcomes.push(ImportOutcome {
                    path: raw,
                    ok: false,
                    reused: false,
                    asset: None,
                    error: Some(format!("读取失败：{err}")),
                });
                continue;
            }
        };

        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let digest = crate::sha256::hex(&hasher.finalize());

        let ext = extension_of(&path);
        let (kind, mime) = classify(&ext);
        let needs_cleaning = kind == "html";
        let original_name = path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "未命名".into());

        let existing = sqlx::query_as::<_, AssetRecord>(&format!(
            "{} WHERE sha256 = ?1",
            asset_select()
        ))
        .bind(&digest)
        .fetch_optional(&db.pool)
        .await?;

        if let Some(asset) = existing {
            if let Some(id) = &case_id {
                sqlx::query(
                    "INSERT OR IGNORE INTO case_assets (case_id, asset_id) VALUES (?1, ?2)",
                )
                .bind(id)
                .bind(&asset.id)
                .execute(&db.pool)
                .await?;
            }
            outcomes.push(ImportOutcome {
                path: raw,
                ok: true,
                reused: true,
                asset: Some(asset),
                error: None,
            });
            continue;
        }

        let dir = objects_root
            .join(&digest[0..2])
            .join(&digest[2..4]);
        if let Err(err) = std::fs::create_dir_all(&dir) {
            outcomes.push(ImportOutcome {
                path: raw,
                ok: false,
                reused: false,
                asset: None,
                error: Some(format!("创建对象目录失败：{err}")),
            });
            continue;
        }

        let file_name = format!("{digest}.{ext}");
        let absolute = dir.join(&file_name);
        if let Err(err) = std::fs::write(&absolute, &bytes) {
            outcomes.push(ImportOutcome {
                path: raw,
                ok: false,
                reused: false,
                asset: None,
                error: Some(format!("写入对象文件失败：{err}")),
            });
            continue;
        }

        let rel_path = format!(
            "objects/{}/{}/{}",
            &digest[0..2],
            &digest[2..4],
            file_name
        );
        let id = Uuid::new_v4().to_string();

        let insert = sqlx::query(
            r#"
            INSERT OR IGNORE INTO assets
                (id, sha256, kind, mime, byte_size, rel_path, original_name, needs_cleaning)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&id)
        .bind(&digest)
        .bind(kind)
        .bind(mime)
        .bind(bytes.len() as i64)
        .bind(&rel_path)
        .bind(&original_name)
        .bind(if needs_cleaning { 1i64 } else { 0i64 })
        .execute(&db.pool)
        .await;

        if let Err(err) = insert {
            outcomes.push(ImportOutcome {
                path: raw,
                ok: false,
                reused: false,
                asset: None,
                error: Some(format!("写入素材记录失败：{err}")),
            });
            continue;
        }

        let asset = sqlx::query_as::<_, AssetRecord>(&format!(
            "{} WHERE sha256 = ?1",
            asset_select()
        ))
        .bind(&digest)
        .fetch_one(&db.pool)
        .await?;

        if let Some(case_id) = &case_id {
            sqlx::query("INSERT OR IGNORE INTO case_assets (case_id, asset_id) VALUES (?1, ?2)")
                .bind(case_id)
                .bind(&asset.id)
                .execute(&db.pool)
                .await?;
        }

        outcomes.push(ImportOutcome {
            path: raw,
            ok: true,
            reused: false,
            asset: Some(asset),
            error: None,
        });
    }

    Ok(outcomes)
}

#[tauri::command]
pub async fn assets_list_for_case(
    db: State<'_, Db>,
    case_id: String,
) -> Result<Vec<AssetRecord>, AppError> {
    let rows = sqlx::query_as::<_, AssetRecord>(
        r#"
        SELECT a.id, a.sha256, a.kind, a.mime, a.byte_size, a.rel_path,
               a.original_name, a.needs_cleaning, a.created_at
        FROM case_assets ca
        JOIN assets a ON a.id = ca.asset_id
        WHERE ca.case_id = ?1
        ORDER BY ca.created_at DESC
        LIMIT 500
        "#,
    )
    .bind(&case_id)
    .fetch_all(&db.pool)
    .await?;

    Ok(rows)
}
