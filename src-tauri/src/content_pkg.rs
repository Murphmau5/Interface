//! 内容包：签名 zip + manifest 校验 + 合并与卸载。
//!
//! 包结构（根目录）：
//! - `manifest.json`：版本、条目清单、逐文件 sha256、最低应用版本；
//! - `signature.txt`：Ed25519 签名（对 manifest.json 原始字节，小写 hex）；
//! - `content/...`：条目载荷 JSON 与可选 HTML。
//!
//! 红线：
//! - manifest 或签名不过，整包拒绝，不写入任何数据；
//! - 条目内容先在内存里全部校验通过，才进入数据库事务；
//! - 解压只读进内存，但条目名仍逐条校验：拒绝 `..`、绝对路径、盘符、反斜杠；
//! - 不允许可执行文件扩展名；
//! - 包内 HTML 一律走 [`crate::html_sanitize`]，原始 HTML 永不入库；
//! - 合并按版本取舍，用户改过的条目不覆盖，用户删过的条目不复生；
//! - 卸载只处理来源为该包的条目，用户自建数据不动。

use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::time::Duration;

use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::commands::cases::{CASE_KINDS, CONFIDENCE_VALUES};
use crate::error::AppError;
use crate::html_sanitize::{sanitize_bytes, SanitizeState};
use crate::param_evidence;
use crate::search;

pub const MANIFEST_NAME: &str = "manifest.json";
pub const SIGNATURE_NAME: &str = "signature.txt";
pub const FORMAT_NAME: &str = "jiexu.content-package";
#[cfg_attr(not(test), allow(dead_code))]
pub const FORMAT_VERSION: u32 = 2;
/// 仍可导入的老格式：v1 没有 specRef，按「最高 estimated」降级处理。
pub const SUPPORTED_FORMAT_VERSIONS: [u32; 2] = [1, 2];

/// 内置发布公钥（V1 内容包签名密钥）。可用设置项 `content.trustedKeys`
/// 追加自建签名公钥；内置公钥始终可信。
pub const DEFAULT_PUBLIC_KEY_HEX: &str =
    "460886f55c6a1c4ef9560ec0f57b4c3c0b4ec88dd8418faa621d2bc3969d4909";
pub const TRUSTED_KEYS_SETTING: &str = "content.trustedKeys";
pub const FEED_URL_SETTING: &str = "content.feedUrl";

pub const MAX_PACKAGE_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_UNCOMPRESSED_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 5000;
pub const MAX_ITEM_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_ITEMS: usize = 2000;
pub const MAX_COMPRESSION_RATIO: u64 = 200;
pub const MAX_PAYLOAD_BYTES: usize = 512 * 1024;
pub const MAX_HTML_EMBED_BYTES: usize = 256 * 1024;
const MAX_REPORT_ITEMS: usize = 500;
const MAX_TAG_CHARS: usize = 40;
const MAX_TAGS: usize = 20;
const MAX_CATEGORIES: usize = 200;

const BLOCKED_EXTENSIONS: [&str; 26] = [
    "exe", "dll", "sys", "scr", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "mjs",
    "cjs", "jse", "wsf", "wsh", "hta", "msi", "msp", "cpl", "jar", "lnk", "reg", "sh", "py",
];

#[derive(Debug, Clone)]
pub struct PackageLimits {
    pub max_zip_bytes: usize,
    pub max_uncompressed_bytes: u64,
    pub max_entries: usize,
    pub max_item_bytes: usize,
    pub max_items: usize,
    pub max_compression_ratio: u64,
}

impl Default for PackageLimits {
    fn default() -> Self {
        Self {
            max_zip_bytes: MAX_PACKAGE_BYTES,
            max_uncompressed_bytes: MAX_UNCOMPRESSED_BYTES,
            max_entries: MAX_ENTRIES,
            max_item_bytes: MAX_ITEM_BYTES,
            max_items: MAX_ITEMS,
            max_compression_ratio: MAX_COMPRESSION_RATIO,
        }
    }
}

/* ------------------------------- manifest ------------------------------- */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub min_app_version: String,
    pub created_at: String,
    /// 包自带类目词表：只补缺，不覆盖既有类目标签。
    #[serde(default)]
    pub categories: Vec<ManifestCategory>,
    #[serde(default)]
    pub items: Vec<ManifestItem>,
    /// 增量包显式声明移除的条目；缺省不等于移除，避免一次漏打包清空用户库。
    #[serde(default)]
    pub removed_items: Vec<String>,
    #[serde(default)]
    pub files: Vec<ManifestFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub confidence: String,
    #[serde(default)]
    pub platform: String,
    /// 必须在本包 `categories` 内声明；缺省表示不归类。
    #[serde(default)]
    pub category_id: Option<String>,
    pub version: String,
    pub path: String,
    /// 可选 HTML 文件路径；读入后按白名单清洗，再嵌入 payload.html。
    #[serde(default)]
    pub html_path: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestCategory {
    pub id: String,
    /// 必须属于风格 / 主题 / 组件 / 动效 / 反馈之一。
    pub domain: String,
    pub group_label: String,
    pub label: String,
    #[serde(default)]
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFile {
    pub path: String,
    pub sha256: String,
}

/* ------------------------------- 输出结构 ------------------------------- */

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPackage {
    pub id: String,
    pub name: String,
    pub version: String,
    pub source: String,
    pub source_ref: Option<String>,
    pub min_app_version: String,
    pub manifest_sha256: String,
    pub item_count: i64,
    pub installed_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportStats {
    pub created: i64,
    pub updated: i64,
    pub unchanged: i64,
    pub skipped_modified: i64,
    pub skipped_deleted: i64,
    pub skipped_user_data: i64,
    pub removed: i64,
    pub kept_modified: i64,
    pub kept_favorite: i64,
    /// 本次导入中被降级的参数个数：声称 verified 但缺 specRef 或原文对不上。
    pub degraded_params: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemOutcome {
    pub item_id: String,
    pub case_id: String,
    pub outcome: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub package: InstalledPackage,
    pub stats: ImportStats,
    pub items: Vec<ItemOutcome>,
    pub items_truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallReport {
    pub package_id: String,
    pub removed: i64,
    pub kept_modified: i64,
    pub kept_favorite: i64,
}

/// 检查更新结果。`status` 只有三种：未配置、已是最新、有新版本。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub configured: bool,
    pub feed_url: Option<String>,
    pub status: String,
    pub package_id: Option<String>,
    pub package_name: Option<String>,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub total_items: i64,
    pub added: i64,
    pub changed: i64,
    pub removed: i64,
    pub kept_modified: i64,
    pub kept_deleted: i64,
    pub unaffected: i64,
    /// 本次更新会触碰的条目数：新增 + 更新 + 保留改动/删除 + 移除。
    pub affected: i64,
}

impl UpdateCheck {
    fn not_configured() -> Self {
        Self {
            configured: false,
            feed_url: None,
            status: "not-configured".into(),
            package_id: None,
            package_name: None,
            installed_version: None,
            latest_version: None,
            total_items: 0,
            added: 0,
            changed: 0,
            removed: 0,
            kept_modified: 0,
            kept_deleted: 0,
            unaffected: 0,
            affected: 0,
        }
    }
}

/// 更新结果摘要：新增 / 更新 / 跳过 / 保留 / 移除，对应导入统计的口语化分组。
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSummary {
    pub added: i64,
    pub updated: i64,
    pub skipped: i64,
    pub kept: i64,
    pub removed: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateApplyReport {
    pub report: ImportReport,
    pub summary: UpdateSummary,
    pub previous_version: Option<String>,
}

impl UpdateSummary {
    fn from_stats(stats: &ImportStats) -> Self {
        Self {
            added: stats.created,
            updated: stats.updated,
            // 内容没变，或同 ID 属于用户自建数据：不触碰
            skipped: stats.unchanged + stats.skipped_user_data,
            // 用户改过 / 删过的条目：保留用户结果，不被包覆盖
            kept: stats.skipped_modified
                + stats.skipped_deleted
                + stats.kept_modified
                + stats.kept_favorite,
            removed: stats.removed,
        }
    }
}

/* -------------------------------- 工具 --------------------------------- */

fn pkg_err(code: &str, message: impl Into<String>) -> AppError {
    AppError::ContentPackage {
        code: code.into(),
        message: message.into(),
    }
}

/// 下载阶段的错误按「地址问题」「网络不可达」分开，避免前端只能显示一句「更新失败」。
fn from_fetch(err: AppError) -> AppError {
    match err {
        AppError::Fetch { code, message } => {
            let mapped = match code.as_str() {
                "E_FETCH_TIMEOUT" | "E_NETWORK" => "E_PKG_FEED_UNREACHABLE",
                "E_URL_INVALID" | "E_URL_SCHEME" | "E_URL_BLOCKED" => "E_PKG_FEED_INVALID",
                _ => "E_PKG_DOWNLOAD",
            };
            pkg_err(mapped, format!("{message}（{code}）"))
        }
        other => other,
    }
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    let value = value.trim();
    if value.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(value.len() / 2);
    let bytes = value.as_bytes();
    for index in (0..bytes.len()).step_by(2) {
        let high = (bytes[index] as char).to_digit(16)?;
        let low = (bytes[index + 1] as char).to_digit(16)?;
        out.push(((high << 4) | low) as u8);
    }
    Some(out)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = crate::sha256::Sha256::new();
    hasher.update(bytes);
    crate::sha256::hex(&hasher.finalize())
}

fn current_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn version_parts(value: &str) -> Option<Vec<u64>> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 40 {
        return None;
    }
    let trimmed = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
    let mut parts = Vec::new();
    for segment in trimmed.split('.') {
        if segment.is_empty() || !segment.chars().all(|ch| ch.is_ascii_digit()) {
            return None;
        }
        parts.push(segment.parse::<u64>().ok()?);
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts)
}

/// 返回 Some(Ordering)：-1 小于、0 相同、1 大于；非法版本返回 None。
pub fn compare_versions(left: &str, right: &str) -> Option<i32> {
    let mut left_parts = version_parts(left)?;
    let mut right_parts = version_parts(right)?;
    let width = left_parts.len().max(right_parts.len());
    left_parts.resize(width, 0);
    right_parts.resize(width, 0);
    Some(match left_parts.cmp(&right_parts) {
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Equal => 0,
        std::cmp::Ordering::Greater => 1,
    })
}

fn validate_version(value: &str, field: &str) -> Result<(), AppError> {
    if version_parts(value).is_none() {
        return Err(pkg_err(
            "E_PKG_MANIFEST",
            format!("{field} 不是合法版本号：{value}"),
        ));
    }
    Ok(())
}

fn validate_slug(value: &str, field: &str) -> Result<(), AppError> {
    let ok = !value.is_empty()
        && value.len() <= 80
        && value.chars().all(|ch| {
            ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '.' || ch == '-' || ch == '_'
        });
    if !ok {
        return Err(pkg_err(
            "E_PKG_MANIFEST",
            format!("{field} 只能是小写字母、数字、点、横线或下划线，且不超过 80 字符：{value}"),
        ));
    }
    Ok(())
}

/// 条目名校验：只允许相对路径，拒绝目录穿越与绝对路径。
fn validate_entry_name(name: &str) -> Result<(), AppError> {
    let invalid = name.is_empty()
        || name.len() > 200
        || name.contains('\\')
        || name.contains(':')
        || name.starts_with('/')
        || name.chars().any(|ch| ch.is_control())
        || name.split('/').any(|segment| segment == ".." || segment == "." || segment.is_empty());
    if invalid {
        return Err(pkg_err(
            "E_PKG_PATH",
            format!("内容包含有非法路径：{name}"),
        ));
    }
    Ok(())
}

fn extension_of(name: &str) -> String {
    name.rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default()
}

fn is_blocked_extension(name: &str) -> bool {
    let ext = extension_of(name);
    !ext.is_empty() && BLOCKED_EXTENSIONS.contains(&ext.as_str())
}

/* ------------------------------- 包读取 -------------------------------- */

#[derive(Debug)]
pub struct LoadedPackage {
    pub manifest: Manifest,
    pub manifest_sha256: String,
    pub files: HashMap<String, Vec<u8>>,
}

fn read_entries(
    bytes: &[u8],
    limits: &PackageLimits,
) -> Result<HashMap<String, Vec<u8>>, AppError> {
    if bytes.len() > limits.max_zip_bytes {
        return Err(pkg_err(
            "E_PKG_TOO_LARGE",
            format!(
                "内容包 {} MB，超过 {} MB 上限",
                bytes.len() / (1024 * 1024),
                limits.max_zip_bytes / (1024 * 1024)
            ),
        ));
    }

    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|err| pkg_err("E_PKG_INVALID_ZIP", format!("无法读取 zip：{err}")))?;
    if archive.len() > limits.max_entries {
        return Err(pkg_err(
            "E_PKG_TOO_LARGE",
            format!("内容包条目数 {}，超过 {} 上限", archive.len(), limits.max_entries),
        ));
    }

    let mut files: HashMap<String, Vec<u8>> = HashMap::new();
    let mut total: u64 = 0;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|err| pkg_err("E_PKG_INVALID_ZIP", format!("读取 zip 条目失败：{err}")))?;
        let name = entry.name().to_string();
        if entry.is_dir() {
            continue;
        }
        validate_entry_name(&name)?;
        if is_blocked_extension(&name) {
            return Err(pkg_err(
                "E_PKG_EXECUTABLE",
                format!("内容包不允许携带可执行文件：{name}"),
            ));
        }

        let declared = entry.size();
        if declared > limits.max_item_bytes as u64 {
            return Err(pkg_err(
                "E_PKG_TOO_LARGE",
                format!("文件 {name} 解压后超过 {} MB 上限", limits.max_item_bytes / (1024 * 1024)),
            ));
        }
        let compressed = entry.compressed_size();
        if declared > 1024 * 1024 && compressed > 0 && declared / compressed > limits.max_compression_ratio
        {
            return Err(pkg_err(
                "E_PKG_TOO_LARGE",
                format!("文件 {name} 压缩比异常（疑似压缩炸弹），已拒绝"),
            ));
        }
        total = total.saturating_add(declared);
        if total > limits.max_uncompressed_bytes {
            return Err(pkg_err(
                "E_PKG_TOO_LARGE",
                format!(
                    "内容包解压后超过 {} MB 上限",
                    limits.max_uncompressed_bytes / (1024 * 1024)
                ),
            ));
        }

        let mut buffer = Vec::with_capacity(declared.min(1024 * 1024) as usize);
        entry
            .by_ref()
            .take(limits.max_item_bytes as u64 + 1)
            .read_to_end(&mut buffer)
            .map_err(|err| pkg_err("E_PKG_INVALID_ZIP", format!("读取 {name} 失败：{err}")))?;
        if buffer.len() > limits.max_item_bytes {
            return Err(pkg_err(
                "E_PKG_TOO_LARGE",
                format!("文件 {name} 解压后超过上限"),
            ));
        }
        if files.insert(name.clone(), buffer).is_some() {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("内容包内文件重名：{name}"),
            ));
        }
    }

    Ok(files)
}

fn verify_signature(
    manifest_bytes: &[u8],
    signature_hex: &str,
    trusted_keys: &[Vec<u8>],
) -> Result<(), AppError> {
    let signature = hex_decode(signature_hex)
        .ok_or_else(|| pkg_err("E_PKG_SIGNATURE", "签名文件不是合法的 hex 文本"))?;
    if signature.len() != 64 {
        return Err(pkg_err(
            "E_PKG_SIGNATURE",
            format!("签名长度应为 64 字节，实际 {}", signature.len()),
        ));
    }
    for key in trusted_keys {
        if key.len() != 32 {
            continue;
        }
        if UnparsedPublicKey::new(&ED25519, key)
            .verify(manifest_bytes, &signature)
            .is_ok()
        {
            return Ok(());
        }
    }
    Err(pkg_err(
        "E_PKG_SIGNATURE",
        "签名校验失败：manifest 内容与签名不匹配，或发布者公钥不受信任",
    ))
}

/// 校验签名、manifest 与全部文件；任何一项不过都整包拒绝。
pub fn load_package(
    bytes: &[u8],
    limits: &PackageLimits,
    trusted_keys: &[Vec<u8>],
) -> Result<LoadedPackage, AppError> {
    let files = read_entries(bytes, limits)?;

    let manifest_bytes = files
        .get(MANIFEST_NAME)
        .ok_or_else(|| pkg_err("E_PKG_MISSING", "内容包缺少 manifest.json"))?
        .to_vec();
    let signature_hex = std::str::from_utf8(
        files
            .get(SIGNATURE_NAME)
            .ok_or_else(|| pkg_err("E_PKG_MISSING", "内容包缺少 signature.txt"))?,
    )
    .map_err(|_| pkg_err("E_PKG_SIGNATURE", "签名文件不是 UTF-8 文本"))?;
    verify_signature(&manifest_bytes, signature_hex, trusted_keys)?;

    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|err| pkg_err("E_PKG_MANIFEST", format!("manifest.json 不是合法 JSON：{err}")))?;

    if manifest.format != FORMAT_NAME {
        return Err(pkg_err(
            "E_PKG_MANIFEST",
            format!("不是界序内容包（format = {}）", manifest.format),
        ));
    }
    if !SUPPORTED_FORMAT_VERSIONS.contains(&manifest.format_version) {
        return Err(pkg_err(
            "E_PKG_MANIFEST",
            format!(
                "内容包格式版本 {} 不受支持（当前支持 1、2）",
                manifest.format_version
            ),
        ));
    }
    validate_slug(&manifest.id, "内容包 id")?;
    validate_version(&manifest.version, "内容包 version")?;
    validate_version(&manifest.min_app_version, "minAppVersion")?;
    if manifest.name.trim().is_empty() || manifest.name.chars().count() > 120 {
        return Err(pkg_err("E_PKG_MANIFEST", "内容包名称不能为空且不能超过 120 字符"));
    }
    if manifest.items.len() > limits.max_items {
        return Err(pkg_err(
            "E_PKG_TOO_LARGE",
            format!("条目数 {}，超过 {} 上限", manifest.items.len(), limits.max_items),
        ));
    }

    match compare_versions(&manifest.min_app_version, current_app_version()) {
        Some(1) => {
            return Err(pkg_err(
                "E_PKG_APP_TOO_OLD",
                format!(
                    "内容包要求应用版本 ≥ {}，当前为 {}",
                    manifest.min_app_version,
                    current_app_version()
                ),
            ))
        }
        None => return Err(pkg_err("E_PKG_MANIFEST", "minAppVersion 无法比较")),
        _ => {}
    }

    // 逐文件哈希：先确认 manifest 登记的文件都在，再多出的文件一律拒绝。
    let mut declared: HashMap<&str, &str> = HashMap::new();
    for entry in &manifest.files {
        validate_entry_name(&entry.path)?;
        if entry.path == MANIFEST_NAME || entry.path == SIGNATURE_NAME {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("manifest 不能把 {} 登记为内容文件", entry.path),
            ));
        }
        if declared.insert(entry.path.as_str(), entry.sha256.as_str()).is_some() {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("manifest 重复登记文件：{}", entry.path),
            ));
        }
    }
    for (name, data) in &files {
        if name == MANIFEST_NAME || name == SIGNATURE_NAME {
            continue;
        }
        let expected = declared.get(name.as_str()).ok_or_else(|| {
            pkg_err(
                "E_PKG_MANIFEST",
                format!("内容包含有未登记文件：{name}"),
            )
        })?;
        let actual = sha256_hex(data);
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(pkg_err(
                "E_PKG_HASH",
                format!("文件哈希与 manifest 不一致：{name}"),
            ));
        }
    }
    for path in declared.keys() {
        if !files.contains_key(*path) {
            return Err(pkg_err(
                "E_PKG_MISSING",
                format!("内容包缺少 manifest 登记的文件：{path}"),
            ));
        }
    }

    if manifest.categories.len() > MAX_CATEGORIES {
        return Err(pkg_err(
            "E_PKG_TOO_LARGE",
            format!("类目数 {}，超过 {} 上限", manifest.categories.len(), MAX_CATEGORIES),
        ));
    }
    let mut declared_categories: HashMap<&str, ()> = HashMap::new();
    for category in &manifest.categories {
        validate_slug(&category.id, "类目 id")?;
        if !CASE_KINDS.contains(&category.domain.as_str()) {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("类目 {} 的 domain 非法：{}", category.id, category.domain),
            ));
        }
        if !(0..=9999).contains(&category.sort_order) {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("类目 {} 的 sortOrder 必须在 0–9999", category.id),
            ));
        }
        if category.label.trim().is_empty() || category.label.chars().count() > MAX_TAG_CHARS {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("类目 {} 的 label 不能为空且不能超过 {MAX_TAG_CHARS} 字符", category.id),
            ));
        }
        if category.group_label.trim().is_empty()
            || category.group_label.chars().count() > MAX_TAG_CHARS
        {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!(
                    "类目 {} 的 groupLabel 不能为空且不能超过 {MAX_TAG_CHARS} 字符",
                    category.id
                ),
            ));
        }
        if declared_categories.insert(category.id.as_str(), ()).is_some() {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("类目 id 重复：{}", category.id),
            ));
        }
    }

    let mut seen_items: HashMap<&str, ()> = HashMap::new();
    for item in &manifest.items {
        validate_slug(&item.id, "条目 id")?;
        if seen_items.insert(item.id.as_str(), ()).is_some() {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("条目 id 重复：{}", item.id),
            ));
        }
        if let Some(category_id) = &item.category_id {
            if !declared_categories.contains_key(category_id.as_str()) {
                return Err(pkg_err(
                    "E_PKG_MANIFEST",
                    format!("条目 {} 引用了未声明的类目：{category_id}", item.id),
                ));
            }
        }
        validate_version(&item.version, &format!("条目 {} 的 version", item.id))?;
        validate_entry_name(&item.path)?;
        if let Some(html_path) = &item.html_path {
            validate_entry_name(html_path)?;
        }
    }
    for removed in &manifest.removed_items {
        validate_slug(removed, "removedItems")?;
        if seen_items.contains_key(removed.as_str()) {
            return Err(pkg_err(
                "E_PKG_MANIFEST",
                format!("条目 {removed} 同时出现在 items 与 removedItems 中"),
            ));
        }
    }

    Ok(LoadedPackage {
        manifest,
        manifest_sha256: sha256_hex(&manifest_bytes),
        files,
    })
}

/* ------------------------------- 条目准备 ------------------------------- */

#[derive(Debug, Clone)]
struct PreparedItem {
    id: String,
    case_id: String,
    kind: String,
    title: String,
    summary: String,
    confidence: String,
    platform: String,
    payload_json: String,
    category_id: Option<String>,
    version: String,
    tags: Vec<String>,
    hash: String,
    /// 该条目在归一化时被降级的参数个数
    degraded: i64,
}

fn item_hash(
    kind: &str,
    title: &str,
    summary: &str,
    payload_json: &str,
    confidence: &str,
    platform: &str,
    category_id: Option<&str>,
) -> String {
    let value = serde_json::json!({
        "kind": kind,
        "title": title,
        "summary": summary,
        "payload": payload_json,
        "confidence": confidence,
        "platform": platform,
        "category": category_id,
    });
    sha256_hex(value.to_string().as_bytes())
}

fn prepare_items(pkg: &LoadedPackage) -> Result<Vec<PreparedItem>, AppError> {
    let mut prepared = Vec::with_capacity(pkg.manifest.items.len());

    for item in &pkg.manifest.items {
        let item_err = |message: String| {
            pkg_err(
                "E_PKG_ITEM",
                format!("条目 {} 校验失败：{message}", item.id),
            )
        };

        if !CASE_KINDS.contains(&item.kind.as_str()) {
            return Err(item_err(format!("未知类型 {}", item.kind)));
        }
        let title = item.title.trim();
        if title.is_empty() || title.chars().count() > 120 {
            return Err(item_err("标题不能为空且不能超过 120 字符".into()));
        }
        let summary = item.summary.trim();
        if summary.chars().count() > 400 {
            return Err(item_err("摘要不能超过 400 字符".into()));
        }
        let confidence = if item.confidence.trim().is_empty() {
            "estimated".to_string()
        } else {
            item.confidence.trim().to_string()
        };
        if !CONFIDENCE_VALUES.contains(&confidence.as_str()) {
            return Err(item_err(format!("置信度取值不合法：{confidence}")));
        }
        let platform = if item.platform.trim().is_empty() {
            "web".to_string()
        } else {
            item.platform.trim().to_string()
        };
        if !search::PLATFORMS.contains(&platform.as_str()) {
            return Err(item_err(format!("平台取值不合法：{platform}")));
        }

        let payload_bytes = pkg
            .files
            .get(&item.path)
            .ok_or_else(|| pkg_err("E_PKG_MISSING", format!("内容包缺少条目文件：{}", item.path)))?;
        let mut payload: serde_json::Value = serde_json::from_slice(payload_bytes)
            .map_err(|err| item_err(format!("载荷不是合法 JSON：{err}")))?;
        if !payload.is_object() {
            return Err(item_err("载荷必须是 JSON 对象".into()));
        }

        if let Some(html_path) = &item.html_path {
            let html_bytes = pkg
                .files
                .get(html_path)
                .ok_or_else(|| pkg_err("E_PKG_MISSING", format!("内容包缺少 HTML 文件：{html_path}")))?;
            let sanitized = sanitize_bytes(html_bytes);
            if sanitized.report.state == SanitizeState::Rejected {
                let reason = sanitized
                    .report
                    .issues
                    .first()
                    .map(|issue| issue.message.clone())
                    .unwrap_or_else(|| "未给出原因".into());
                return Err(item_err(format!("HTML 清洗被拒绝：{reason}")));
            }
            if sanitized.html.len() > MAX_HTML_EMBED_BYTES {
                return Err(item_err(format!(
                    "清洗后的 HTML 超过 {} KB，无法嵌入条目",
                    MAX_HTML_EMBED_BYTES / 1024
                )));
            }
            payload["html"] = serde_json::json!({
                "state": "cleaned",
                "content": sanitized.html,
                "report": sanitized.report,
            });
        }

        // 参数级 verified 必须带有效 specRef；v1 老包没有 ref，统一降级后入库
        let evidence_notes = param_evidence::normalize_payload(&mut payload);
        let payload_json = payload.to_string();
        if payload_json.len() > MAX_PAYLOAD_BYTES {
            return Err(item_err(format!(
                "载荷超过 {} KB 上限",
                MAX_PAYLOAD_BYTES / 1024
            )));
        }

        let mut tags: Vec<String> = Vec::new();
        for tag in &item.tags {
            let tag = tag.trim();
            if tag.is_empty() || tag.chars().count() > MAX_TAG_CHARS {
                return Err(item_err(format!("标签不合法：{tag}")));
            }
            if !tags.iter().any(|existing| existing == tag) {
                tags.push(tag.to_string());
            }
        }
        if tags.len() > MAX_TAGS {
            return Err(item_err(format!("标签不能超过 {MAX_TAGS} 个")));
        }

        let hash = item_hash(
            &item.kind,
            title,
            summary,
            &payload_json,
            &confidence,
            &platform,
            item.category_id.as_deref(),
        );
        prepared.push(PreparedItem {
            id: item.id.clone(),
            case_id: format!("pkg:{}:{}", pkg.manifest.id, item.id),
            kind: item.kind.clone(),
            title: title.to_string(),
            summary: summary.to_string(),
            confidence,
            platform,
            payload_json,
            category_id: item.category_id.clone(),
            version: item.version.clone(),
            tags,
            hash,
            degraded: evidence_notes.len() as i64,
        });
    }

    Ok(prepared)
}

/* -------------------------------- 合并 --------------------------------- */

#[derive(Debug, FromRow)]
struct ExistingCase {
    origin_package_id: Option<String>,
    origin_version: Option<String>,
    origin_hash: Option<String>,
    deleted_at: Option<String>,
    is_favorite: bool,
    kind: String,
    title: String,
    summary: String,
    payload_json: String,
    confidence: String,
    platform: String,
    category_id: Option<String>,
}

impl ExistingCase {
    fn current_hash(&self) -> String {
        item_hash(
            &self.kind,
            &self.title,
            &self.summary,
            &self.payload_json,
            &self.confidence,
            &self.platform,
            self.category_id.as_deref(),
        )
    }
}

async fn fetch_existing(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    id: &str,
) -> Result<Option<ExistingCase>, AppError> {
    Ok(sqlx::query_as::<_, ExistingCase>(
        r#"
        SELECT origin_package_id, origin_version, origin_hash, deleted_at,
               is_favorite, kind, title, summary, payload_json, confidence, platform,
               category_id
        FROM cases
        WHERE id = ?1
        "#,
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await?)
}

async fn apply_tags(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    case_id: &str,
    tags: &[String],
) -> Result<(), AppError> {
    for tag in tags {
        let existing: Option<String> = sqlx::query_scalar("SELECT id FROM tags WHERE label = ?1")
            .bind(tag)
            .fetch_optional(&mut **tx)
            .await?;
        let tag_id = match existing {
            Some(id) => id,
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                sqlx::query("INSERT INTO tags (id, label) VALUES (?1, ?2)")
                    .bind(&id)
                    .bind(tag)
                    .execute(&mut **tx)
                    .await?;
                id
            }
        };
        sqlx::query(
            "INSERT OR IGNORE INTO case_tags (case_id, tag_id) VALUES (?1, ?2)",
        )
        .bind(case_id)
        .bind(&tag_id)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn upsert_package_item(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    package_id: &str,
    item_id: &str,
    case_id: &str,
    version: &str,
    hash: &str,
    state: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO content_package_items
            (package_id, item_id, case_id, item_version, installed_sha256, state, installed_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(package_id, item_id) DO UPDATE SET
            case_id = excluded.case_id,
            item_version = excluded.item_version,
            installed_sha256 = excluded.installed_sha256,
            state = excluded.state,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(package_id)
    .bind(item_id)
    .bind(case_id)
    .bind(version)
    .bind(hash)
    .bind(state)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn unbind_case(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    case_id: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        UPDATE cases
        SET origin_package_id = NULL,
            origin_item_id = NULL,
            origin_version = NULL,
            origin_hash = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?1
        "#,
    )
    .bind(case_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// 导入内容包：先整包校验，再在一个事务里应用全部条目。
pub async fn import_package(
    pool: &SqlitePool,
    bytes: &[u8],
    source: &str,
    source_ref: Option<&str>,
    trusted_keys: &[Vec<u8>],
    limits: &PackageLimits,
) -> Result<ImportReport, AppError> {
    let loaded = load_package(bytes, limits, trusted_keys)?;
    let prepared = prepare_items(&loaded)?;
    let manifest = &loaded.manifest;

    let installed = sqlx::query_as::<_, InstalledPackage>(
        "SELECT * FROM content_packages WHERE id = ?1",
    )
    .bind(&manifest.id)
    .fetch_optional(pool)
    .await?;
    if let Some(existing) = &installed {
        match compare_versions(&manifest.version, &existing.version) {
            Some(-1) => {
                return Err(pkg_err(
                    "E_PKG_VERSION",
                    format!(
                        "已安装更高版本 {}，拒绝降级到 {}",
                        existing.version, manifest.version
                    ),
                ))
            }
            Some(0) if existing.manifest_sha256 != loaded.manifest_sha256 => {
                return Err(pkg_err(
                    "E_PKG_VERSION",
                    format!("已安装同版本 {} 但内容不同，请先卸载再安装", manifest.version),
                ))
            }
            Some(_) => {}
            None => {
                return Err(pkg_err(
                    "E_PKG_VERSION",
                    format!("已安装版本号无法比较：{}", existing.version),
                ))
            }
        }
    }

    let mut tx = pool.begin().await?;
    // 类目词表随包补充：已存在的 id 保留原标签，避免覆盖用户或旧包的定义。
    for category in &manifest.categories {
        sqlx::query(
            r#"
            INSERT INTO categories (id, domain, group_label, label, sort_order)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(id) DO NOTHING
            "#,
        )
        .bind(&category.id)
        .bind(&category.domain)
        .bind(category.group_label.trim())
        .bind(category.label.trim())
        .bind(category.sort_order)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        r#"
        INSERT INTO content_packages
            (id, name, version, source, source_ref, min_app_version,
             manifest_sha256, item_count, installed_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            source = excluded.source,
            source_ref = excluded.source_ref,
            min_app_version = excluded.min_app_version,
            manifest_sha256 = excluded.manifest_sha256,
            item_count = excluded.item_count,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(&manifest.id)
    .bind(manifest.name.trim())
    .bind(&manifest.version)
    .bind(source)
    .bind(source_ref)
    .bind(&manifest.min_app_version)
    .bind(&loaded.manifest_sha256)
    .bind(prepared.len() as i64)
    .execute(&mut *tx)
    .await?;

    let mut stats = ImportStats::default();
    let mut outcomes: Vec<ItemOutcome> = Vec::new();
    let mut refresh_ids: Vec<String> = Vec::new();

    for item in &prepared {
        let existing = fetch_existing(&mut tx, &item.case_id).await?;
        let outcome = match existing {
            None => {
                sqlx::query(
                    r#"
                    INSERT INTO cases
                        (id, kind, title, summary, payload_json, payload_schema_version,
                         confidence, is_favorite, category_id, platform, component_layer,
                         origin_package_id, origin_item_id, origin_version, origin_hash,
                         created_at, updated_at)
                    VALUES
                        (?1, ?2, ?3, ?4, ?5, 2, ?6, 0, ?7, ?8, NULL, ?9, ?10, ?11, ?12,
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                    "#,
                )
                .bind(&item.case_id)
                .bind(&item.kind)
                .bind(&item.title)
                .bind(&item.summary)
                .bind(&item.payload_json)
                .bind(&item.confidence)
                .bind(&item.category_id)
                .bind(&item.platform)
                .bind(&manifest.id)
                .bind(&item.id)
                .bind(&item.version)
                .bind(&item.hash)
                .execute(&mut *tx)
                .await?;
                apply_tags(&mut tx, &item.case_id, &item.tags).await?;
                upsert_package_item(
                    &mut tx,
                    &manifest.id,
                    &item.id,
                    &item.case_id,
                    &item.version,
                    &item.hash,
                    "active",
                )
                .await?;
                stats.created += 1;
                refresh_ids.push(item.case_id.clone());
                "created"
            }
            Some(case) if case.deleted_at.is_some() => {
                // 用户删过的条目：不复活，但保留记录防止下次又问一遍
                upsert_package_item(
                    &mut tx,
                    &manifest.id,
                    &item.id,
                    &item.case_id,
                    case.origin_version.as_deref().unwrap_or(&item.version),
                    case.origin_hash.as_deref().unwrap_or(&item.hash),
                    "deleted-by-user",
                )
                .await?;
                stats.skipped_deleted += 1;
                "skipped-deleted"
            }
            Some(case) if case.origin_package_id.as_deref() != Some(manifest.id.as_str()) => {
                // 同 ID 但来源不是本包：视为用户数据，永不覆盖
                stats.skipped_user_data += 1;
                "skipped-user-data"
            }
            Some(case) if case.current_hash() != case.origin_hash.clone().unwrap_or_default() => {
                // 用户改过条目：保留用户版本，也不改记录的已应用版本
                upsert_package_item(
                    &mut tx,
                    &manifest.id,
                    &item.id,
                    &item.case_id,
                    case.origin_version.as_deref().unwrap_or(&item.version),
                    case.origin_hash.as_deref().unwrap_or(&item.hash),
                    "user-modified",
                )
                .await?;
                stats.skipped_modified += 1;
                "skipped-modified"
            }
            Some(case) => {
                let same_hash = item.hash == case.origin_hash.clone().unwrap_or_default();
                let up_to_date = same_hash
                    && compare_versions(&item.version, case.origin_version.as_deref().unwrap_or("0"))
                        .map(|order| order <= 0)
                        .unwrap_or(false);
                if up_to_date {
                    upsert_package_item(
                        &mut tx,
                        &manifest.id,
                        &item.id,
                        &item.case_id,
                        &item.version,
                        &item.hash,
                        "active",
                    )
                    .await?;
                    stats.unchanged += 1;
                    "unchanged"
                } else {
                    sqlx::query(
                        r#"
                        UPDATE cases
                        SET kind = ?2,
                            title = ?3,
                            summary = ?4,
                            payload_json = ?5,
                            payload_schema_version = 2,
                            confidence = ?6,
                            platform = ?7,
                            category_id = ?8,
                            origin_version = ?9,
                            origin_hash = ?10,
                            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                        WHERE id = ?1
                        "#,
                    )
                    .bind(&item.case_id)
                    .bind(&item.kind)
                    .bind(&item.title)
                    .bind(&item.summary)
                    .bind(&item.payload_json)
                    .bind(&item.confidence)
                    .bind(&item.platform)
                    .bind(&item.category_id)
                    .bind(&item.version)
                    .bind(&item.hash)
                    .execute(&mut *tx)
                    .await?;
                    upsert_package_item(
                        &mut tx,
                        &manifest.id,
                        &item.id,
                        &item.case_id,
                        &item.version,
                        &item.hash,
                        "active",
                    )
                    .await?;
                    stats.updated += 1;
                    refresh_ids.push(item.case_id.clone());
                    "updated"
                }
            }
        };

        // 只有真正写库的条目才计入降级数；被保留的用户改动没有落库，不重复计
        if outcome == "created" || outcome == "updated" {
            stats.degraded_params += item.degraded;
        }

        if outcomes.len() < MAX_REPORT_ITEMS {
            outcomes.push(ItemOutcome {
                item_id: item.id.clone(),
                case_id: item.case_id.clone(),
                outcome: outcome.into(),
                version: item.version.clone(),
            });
        }
    }

    // 增量移除：只处理显式声明的 tombstones
    for removed_id in &manifest.removed_items {
        let row: Option<Option<String>> = sqlx::query_scalar(
            "SELECT case_id FROM content_package_items WHERE package_id = ?1 AND item_id = ?2",
        )
        .bind(&manifest.id)
        .bind(removed_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(case_id) = row else {
            continue;
        };
        sqlx::query("DELETE FROM content_package_items WHERE package_id = ?1 AND item_id = ?2")
            .bind(&manifest.id)
            .bind(removed_id)
            .execute(&mut *tx)
            .await?;
        let Some(case_id) = case_id else {
            continue;
        };
        let Some(case) = fetch_existing(&mut tx, &case_id).await? else {
            stats.removed += 1;
            continue;
        };
        if case.deleted_at.is_some() || case.origin_package_id.as_deref() != Some(manifest.id.as_str())
        {
            continue;
        }
        if case.current_hash() != case.origin_hash.clone().unwrap_or_default() {
            unbind_case(&mut tx, &case_id).await?;
            stats.kept_modified += 1;
            continue;
        }
        if case.is_favorite {
            unbind_case(&mut tx, &case_id).await?;
            stats.kept_favorite += 1;
            continue;
        }
        sqlx::query("DELETE FROM cases WHERE id = ?1")
            .bind(&case_id)
            .execute(&mut *tx)
            .await?;
        stats.removed += 1;
    }

    tx.commit().await?;

    // 事务外补写搜索列；失败不回滚已提交的导入
    for id in refresh_ids {
        search::refresh_case(pool, &id).await?;
    }

    let package = sqlx::query_as::<_, InstalledPackage>("SELECT * FROM content_packages WHERE id = ?1")
        .bind(&manifest.id)
        .fetch_one(pool)
        .await?;

    let items_truncated = prepared.len() > outcomes.len();
    Ok(ImportReport {
        package,
        stats,
        items: outcomes,
        items_truncated,
    })
}

/// 安装包内置内容：只在尚未安装该包时导入一次。
///
/// 返回 `Ok(None)` 表示跳过（已安装过，含用户此前手动导入）。
/// 已安装即不再走安装包，后续更新由 `content.feedUrl` 在线包负责；
/// 用户改过的条目仍按 `import_package` 的合并规则跳过。
pub async fn import_builtin_if_needed(
    pool: &SqlitePool,
    package_id: &str,
    bytes: &[u8],
    source_ref: Option<&str>,
) -> Result<Option<ImportReport>, AppError> {
    let installed: Option<String> =
        sqlx::query_scalar("SELECT id FROM content_packages WHERE id = ?1")
            .bind(package_id)
            .fetch_optional(pool)
            .await?;
    if installed.is_some() {
        return Ok(None);
    }
    let keys = resolve_trusted_keys(pool).await?;
    let report = import_package(
        pool,
        bytes,
        "builtin",
        source_ref,
        &keys,
        &PackageLimits::default(),
    )
    .await?;
    Ok(Some(report))
}

/* -------------------------------- 卸载 --------------------------------- */

pub async fn uninstall_package(
    pool: &SqlitePool,
    package_id: &str,
) -> Result<UninstallReport, AppError> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM content_packages WHERE id = ?1")
        .bind(package_id)
        .fetch_optional(pool)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("内容包未安装".into()));
    }

    let rows: Vec<Option<String>> =
        sqlx::query_scalar("SELECT case_id FROM content_package_items WHERE package_id = ?1")
            .bind(package_id)
            .fetch_all(pool)
            .await?;

    let mut tx = pool.begin().await?;
    let mut report = UninstallReport {
        package_id: package_id.to_string(),
        removed: 0,
        kept_modified: 0,
        kept_favorite: 0,
    };

    for case_id in rows.into_iter().flatten() {
        let Some(case) = fetch_existing(&mut tx, &case_id).await? else {
            report.removed += 1;
            continue;
        };
        if case.deleted_at.is_some() {
            report.removed += 1;
            continue;
        }
        if case.origin_package_id.as_deref() != Some(package_id) {
            continue;
        }
        if case.current_hash() != case.origin_hash.clone().unwrap_or_default() {
            unbind_case(&mut tx, &case_id).await?;
            report.kept_modified += 1;
            continue;
        }
        if case.is_favorite {
            unbind_case(&mut tx, &case_id).await?;
            report.kept_favorite += 1;
            continue;
        }
        sqlx::query("DELETE FROM cases WHERE id = ?1")
            .bind(&case_id)
            .execute(&mut *tx)
            .await?;
        report.removed += 1;
    }

    sqlx::query("DELETE FROM content_packages WHERE id = ?1")
        .bind(package_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(report)
}

/* -------------------------------- 查询 --------------------------------- */

pub async fn list_packages(pool: &SqlitePool) -> Result<Vec<InstalledPackage>, AppError> {
    Ok(sqlx::query_as::<_, InstalledPackage>(
        "SELECT * FROM content_packages ORDER BY installed_at DESC",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn resolve_trusted_keys(pool: &SqlitePool) -> Result<Vec<Vec<u8>>, AppError> {
    let configured: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?1")
            .bind(TRUSTED_KEYS_SETTING)
            .fetch_optional(pool)
            .await?;

    let mut keys = Vec::new();
    if let Some(key) = hex_decode(DEFAULT_PUBLIC_KEY_HEX) {
        keys.push(key);
    }
    if let Some(value) = configured {
        for part in value.split([',', '\n', '\r', ' ', '\t', ';']) {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            if let Some(key) = hex_decode(part) {
                if key.len() == 32 && !keys.contains(&key) {
                    keys.push(key);
                }
            }
        }
    }
    Ok(keys)
}

/* -------------------------------- 下载 --------------------------------- */

pub async fn download_package(
    raw_url: &str,
    allow_loopback: bool,
    limits: &PackageLimits,
) -> Result<Vec<u8>, AppError> {
    crate::ai::ensure_tls_provider();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("jiexu-interface/1.0.7")
        .build()
        .map_err(|err| pkg_err("E_PKG_DOWNLOAD", format!("HTTP 客户端初始化失败：{err}")))?;

    let mut current = crate::fetch::validate_url(raw_url, allow_loopback)
        .await
        .map_err(from_fetch)?;
    let mut hops = 0usize;
    let response = loop {
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|err| {
                if err.is_timeout() {
                    pkg_err("E_PKG_FEED_UNREACHABLE", "访问在线地址超时，请检查网络后重试")
                } else if err.is_connect() {
                    pkg_err("E_PKG_FEED_UNREACHABLE", "无法连接到在线地址，请检查地址与网络")
                } else {
                    pkg_err("E_PKG_FEED_UNREACHABLE", format!("访问在线地址失败：{err}"))
                }
            })?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| pkg_err("E_PKG_FEED_INVALID", "重定向响应缺少 Location"))?;
            let next = current
                .join(location)
                .map_err(|_| pkg_err("E_PKG_FEED_INVALID", format!("重定向地址无法解析：{location}")))?;
            current = crate::fetch::validate_url(next.as_str(), allow_loopback)
                .await
                .map_err(from_fetch)?;
            hops += 1;
            if hops > crate::fetch::MAX_REDIRECTS {
                return Err(pkg_err("E_PKG_FEED_INVALID", "重定向次数过多，已停止"));
            }
            continue;
        }
        break response;
    };

    if !response.status().is_success() {
        return Err(pkg_err(
            "E_PKG_FEED_HTTP",
            format!("在线地址返回 HTTP {}", response.status().as_u16()),
        ));
    }
    if let Some(length) = response.content_length() {
        if length as usize > limits.max_zip_bytes {
            return Err(pkg_err(
                "E_PKG_TOO_LARGE",
                format!("内容包 {} MB，超过上限", length / (1024 * 1024)),
            ));
        }
    }

    let mut body = Vec::new();
    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|err| pkg_err("E_PKG_DOWNLOAD", format!("读取下载内容失败：{err}")))?
    {
        if body.len() + chunk.len() > limits.max_zip_bytes {
            return Err(pkg_err(
                "E_PKG_TOO_LARGE",
                format!(
                    "内容包超过 {} MB 上限",
                    limits.max_zip_bytes / (1024 * 1024)
                ),
            ));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/* ------------------------------ 在线更新 ------------------------------ */

async fn resolve_feed_url(
    pool: &SqlitePool,
    raw: Option<&str>,
) -> Result<Option<String>, AppError> {
    if let Some(value) = raw {
        let trimmed = value.trim();
        return Ok((!trimmed.is_empty()).then(|| trimmed.to_string()));
    }
    let saved: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?1")
            .bind(FEED_URL_SETTING)
            .fetch_optional(pool)
            .await?;
    Ok(saved
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty()))
}

/// 拉取 feed 指向的内容包，校验签名与最低版本后与已安装版本比较。
///
/// 只读：不写库、不改任何设置。未配置地址时返回 `configured = false` 而不是报错。
pub async fn check_update(
    pool: &SqlitePool,
    raw_url: Option<&str>,
    allow_loopback: bool,
    limits: &PackageLimits,
) -> Result<UpdateCheck, AppError> {
    let Some(url) = resolve_feed_url(pool, raw_url).await? else {
        return Ok(UpdateCheck::not_configured());
    };
    let bytes = download_package(&url, allow_loopback, limits).await?;
    let keys = resolve_trusted_keys(pool).await?;
    let loaded = load_package(&bytes, limits, &keys)?;
    let prepared = prepare_items(&loaded)?;
    let manifest = &loaded.manifest;

    let installed = sqlx::query_as::<_, InstalledPackage>(
        "SELECT * FROM content_packages WHERE id = ?1",
    )
    .bind(&manifest.id)
    .fetch_optional(pool)
    .await?;
    let installed_version = installed.as_ref().map(|row| row.version.clone());

    let mut check = UpdateCheck {
        configured: true,
        feed_url: Some(url),
        status: "up-to-date".into(),
        package_id: Some(manifest.id.clone()),
        package_name: Some(manifest.name.clone()),
        installed_version: installed_version.clone(),
        latest_version: Some(manifest.version.clone()),
        total_items: manifest.items.len() as i64,
        added: 0,
        changed: 0,
        removed: 0,
        kept_modified: 0,
        kept_deleted: 0,
        unaffected: 0,
        affected: 0,
    };

    // 同版本或更高版本的已装包都算「已是最新」，不进入差异计算
    if let Some(current) = &installed_version {
        if compare_versions(&manifest.version, current) != Some(1) {
            return Ok(check);
        }
    }

    // 只读事务：判定逻辑与 import_package 的合并分支保持一致
    let mut tx = pool.begin().await?;
    for item in &prepared {
        match fetch_existing(&mut tx, &item.case_id).await? {
            None => check.added += 1,
            Some(case) if case.deleted_at.is_some() => check.kept_deleted += 1,
            Some(case) if case.origin_package_id.as_deref() != Some(manifest.id.as_str()) => {
                check.unaffected += 1
            }
            Some(case) if case.current_hash() != case.origin_hash.clone().unwrap_or_default() => {
                check.kept_modified += 1
            }
            Some(case) => {
                let same_hash = item.hash == case.origin_hash.clone().unwrap_or_default();
                let up_to_date = same_hash
                    && compare_versions(&item.version, case.origin_version.as_deref().unwrap_or("0"))
                        .map(|order| order <= 0)
                        .unwrap_or(false);
                if up_to_date {
                    check.unaffected += 1;
                } else {
                    check.changed += 1;
                }
            }
        }
    }
    for removed_id in &manifest.removed_items {
        let exists: Option<Option<String>> = sqlx::query_scalar(
            "SELECT case_id FROM content_package_items WHERE package_id = ?1 AND item_id = ?2",
        )
        .bind(&manifest.id)
        .bind(removed_id)
        .fetch_optional(&mut *tx)
        .await?;
        if exists.is_some() {
            check.removed += 1;
        }
    }
    tx.rollback().await?;

    check.affected = check.added
        + check.changed
        + check.kept_modified
        + check.kept_deleted
        + check.removed;
    check.status = "update-available".into();
    Ok(check)
}

/// 用户点「安装更新」时才真正写入；行为与在线安装一致，额外给出摘要与旧版本号。
pub async fn apply_update(
    pool: &SqlitePool,
    raw_url: Option<&str>,
    allow_loopback: bool,
    limits: &PackageLimits,
) -> Result<UpdateApplyReport, AppError> {
    let Some(url) = resolve_feed_url(pool, raw_url).await? else {
        return Err(pkg_err(
            "E_PKG_FEED_NOT_CONFIGURED",
            "未配置在线内容包地址：本地导入仍然可用",
        ));
    };
    let bytes = download_package(&url, allow_loopback, limits).await?;
    let keys = resolve_trusted_keys(pool).await?;
    let loaded = load_package(&bytes, limits, &keys)?;
    let previous_version: Option<String> =
        sqlx::query_scalar("SELECT version FROM content_packages WHERE id = ?1")
            .bind(&loaded.manifest.id)
            .fetch_optional(pool)
            .await?;

    let report = import_package(pool, &bytes, "online", Some(&url), &keys, limits).await?;
    let summary = UpdateSummary::from_stats(&report.stats);
    Ok(UpdateApplyReport {
        report,
        summary,
        previous_version,
    })
}

/* -------------------------------- 测试 --------------------------------- */

/// 端到端测试用：由固定种子派生的公钥。
#[cfg(test)]
pub(crate) fn fixture_public_key(seed: &[u8; 32]) -> Vec<u8> {
    use ring::signature::KeyPair;
    ring::signature::Ed25519KeyPair::from_seed_unchecked(seed)
        .expect("测试密钥应可用")
        .public_key()
        .as_ref()
        .to_vec()
}

/// 端到端测试用：生成一个签名内容包（条目标题即内容，便于断言版本变化）。
#[cfg(test)]
pub(crate) fn fixture_package(
    seed: &[u8; 32],
    package_id: &str,
    version: &str,
    items: &[(&str, &str)],
) -> Vec<u8> {
    fixture_package_with(seed, package_id, version, "1.0.0", items, &[])
}

/// 可指定签名密钥、最低应用版本与移除清单的版本，用于构造更新链的各种失败分支。
#[cfg(test)]
pub(crate) fn fixture_package_with(
    seed: &[u8; 32],
    package_id: &str,
    version: &str,
    min_app_version: &str,
    items: &[(&str, &str)],
    removed: &[&str],
) -> Vec<u8> {
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    let mut manifest = Manifest {
        format: FORMAT_NAME.into(),
        format_version: FORMAT_VERSION,
        id: package_id.into(),
        name: "端到端内容包".into(),
        version: version.into(),
        min_app_version: min_app_version.into(),
        created_at: "2026-11-09T00:00:00Z".into(),
        categories: Vec::new(),
        items: Vec::new(),
        removed_items: removed.iter().map(|id| (*id).to_string()).collect(),
        files: Vec::new(),
    };
    let mut payloads: Vec<(String, Vec<u8>)> = Vec::new();
    for (id, title) in items {
        manifest.items.push(ManifestItem {
            id: (*id).into(),
            kind: "style".into(),
            title: (*title).into(),
            summary: "端到端摘要".into(),
            confidence: "estimated".into(),
            platform: "web".into(),
            category_id: None,
            version: "1.0.0".into(),
            path: format!("content/{id}.json"),
            html_path: None,
            tags: vec![],
        });
        payloads.push((
            format!("content/{id}.json"),
            serde_json::json!({ "preview": { "title": title } })
                .to_string()
                .into_bytes(),
        ));
    }
    for (path, data) in &payloads {
        manifest.files.push(ManifestFile {
            path: path.clone(),
            sha256: sha256_hex(data),
        });
    }

    let manifest_bytes = serde_json::to_vec(&manifest).expect("序列化 manifest");
    let pair = ring::signature::Ed25519KeyPair::from_seed_unchecked(seed).expect("测试密钥");
    let signature = crate::sha256::hex(pair.sign(&manifest_bytes).as_ref());

    let mut entries: Vec<(String, Vec<u8>)> = vec![
        (MANIFEST_NAME.to_string(), manifest_bytes),
        (SIGNATURE_NAME.to_string(), signature.into_bytes()),
    ];
    entries.extend(payloads);

    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, data) in entries {
        writer
            .start_file(
                name,
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
            )
            .expect("写 zip 条目");
        writer.write_all(&data).expect("写 zip 内容");
    }
    writer.finish().expect("完成 zip").into_inner()
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    use ring::signature::KeyPair;

    use super::*;

    const TEST_SEED: [u8; 32] = [0x42; 32];

    fn test_key() -> (Vec<u8>, Vec<u8>) {
        let pair = ring::signature::Ed25519KeyPair::from_seed_unchecked(&TEST_SEED)
            .expect("测试密钥应可用");
        (
            TEST_SEED.to_vec(),
            pair.public_key().as_ref().to_vec(),
        )
    }

    fn sign_manifest(manifest_bytes: &[u8]) -> String {
        let pair = ring::signature::Ed25519KeyPair::from_seed_unchecked(&TEST_SEED)
            .expect("测试密钥应可用");
        crate::sha256::hex(pair.sign(manifest_bytes).as_ref())
    }

    fn base_manifest(version: &str) -> Manifest {
        Manifest {
            format: FORMAT_NAME.into(),
            format_version: FORMAT_VERSION,
            id: "demo.pack".into(),
            name: "演示内容包".into(),
            version: version.into(),
            min_app_version: "1.0.0".into(),
            created_at: "2026-11-09T00:00:00Z".into(),
            categories: vec![],
            items: vec![],
            removed_items: vec![],
            files: vec![],
        }
    }

    fn manifest_item(id: &str, version: &str) -> ManifestItem {
        ManifestItem {
            id: id.into(),
            kind: "style".into(),
            title: format!("条目 {id}"),
            summary: "测试摘要".into(),
            confidence: "estimated".into(),
            platform: "web".into(),
            category_id: None,
            version: version.into(),
            path: format!("content/{id}.json"),
            html_path: None,
            tags: vec!["演示".into()],
        }
    }

    fn prepare_manifest(mut manifest: Manifest, payloads: &[(String, Vec<u8>)]) -> Manifest {
        for (path, data) in payloads {
            manifest.files.push(ManifestFile {
                path: path.clone(),
                sha256: sha256_hex(data),
            });
        }
        manifest
    }

    fn build_package(manifest: &Manifest, payloads: &[(String, Vec<u8>)]) -> Vec<u8> {
        let manifest_bytes = serde_json::to_vec(manifest).expect("序列化 manifest");
        let signature = sign_manifest(&manifest_bytes);

        let mut entries: Vec<(String, Vec<u8>)> = vec![
            (MANIFEST_NAME.to_string(), manifest_bytes),
            (SIGNATURE_NAME.to_string(), signature.into_bytes()),
        ];
        entries.extend(payloads.iter().cloned());

        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in entries {
            writer
                .start_file(
                    name,
                    SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
                )
                .expect("写 zip 条目");
            writer.write_all(&data).expect("写 zip 内容");
        }
        writer.finish().expect("完成 zip").into_inner()
    }

    fn payload(title: &str) -> Vec<u8> {
        serde_json::json!({ "preview": { "title": title } })
            .to_string()
            .into_bytes()
    }

    async fn test_pool() -> (SqlitePool, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("jiexu-pkg-{}", uuid::Uuid::new_v4()));
        let pool = crate::db::connect(&dir).await.expect("创建测试数据库");
        (pool, dir)
    }

    fn code(err: &AppError) -> String {
        match err {
            AppError::ContentPackage { code, .. } => code.clone(),
            other => format!("OTHER:{other:?}"),
        }
    }

    #[tokio::test]
    async fn imports_normal_package_and_sanitizes_html() {
        let (pool, dir) = test_pool().await;

        let mut manifest = base_manifest("1.0.0");
        let mut item = manifest_item("glass", "1.0.0");
        item.html_path = Some("content/glass.html".into());
        manifest.items.push(item);
        manifest.items.push(manifest_item("motion", "1.0.0"));
        let payloads = vec![
            ("content/glass.json".to_string(), payload("玻璃")),
            ("content/motion.json".to_string(), payload("动效")),
            (
                "content/glass.html".to_string(),
                "<html><head><script>alert(1)</script></head><body><p>正文</p></body></html>"
                    .as_bytes()
                    .to_vec(),
            ),
        ];
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);
        let (_, public) = test_key();

        let report = import_package(&pool, &package, "local", Some("<test>"), &[public], &PackageLimits::default())
            .await
            .expect("正常包应导入成功");
        assert_eq!(report.stats.created, 2);
        assert_eq!(report.package.version, "1.0.0");

        let payload_json: String = sqlx::query_scalar(
            "SELECT payload_json FROM cases WHERE id = 'pkg:demo.pack:glass'",
        )
        .fetch_one(&pool)
        .await
        .expect("读取清洗后的条目");
        let value: serde_json::Value = serde_json::from_str(&payload_json).expect("载荷是 JSON");
        assert_eq!(value["html"]["state"], "cleaned");
        assert!(!value["html"]["content"].as_str().unwrap().contains("script"));

        let tags: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM case_tags WHERE case_id = 'pkg:demo.pack:glass'",
        )
        .fetch_one(&pool)
        .await
        .expect("读取标签");
        assert_eq!(tags, 1);

        let packages = list_packages(&pool).await.expect("列出内容包");
        assert_eq!(packages.len(), 1);

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn imports_format_v1_package_and_degrades_params_without_spec_ref() {
        let (pool, dir) = test_pool().await;

        // 格式 1 的老包：manifest 版本仍是 1，载荷是 v2 口径、声称 verified 但没有 specRef
        let mut manifest = base_manifest("1.0.1");
        manifest.format_version = 1;
        manifest.items.push(manifest_item("legacy", "1.0.1"));
        let legacy = serde_json::json!({
            "preview": { "radiusPx": 24, "easing": "ease-out" },
            "paramSources": { "radiusPx": "verified", "easing": "verified" },
            "paramRefs": {
                "radiusPx": {
                    "platform": "Material 3",
                    "version": "Expressive 2025+",
                    "component": "Shape · corner radius",
                    "url": "https://m3.material.io/styles/shape/overview",
                    "quote": "24 dp"
                }
            }
        })
        .to_string()
        .into_bytes();
        let payloads = vec![("content/legacy.json".to_string(), legacy)];
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);
        let (_, public) = test_key();

        let report = import_package(
            &pool,
            &package,
            "local",
            Some("<test>"),
            &[public],
            &PackageLimits::default(),
        )
        .await
        .expect("格式 1 老包仍应可导入");
        assert_eq!(report.stats.created, 1);
        assert_eq!(report.stats.degraded_params, 1);

        let payload_json: String = sqlx::query_scalar(
            "SELECT payload_json FROM cases WHERE id = 'pkg:demo.pack:legacy'",
        )
        .fetch_one(&pool)
        .await
        .expect("读取降级后的条目");
        let value: serde_json::Value = serde_json::from_str(&payload_json).expect("载荷是 JSON");
        assert_eq!(value["paramSources"]["radiusPx"], "verified");
        assert_eq!(value["paramSources"]["easing"], "estimated");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn rejects_missing_file_hash_mismatch_and_tampered_signature() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        let limits = PackageLimits::default();

        // 缺文件：manifest 登记了 content/a.json，但 zip 里没有
        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("a", "1.0.0"));
        let manifest = prepare_manifest(manifest, &[("content/a.json".into(), payload("A"))]);
        let bytes = build_package(&manifest, &[]);
        let err = import_package(&pool, &bytes, "local", None, &[public.clone()], &limits)
            .await
            .expect_err("缺文件应拒绝");
        assert_eq!(code(&err), "E_PKG_MISSING", "{err:?}");

        // 哈希不符：zip 里的内容与 manifest 登记的不一致
        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("a", "1.0.0"));
        let manifest = prepare_manifest(manifest, &[("content/a.json".into(), payload("A"))]);
        let bytes = build_package(
            &manifest,
            &[("content/a.json".into(), payload("被替换"))],
        );
        let err = import_package(&pool, &bytes, "local", None, &[public.clone()], &limits)
            .await
            .expect_err("哈希不符应拒绝");
        assert_eq!(code(&err), "E_PKG_HASH", "{err:?}");

        // 篡改签名：用不受信任的密钥签名
        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("a", "1.0.0"));
        let payloads = vec![("content/a.json".to_string(), payload("A"))];
        let manifest = prepare_manifest(manifest, &payloads);
        let other_seed = [0x24u8; 32];
        let other = ring::signature::Ed25519KeyPair::from_seed_unchecked(&other_seed)
            .expect("另一把测试密钥");
        let manifest_bytes = serde_json::to_vec(&manifest).expect("序列化 manifest");
        let signature = crate::sha256::hex(other.sign(&manifest_bytes).as_ref());
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in std::iter::once((MANIFEST_NAME.to_string(), manifest_bytes))
            .chain(std::iter::once((
                SIGNATURE_NAME.to_string(),
                signature.into_bytes(),
            )))
            .chain(payloads.iter().cloned())
        {
            writer
                .start_file(name, SimpleFileOptions::default())
                .expect("写 zip 条目");
            writer.write_all(&data).expect("写 zip 内容");
        }
        let tampered = writer.finish().expect("完成 zip").into_inner();
        let err = import_package(&pool, &tampered, "local", None, &[public], &limits)
            .await
            .expect_err("签名不受信任应拒绝");
        assert_eq!(code(&err), "E_PKG_SIGNATURE", "{err:?}");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn rejects_traversal_path_and_executable_entries() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        let limits = PackageLimits::default();

        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("a", "1.0.0"));
        let manifest = prepare_manifest(manifest, &[("content/a.json".into(), payload("A"))]);
        let bytes = build_package(
            &manifest,
            &[
                ("content/a.json".into(), payload("A")),
                ("../evil.json".into(), payload("evil")),
            ],
        );
        let err = import_package(&pool, &bytes, "local", None, &[public.clone()], &limits)
            .await
            .expect_err("目录穿越应拒绝");
        assert_eq!(code(&err), "E_PKG_PATH", "{err:?}");

        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("a", "1.0.0"));
        let manifest = prepare_manifest(manifest, &[("content/a.json".into(), payload("A"))]);
        let bytes = build_package(
            &manifest,
            &[
                ("content/a.json".into(), payload("A")),
                ("content/tool.exe".into(), b"MZ".to_vec()),
            ],
        );
        let err = import_package(&pool, &bytes, "local", None, &[public], &limits)
            .await
            .expect_err("可执行文件应拒绝");
        assert_eq!(code(&err), "E_PKG_EXECUTABLE", "{err:?}");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn handles_large_packages_and_rejects_oversized_ones() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();

        // 合法大包：600 条（超过报告上限，统计仍完整）
        let mut manifest = base_manifest("1.0.0");
        let mut payloads = Vec::new();
        for index in 0..600 {
            let id = format!("item-{index}");
            manifest.items.push(manifest_item(&id, "1.0.0"));
            payloads.push((format!("content/{id}.json"), payload(&id)));
        }
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);
        let report = import_package(&pool, &package, "local", None, &[public.clone()], &PackageLimits::default())
            .await
            .expect("大包应能导入");
        assert_eq!(report.stats.created, 600);
        assert!(report.items_truncated, "报告条目应截断但统计完整");

        // 超过条目上限
        let mut manifest = base_manifest("2.0.0");
        let mut payloads = Vec::new();
        for index in 0..2001 {
            let id = format!("x-{index}");
            manifest.items.push(manifest_item(&id, "1.0.0"));
            payloads.push((format!("content/{id}.json"), payload(&id)));
        }
        let limit_manifest = prepare_manifest(manifest, &payloads);
        let oversized = build_package(&limit_manifest, &payloads);
        let err = import_package(&pool, &oversized, "local", None, &[public], &PackageLimits::default())
            .await
            .expect_err("超过条目上限应拒绝");
        assert_eq!(code(&err), "E_PKG_TOO_LARGE", "{err:?}");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn merge_respects_versions_user_edits_and_deletions() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        let limits = PackageLimits::default();

        let make = |version: &str, title: &str| {
            let mut manifest = base_manifest(version);
            let mut item = manifest_item("glass", "1.0.0");
            item.title = title.to_string();
            manifest.items.push(item);
            let payloads = vec![("content/glass.json".to_string(), payload(title))];
            let manifest = prepare_manifest(manifest, &payloads);
            (build_package(&manifest, &payloads), payloads)
        };

        let (v1, _) = make("1.0.0", "第一版");
        let report = import_package(&pool, &v1, "local", None, &[public.clone()], &limits)
            .await
            .expect("首装");
        assert_eq!(report.stats.created, 1);

        // 版本提升且用户未改：覆盖
        let (v2, _) = make("1.1.0", "第二版");
        let report = import_package(&pool, &v2, "local", None, &[public.clone()], &limits)
            .await
            .expect("升级");
        assert_eq!(report.stats.updated, 1);
        let title: String = sqlx::query_scalar("SELECT title FROM cases WHERE id = 'pkg:demo.pack:glass'")
            .fetch_one(&pool)
            .await
            .expect("读标题");
        assert_eq!(title, "第二版");

        // 用户改名后升级：不覆盖
        sqlx::query("UPDATE cases SET title = '我的改法' WHERE id = 'pkg:demo.pack:glass'")
            .execute(&pool)
            .await
            .expect("模拟用户修改");
        let (v3, _) = make("1.2.0", "第三版");
        let report = import_package(&pool, &v3, "local", None, &[public.clone()], &limits)
            .await
            .expect("再次升级");
        assert_eq!(report.stats.skipped_modified, 1);
        let title: String = sqlx::query_scalar("SELECT title FROM cases WHERE id = 'pkg:demo.pack:glass'")
            .fetch_one(&pool)
            .await
            .expect("读标题");
        assert_eq!(title, "我的改法");

        // 用户删除后升级：不复活
        sqlx::query(
            "UPDATE cases SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 'pkg:demo.pack:glass'",
        )
        .execute(&pool)
        .await
        .expect("模拟用户删除");
        let (v4, _) = make("1.3.0", "第四版");
        let report = import_package(&pool, &v4, "local", None, &[public.clone()], &limits)
            .await
            .expect("删除后升级");
        assert_eq!(report.stats.skipped_deleted, 1);
        let deleted_at: Option<String> =
            sqlx::query_scalar("SELECT deleted_at FROM cases WHERE id = 'pkg:demo.pack:glass'")
                .fetch_one(&pool)
                .await
                .expect("读删除状态");
        assert!(deleted_at.is_some(), "用户删除的条目不应被复活");

        // 降级：拒绝
        let (old, _) = make("1.2.0", "旧版");
        let err = import_package(&pool, &old, "local", None, &[public], &limits)
            .await
            .expect_err("降级应拒绝");
        assert_eq!(code(&err), "E_PKG_VERSION", "{err:?}");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn incremental_removal_tombstone_deletes_only_unmodified_items() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        let limits = PackageLimits::default();

        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("keep", "1.0.0"));
        manifest.items.push(manifest_item("drop", "1.0.0"));
        let payloads = vec![
            ("content/keep.json".to_string(), payload("保留")),
            ("content/drop.json".to_string(), payload("移除")),
        ];
        let manifest = prepare_manifest(manifest, &payloads);
        let first = build_package(&manifest, &payloads);
        import_package(&pool, &first, "local", None, &[public.clone()], &limits)
            .await
            .expect("首装");

        // 1.1.0 只发 keep，并显式移除 drop
        let mut manifest = base_manifest("1.1.0");
        manifest.items.push(manifest_item("keep", "1.0.0"));
        manifest.removed_items.push("drop".into());
        let payloads = vec![("content/keep.json".to_string(), payload("保留"))];
        let manifest = prepare_manifest(manifest, &payloads);
        let second = build_package(&manifest, &payloads);
        let report = import_package(&pool, &second, "local", None, &[public], &limits)
            .await
            .expect("增量更新");
        assert_eq!(report.stats.removed, 1);

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE id = 'pkg:demo.pack:drop'")
                .fetch_one(&pool)
                .await
                .expect("读移除条目");
        assert_eq!(count, 0, "未修改的 tombstone 条目应被移除");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn uninstall_removes_package_items_without_touching_user_data() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        let limits = PackageLimits::default();

        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("clean", "1.0.0"));
        manifest.items.push(manifest_item("edited", "1.0.0"));
        manifest.items.push(manifest_item("fav", "1.0.0"));
        let payloads = vec![
            ("content/clean.json".to_string(), payload("干净")),
            ("content/edited.json".to_string(), payload("改过")),
            ("content/fav.json".to_string(), payload("收藏")),
        ];
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);
        import_package(&pool, &package, "local", None, &[public], &limits)
            .await
            .expect("首装");

        // 用户改动 edited、收藏 fav，并自建一条案例
        sqlx::query("UPDATE cases SET summary = '用户改过' WHERE id = 'pkg:demo.pack:edited'")
            .execute(&pool)
            .await
            .expect("模拟用户修改");
        sqlx::query("UPDATE cases SET is_favorite = 1 WHERE id = 'pkg:demo.pack:fav'")
            .execute(&pool)
            .await
            .expect("模拟收藏");
        sqlx::query(
            "INSERT INTO cases (id, kind, title, summary, payload_json, confidence, created_at, updated_at) \
             VALUES ('user-made', 'style', '用户自建', '', '{}', 'user_defined', \
             strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        )
        .execute(&pool)
        .await
        .expect("用户自建案例");

        let report = uninstall_package(&pool, "demo.pack").await.expect("卸载");
        assert_eq!(report.removed, 1);
        assert_eq!(report.kept_modified, 1);
        assert_eq!(report.kept_favorite, 1);

        let remaining: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM cases WHERE id IN ('pkg:demo.pack:clean','pkg:demo.pack:edited','pkg:demo.pack:fav','user-made') ORDER BY id",
        )
        .fetch_all(&pool)
        .await
        .expect("读取剩余案例");
        assert!(!remaining.contains(&"pkg:demo.pack:clean".to_string()));
        assert!(remaining.contains(&"pkg:demo.pack:edited".to_string()));
        assert!(remaining.contains(&"pkg:demo.pack:fav".to_string()));
        assert!(remaining.contains(&"user-made".to_string()));

        let unbound: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE origin_package_id = 'demo.pack'")
                .fetch_one(&pool)
                .await
                .expect("读取来源字段");
        assert_eq!(unbound, 0, "保留下来的条目应解除内容包绑定");

        let packages = list_packages(&pool).await.expect("列出内容包");
        assert!(packages.is_empty(), "卸载后不应残留内容包记录");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn imports_package_categories_and_binds_cases() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        let limits = PackageLimits::default();

        let mut manifest = base_manifest("1.0.0");
        manifest.categories.push(ManifestCategory {
            id: "style.family.material".into(),
            domain: "style".into(),
            group_label: "家族归属".into(),
            label: "材质系".into(),
            sort_order: 10,
        });
        let mut item = manifest_item("glass", "1.0.0");
        item.category_id = Some("style.family.material".into());
        manifest.items.push(item);
        let payloads = vec![("content/glass.json".to_string(), payload("玻璃"))];
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);

        let report = import_package(&pool, &package, "local", None, &[public], &limits)
            .await
            .expect("带类目的包应导入成功");
        assert_eq!(report.stats.created, 1);

        let category: Option<String> =
            sqlx::query_scalar("SELECT category_id FROM cases WHERE id = 'pkg:demo.pack:glass'")
                .fetch_one(&pool)
                .await
                .expect("读案例类目");
        assert_eq!(category.as_deref(), Some("style.family.material"));

        let label: String =
            sqlx::query_scalar("SELECT label FROM categories WHERE id = 'style.family.material'")
                .fetch_one(&pool)
                .await
                .expect("读类目");
        assert_eq!(label, "材质系");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn rejects_undeclared_category_and_invalid_domain() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        let limits = PackageLimits::default();

        let mut manifest = base_manifest("1.0.0");
        let mut item = manifest_item("glass", "1.0.0");
        item.category_id = Some("style.missing".into());
        manifest.items.push(item);
        let payloads = vec![("content/glass.json".to_string(), payload("玻璃"))];
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);
        let err = import_package(&pool, &package, "local", None, &[public.clone()], &limits)
            .await
            .expect_err("未声明类目应拒绝");
        assert_eq!(code(&err), "E_PKG_MANIFEST", "{err:?}");

        let mut manifest = base_manifest("1.0.0");
        manifest.categories.push(ManifestCategory {
            id: "bad.category".into(),
            domain: "layout".into(),
            group_label: "家族归属".into(),
            label: "布局".into(),
            sort_order: 10,
        });
        let payloads = vec![("content/glass.json".to_string(), payload("玻璃"))];
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);
        let err = import_package(&pool, &package, "local", None, &[public], &limits)
            .await
            .expect_err("非法 domain 应拒绝");
        assert_eq!(code(&err), "E_PKG_MANIFEST", "{err:?}");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn builtin_import_runs_once_and_skips_installed_package() {
        let (pool, dir) = test_pool().await;
        let (_, public) = test_key();
        sqlx::query("INSERT INTO settings (key, value) VALUES (?1, ?2)")
            .bind(TRUSTED_KEYS_SETTING)
            .bind(crate::sha256::hex(&public))
            .execute(&pool)
            .await
            .expect("写入信任公钥");

        let mut manifest = base_manifest("1.0.0");
        manifest.items.push(manifest_item("one", "1.0.0"));
        let payloads = vec![("content/one.json".to_string(), payload("一"))];
        let manifest = prepare_manifest(manifest, &payloads);
        let package = build_package(&manifest, &payloads);

        let first = import_builtin_if_needed(&pool, "demo.pack", &package, Some("builtin:test"))
            .await
            .expect("首次导入")
            .expect("首次应导入");
        assert_eq!(first.stats.created, 1);

        let second = import_builtin_if_needed(&pool, "demo.pack", &package, Some("builtin:test"))
            .await
            .expect("二次调用");
        assert!(second.is_none(), "已安装后应跳过");

        let total: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM cases WHERE origin_package_id = 'demo.pack'",
        )
        .fetch_one(&pool)
        .await
        .expect("统计条目");
        assert_eq!(total, 1, "重复导入不应产生重复条目");
        let source: String =
            sqlx::query_scalar("SELECT source FROM content_packages WHERE id = 'demo.pack'")
                .fetch_one(&pool)
                .await
                .expect("读取包记录");
        assert_eq!(source, "builtin");

        drop(pool);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn version_compare_handles_numeric_segments() {
        assert_eq!(compare_versions("1.0.0", "1.0.0"), Some(0));
        assert_eq!(compare_versions("1.0.10", "1.0.9"), Some(1));
        assert_eq!(compare_versions("1.0", "1.0.1"), Some(-1));
        assert_eq!(compare_versions("2.0.0-beta.1", "2.0.0"), Some(0));
        assert_eq!(compare_versions("abc", "1.0.0"), None);
    }
}
