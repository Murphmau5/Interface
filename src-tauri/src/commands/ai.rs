//! AI 接线命令层：全部经 `lib.rs` 派发，预览窗口已被 window-label 门禁拒绝。
//!
//! Key 只在 Rust 内部经凭据管理器读写；任何命令不返回明文，前端可见字段
//! 只有 `{ configured, last4, updatedAt }`。

use serde::Serialize;
use tauri::State;

use crate::ai;
use crate::commands::candidates;
use crate::db::Db;
use crate::error::AppError;
use crate::secrets;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalyzeResult {
    pub candidate: candidates::CandidateRow,
    pub warnings: Vec<String>,
    pub model: String,
}

pub(crate) fn read_key(scope: &str) -> Result<Option<String>, AppError> {
    let account = secrets::account_for(scope)?;
    Ok(secrets::read(account)?.map(|(secret, _)| secret))
}

#[tauri::command]
pub async fn ai_settings_get(db: State<'_, Db>) -> Result<ai::AiSettingsSnapshot, AppError> {
    ai::snapshot(&db.pool).await
}

#[tauri::command]
pub async fn ai_provider_set(
    db: State<'_, Db>,
    input: ai::ProviderConfig,
) -> Result<ai::ProviderConfig, AppError> {
    ai::save_provider(&db.pool, input).await
}

#[tauri::command]
pub async fn ai_search_set(
    db: State<'_, Db>,
    input: ai::SearchConfig,
) -> Result<ai::SearchConfig, AppError> {
    ai::save_search(&db.pool, input).await
}

#[tauri::command]
pub async fn ai_credential_set(
    db: State<'_, Db>,
    scope: String,
    key: String,
) -> Result<ai::CredentialStatus, AppError> {
    ai::credential_set(&db.pool, &scope, &key).await
}

#[tauri::command]
pub fn ai_credential_clear(scope: String) -> Result<ai::CredentialStatus, AppError> {
    ai::credential_clear(&scope)
}

#[tauri::command]
pub async fn ai_test_connection(
    db: State<'_, Db>,
    scope: String,
) -> Result<ai::TestOutcome, AppError> {
    match scope.as_str() {
        "model" => {
            let cfg = ai::load_provider(&db.pool).await?;
            let key = if cfg.auth_mode == "bearer" {
                read_key("model")?
            } else {
                None
            };
            ai::test_model(&cfg, key.as_deref()).await
        }
        "search" => {
            let cfg = ai::load_search(&db.pool).await?;
            let key = if cfg.auth_mode == "bearer" {
                read_key("search")?
            } else {
                None
            };
            ai::test_search(&cfg, key.as_deref()).await
        }
        _ => Err(AppError::InvalidInput("测试范围不合法".into())),
    }
}

#[tauri::command]
pub async fn ai_analyze(
    db: State<'_, Db>,
    input: ai::AnalyzeInput,
) -> Result<AiAnalyzeResult, AppError> {
    let cfg = ai::load_provider(&db.pool).await?;
    let key = if cfg.auth_mode == "bearer" {
        read_key("model")?
    } else {
        None
    };
    let outcome = ai::analyze(&cfg, key.as_deref(), &input).await?;

    // 唯一落库路径：写候选池，等待人工审核；不写 cases，也没有免审开关
    let candidate = candidates::insert_candidate(
        &db.pool,
        &input.kind,
        &outcome.draft.title,
        &outcome.draft.summary,
        &outcome.draft.payload_json,
        "ai",
        input.source_url.as_deref(),
    )
    .await?;

    Ok(AiAnalyzeResult {
        candidate,
        warnings: outcome.warnings,
        model: outcome.model,
    })
}

#[tauri::command]
pub async fn ai_config_export(db: State<'_, Db>) -> Result<ai::AiConfigExport, AppError> {
    ai::export_config(&db.pool).await
}
