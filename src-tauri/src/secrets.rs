//! Windows 凭据管理器封装（BYOK）。
//!
//! 只保证：不写入数据库、不写入日志、不随导出包导出。
//! 同一用户权限下的其他进程仍可读取，因此这不是「加密保护」，也不是安全边界。

use crate::error::AppError;

/// Windows `CRED_MAX_CREDENTIAL_BLOB_SIZE` = 5 * 512
pub const MAX_BLOB_BYTES: usize = 2560;
const MAX_COMMENT_BYTES: usize = 256;

pub const ACCOUNT_MODEL: &str = "jiexu-interface:ai:model";
pub const ACCOUNT_SEARCH: &str = "jiexu-interface:search";

pub fn account_for(scope: &str) -> Result<&'static str, AppError> {
    match scope {
        "model" => Ok(ACCOUNT_MODEL),
        "search" => Ok(ACCOUNT_SEARCH),
        _ => Err(AppError::InvalidInput("未知的凭据作用域".into())),
    }
}

/// Windows 凭据管理器的写/删操作在并发线程下并非可靠串行，
/// 并行测试会偶发「删除后仍能读到」。进程内统一加锁，代价可忽略。
fn store_lock() -> std::sync::MutexGuard<'static, ()> {
    use std::sync::{Mutex, OnceLock};
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn write(account: &str, secret: &str, comment: &str) -> Result<(), AppError> {
    if secret.is_empty() {
        return Err(AppError::InvalidInput("密钥不能为空".into()));
    }
    if secret.len() > MAX_BLOB_BYTES {
        return Err(AppError::InvalidInput(format!(
            "密钥超过 {MAX_BLOB_BYTES} 字节上限（Windows 凭据管理器限制），未写入"
        )));
    }
    if comment.len() > MAX_COMMENT_BYTES {
        return Err(AppError::InvalidInput("凭据备注过长".into()));
    }
    let _guard = store_lock();
    platform::write(account, secret, comment)
}

/// 返回 (secret, comment)；不存在时返回 None
pub fn read(account: &str) -> Result<Option<(String, String)>, AppError> {
    let _guard = store_lock();
    platform::read(account)
}

pub fn delete(account: &str) -> Result<(), AppError> {
    let _guard = store_lock();
    platform::delete(account)
}

#[cfg(windows)]
mod platform {
    use std::ptr;

    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    };

    use super::*;

    fn to_wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn last_error(context: &str) -> AppError {
        let code = unsafe { GetLastError() };
        AppError::Secret(format!("{context}（Win32 错误 {code}）"))
    }

    pub(super) fn write(account: &str, secret: &str, comment: &str) -> Result<(), AppError> {
        let mut target = to_wide(account);
        let mut user = to_wide("api-key");
        let mut note = to_wide(comment);
        let mut blob = secret.as_bytes().to_vec();

        let credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_mut_ptr(),
            Comment: note.as_mut_ptr(),
            LastWritten: Default::default(),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: ptr::null_mut(),
            TargetAlias: ptr::null_mut(),
            UserName: user.as_mut_ptr(),
        };

        let ok = unsafe { CredWriteW(&credential, 0) };
        if ok == 0 {
            return Err(last_error("写入 Windows 凭据管理器失败"));
        }
        Ok(())
    }

    pub(super) fn read(account: &str) -> Result<Option<(String, String)>, AppError> {
        let target = to_wide(account);
        let mut raw: *mut CREDENTIALW = ptr::null_mut();

        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) };
        if ok == 0 {
            let code = unsafe { GetLastError() };
            if code == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return Err(AppError::Secret(format!(
                "读取 Windows 凭据管理器失败（Win32 错误 {code}）"
            )));
        }
        if raw.is_null() {
            return Ok(None);
        }

        let credential = unsafe { &*raw };
        let blob = if credential.CredentialBlob.is_null() {
            Vec::new()
        } else {
            unsafe {
                std::slice::from_raw_parts(
                    credential.CredentialBlob,
                    credential.CredentialBlobSize as usize,
                )
                .to_vec()
            }
        };
        let comment = if credential.Comment.is_null() {
            String::new()
        } else {
            let mut len = 0usize;
            unsafe {
                while *credential.Comment.add(len) != 0 {
                    len += 1;
                }
                String::from_utf16_lossy(std::slice::from_raw_parts(credential.Comment, len))
            }
        };
        unsafe { CredFree(raw as *const core::ffi::c_void) };

        let secret = String::from_utf8(blob)
            .map_err(|_| AppError::Secret("凭据内容不是合法 UTF-8".into()))?;
        Ok(Some((secret, comment)))
    }

    pub(super) fn delete(account: &str) -> Result<(), AppError> {
        let target = to_wide(account);
        let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok == 0 {
            let code = unsafe { GetLastError() };
            if code == ERROR_NOT_FOUND {
                return Ok(());
            }
            return Err(AppError::Secret(format!(
                "删除 Windows 凭据失败（Win32 错误 {code}）"
            )));
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub(super) fn write(_account: &str, _secret: &str, _comment: &str) -> Result<(), AppError> {
        Err(AppError::Secret(
            "当前平台没有可用的 Windows 凭据管理器".into(),
        ))
    }

    pub(super) fn read(_account: &str) -> Result<Option<(String, String)>, AppError> {
        Err(AppError::Secret(
            "当前平台没有可用的 Windows 凭据管理器".into(),
        ))
    }

    pub(super) fn delete(_account: &str) -> Result<(), AppError> {
        Err(AppError::Secret(
            "当前平台没有可用的 Windows 凭据管理器".into(),
        ))
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    fn temp_account(label: &str) -> String {
        format!("jiexu-interface:test:{label}:{}", uuid::Uuid::new_v4())
    }

    #[test]
    fn roundtrip_and_delete() {
        let account = temp_account("roundtrip");
        let comment = r#"{"last4":"wxyz","updatedAt":"2026-11-09T10:00:00.000Z"}"#;

        write(&account, "sk-test-value-wxyz", comment).expect("写入应成功");
        let (secret, note) = read(&account).expect("读取应成功").expect("凭据应存在");
        assert_eq!(secret, "sk-test-value-wxyz");
        assert_eq!(note, comment);

        delete(&account).expect("删除应成功");
        assert!(read(&account).expect("删除后读取应成功").is_none());
    }

    #[test]
    fn missing_credential_is_none() {
        let account = temp_account("missing");
        assert!(read(&account).expect("读取应成功").is_none());
        // 删除不存在的凭据也应当成功
        delete(&account).expect("删除不存在凭据应成功");
    }

    #[test]
    fn too_large_blob_rejected() {
        let account = temp_account("too-large");
        let oversized = "k".repeat(MAX_BLOB_BYTES + 1);
        let error = write(&account, &oversized, "").expect_err("超限必须拒绝");
        assert!(error.to_string().contains("2560"));
        // 拒绝后不得留下凭据
        assert!(read(&account).expect("读取应成功").is_none());
    }
}
