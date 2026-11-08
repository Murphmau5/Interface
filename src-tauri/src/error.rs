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
        }
        map.end()
    }
}
