use serde::ser::{Serialize, SerializeMap, Serializer};

/// 统一错误信封：{ code, message, retryable, details? }
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("数据库操作失败：{0}")]
    Database(#[from] sqlx::Error),
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    NotFound(String),
    /// Windows 凭据管理器读写失败（E_SECRET_STORE）
    #[error("{0}")]
    Secret(String),
    /// AI 服务未配置或不可用（E_AI_UNAVAILABLE）
    #[error("{0}")]
    AiUnavailable(String),
    /// AI 输出不符合约定结构（E_AI_SCHEMA）
    #[error("{0}")]
    AiSchema(String),
    /// AI Provider 侧错误，code 直接采用分类表
    /// （E_AUTH / E_FORBIDDEN / E_QUOTA / E_RATE_LIMIT / E_AI_TIMEOUT /
    ///  E_NETWORK / E_MODEL_NOT_FOUND / E_REQUEST / E_PROVIDER_DOWN）
    #[error("{message}")]
    AiProvider { code: String, message: String },
    /// 联网抓取 / 搜索失败，code 见 fetch.rs 错误表
    #[error("{message}")]
    Fetch { code: String, message: String },
    /// 内容包校验 / 合并 / 卸载失败，code 以 E_PKG_ 开头
    #[error("{message}")]
    ContentPackage { code: String, message: String },
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(4))?;
        match self {
            AppError::Database(err) => {
                map.serialize_entry("code", "DB_ERROR")?;
                map.serialize_entry("message", "数据库操作失败，请稍后重试")?;
                map.serialize_entry("retryable", &true)?;
                map.serialize_entry("details", &err.to_string())?;
            }
            AppError::InvalidInput(message) => {
                map.serialize_entry("code", "INVALID_INPUT")?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("retryable", &false)?;
            }
            AppError::NotFound(message) => {
                map.serialize_entry("code", "NOT_FOUND")?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("retryable", &false)?;
            }
            AppError::Secret(message) => {
                map.serialize_entry("code", "E_SECRET_STORE")?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("retryable", &false)?;
            }
            AppError::AiUnavailable(message) => {
                map.serialize_entry("code", "E_AI_UNAVAILABLE")?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("retryable", &false)?;
            }
            AppError::AiSchema(message) => {
                map.serialize_entry("code", "E_AI_SCHEMA")?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("retryable", &false)?;
            }
            AppError::AiProvider { code, message } => {
                map.serialize_entry("code", code)?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("retryable", &true)?;
            }
            AppError::Fetch { code, message } => {
                map.serialize_entry("code", code)?;
                map.serialize_entry("message", message)?;
                let retryable = matches!(
                    code.as_str(),
                    "E_FETCH_TIMEOUT" | "E_NETWORK" | "E_HTTP_STATUS" | "E_RATE_LIMIT" | "E_PROVIDER_DOWN"
                );
                map.serialize_entry("retryable", &retryable)?;
            }
            AppError::ContentPackage { code, message } => {
                map.serialize_entry("code", code)?;
                map.serialize_entry("message", message)?;
                map.serialize_entry("retryable", &matches!(
                    code.as_str(),
                    "E_PKG_DOWNLOAD" | "E_PKG_FEED_UNREACHABLE" | "E_PKG_FEED_HTTP"
                ))?;
            }
        }
        map.end()
    }
}
