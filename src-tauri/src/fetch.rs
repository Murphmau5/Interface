//! 联网抓取链路：URL 守卫 → 抓取 → 正文提取 → 去重 → 候选载荷 → 搜索 Provider。
//!
//! 红线：
//! - 只允许 http/https；回环、内网、链路本地、保留地址与内部域名一律拒绝；
//!   重定向逐跳复检，最多 5 跳。
//! - 抓到的 HTML 只作为「未清洗」文本片段入库，不执行、不渲染。
//! - 失败必须带 code + 可读原因，由调用方逐条展示，不静默吞。
//! - 搜索失败与抓取失败分开表达，搜索配置不混进模型配置。

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::{ACCEPT, CONTENT_TYPE, LOCATION};
use reqwest::Url;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use crate::ai::{self, SearchConfig};
use crate::error::AppError;
use crate::sha256::{self, Sha256};

pub const MAX_REDIRECTS: usize = 5;
pub const MAX_HTML_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_STORED_HTML_BYTES: usize = 16 * 1024;
pub const MAX_TEXT_CHARS: usize = 8000;
pub const CONTENT_SIMILARITY_THRESHOLD: f64 = 0.85;
const MIN_TEXT_FOR_SIMILARITY: usize = 120;
const DEDUPE_SCAN_LIMIT: i64 = 100;
const SEARCH_TIMEOUT_MS: u64 = 20_000;

const ALLOWED_CONTENT_TYPES: [&str; 3] = ["text/html", "application/xhtml+xml", "text/plain"];
const INTERNAL_SUFFIXES: [&str; 9] = [
    ".local",
    ".localhost",
    ".internal",
    ".home.arpa",
    ".lan",
    ".corp",
    ".home",
    ".intranet",
    ".localdomain",
];

#[derive(Debug, Clone)]
pub struct FetchOptions {
    /// 仅测试使用：允许回环地址（生产入口固定传 false）
    pub allow_loopback: bool,
    pub timeout_ms: u64,
    pub max_html_bytes: usize,
}

impl Default for FetchOptions {
    fn default() -> Self {
        Self {
            allow_loopback: false,
            timeout_ms: 20_000,
            max_html_bytes: MAX_HTML_BYTES,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FetchedPage {
    pub requested_url: String,
    pub url: String,
    pub title: String,
    pub description: String,
    pub text: String,
    pub html_excerpt: String,
    pub html_bytes: usize,
    pub html_truncated: bool,
    pub status: u16,
    pub content_type: String,
    pub redirects: Vec<String>,
    pub fetched_at: String,
}

#[derive(Debug, Clone)]
pub struct SearchHit {
    pub url: String,
    /// 搜索结果自带的标题/摘要仅用于解析校验；候选内容一律以抓取到的页面为准
    #[allow(dead_code)]
    pub title: String,
    #[allow(dead_code)]
    pub snippet: String,
}

#[derive(Debug, Clone)]
pub enum DuplicateKind {
    Url { id: String, title: String, status: String },
    Content { id: String, title: String, similarity: f64 },
}

fn fetch_err(code: &str, message: impl Into<String>) -> AppError {
    AppError::Fetch {
        code: code.into(),
        message: message.into(),
    }
}

fn ai_to_fetch(err: AppError) -> AppError {
    match err {
        AppError::AiProvider { code, message } => AppError::Fetch { code, message },
        other => other,
    }
}

fn transport_error(err: &reqwest::Error) -> AppError {
    if err.is_timeout() {
        fetch_err("E_FETCH_TIMEOUT", "抓取超时，请稍后重试")
    } else if err.is_connect() {
        fetch_err("E_NETWORK", "无法连接到目标站点")
    } else {
        fetch_err("E_NETWORK", "网络请求失败，请检查网络或地址")
    }
}

/* ------------------------------- URL 守卫 ------------------------------- */

fn blocked_v4(ip: Ipv4Addr, allow_loopback: bool) -> bool {
    let o = ip.octets();
    if ip.is_loopback() {
        return !allow_loopback;
    }
    ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.is_multicast()
        || o[0] == 0
        || o[0] >= 240
        || (o[0] == 100 && (64..=127).contains(&o[1]))
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)
}

fn blocked_v6(ip: Ipv6Addr, allow_loopback: bool) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return blocked_v4(mapped, allow_loopback);
    }
    if ip.is_loopback() {
        return !allow_loopback;
    }
    let first = ip.segments()[0];
    ip.is_unspecified()
        || ip.is_multicast()
        || (first & 0xfe00) == 0xfc00
        || (first & 0xffc0) == 0xfe80
}

fn blocked_ip(ip: IpAddr, allow_loopback: bool) -> bool {
    match ip {
        IpAddr::V4(v4) => blocked_v4(v4, allow_loopback),
        IpAddr::V6(v6) => blocked_v6(v6, allow_loopback),
    }
}

fn blocked_hostname(host: &str, allow_loopback: bool) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host == "localhost" {
        return !allow_loopback;
    }
    INTERNAL_SUFFIXES
        .iter()
        .any(|suffix| host.ends_with(suffix))
}

/// 解析并校验 URL；每一跳（含重定向）都必须调用。
pub async fn validate_url(raw: &str, allow_loopback: bool) -> Result<Url, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(fetch_err("E_URL_INVALID", "网址为空"));
    }
    let url = Url::parse(trimmed).map_err(|_| fetch_err("E_URL_INVALID", "网址格式不合法"))?;

    match url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(fetch_err(
                "E_URL_SCHEME",
                format!("只允许抓取 http/https 页面（当前为 {other}）"),
            ))
        }
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(fetch_err("E_URL_INVALID", "网址不能包含用户名或密码"));
    }

    let host = url
        .host_str()
        .ok_or_else(|| fetch_err("E_URL_INVALID", "网址缺少主机名"))?;
    let host_bare = host.trim_start_matches('[').trim_end_matches(']');
    let host_lower = host_bare.to_ascii_lowercase();

    if let Ok(ip) = host_lower.parse::<IpAddr>() {
        if blocked_ip(ip, allow_loopback) {
            return Err(fetch_err(
                "E_URL_BLOCKED",
                format!("拒绝抓取内网或本地地址：{host_bare}"),
            ));
        }
        return Ok(url);
    }

    if blocked_hostname(&host_lower, allow_loopback) {
        return Err(fetch_err(
            "E_URL_BLOCKED",
            format!("拒绝抓取本地或内部域名：{host_bare}"),
        ));
    }

    let port = url.port_or_known_default().unwrap_or(80);
    let addrs = tokio::net::lookup_host((host_bare, port))
        .await
        .map_err(|_| fetch_err("E_NETWORK", format!("无法解析域名：{host_bare}")))?;
    let mut resolved = false;
    for addr in addrs {
        resolved = true;
        if blocked_ip(addr.ip(), allow_loopback) {
            return Err(fetch_err(
                "E_URL_BLOCKED",
                format!("域名 {host_bare} 解析到内网/本地地址，已拒绝"),
            ));
        }
    }
    if !resolved {
        return Err(fetch_err("E_NETWORK", format!("域名无法解析：{host_bare}")));
    }
    Ok(url)
}

/* -------------------------------- 抓取 --------------------------------- */

/// 抓取专用客户端：禁止 reqwest 自动跟随重定向，改由 fetch_page 逐跳校验。
fn build_fetch_client(timeout_ms: u64) -> Result<reqwest::Client, AppError> {
    ai::ensure_tls_provider();
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .user_agent("jiexu-interface/1.0.6")
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|err| fetch_err("E_NETWORK", format!("HTTP 客户端初始化失败：{err}")))
}

pub async fn fetch_page(raw_url: &str, options: &FetchOptions) -> Result<FetchedPage, AppError> {
    let client = build_fetch_client(options.timeout_ms)?;
    let requested_url = raw_url.trim().to_string();
    let mut current = validate_url(&requested_url, options.allow_loopback).await?;
    let mut redirects = Vec::new();
    let mut hops = 0usize;

    let response = loop {
        let response = client
            .get(current.clone())
            .header(
                ACCEPT,
                "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
            )
            .send()
            .await
            .map_err(|err| transport_error(&err))?;

        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| fetch_err("E_URL_REDIRECT", "重定向响应缺少 Location"))?;
            let next = current
                .join(location)
                .map_err(|_| fetch_err("E_URL_REDIRECT", format!("重定向地址无法解析：{location}")))?;
            let next = validate_url(next.as_str(), options.allow_loopback).await?;
            hops += 1;
            if hops > MAX_REDIRECTS {
                return Err(fetch_err(
                    "E_URL_REDIRECT",
                    format!("重定向超过 {MAX_REDIRECTS} 跳，已停止"),
                ));
            }
            redirects.push(next.to_string());
            current = next;
            continue;
        }
        break response;
    };

    let status = response.status();
    if !status.is_success() {
        return Err(fetch_err(
            "E_HTTP_STATUS",
            format!(
                "目标页面返回 HTTP {} {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            )
            .trim()
            .to_string(),
        ));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let main_type = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if !main_type.is_empty() && !ALLOWED_CONTENT_TYPES.contains(&main_type.as_str()) {
        return Err(fetch_err(
            "E_CONTENT_TYPE",
            format!("非网页内容（{main_type}），未保存"),
        ));
    }

    if let Some(length) = response.content_length() {
        if length as usize > options.max_html_bytes {
            return Err(fetch_err(
                "E_TOO_LARGE",
                format!("页面超过 {} KB，已放弃", options.max_html_bytes / 1024),
            ));
        }
    }

    let bytes = response.bytes().await.map_err(|err| transport_error(&err))?;
    if bytes.len() > options.max_html_bytes {
        return Err(fetch_err(
            "E_TOO_LARGE",
            format!("页面超过 {} KB，已放弃", options.max_html_bytes / 1024),
        ));
    }

    let html = String::from_utf8_lossy(&bytes).into_owned();
    let extracted = extract(&html);
    if extracted.text.chars().count() < 20 {
        return Err(fetch_err("E_EMPTY_CONTENT", "页面没有可提取的正文"));
    }

    let html_truncated = html.len() > MAX_STORED_HTML_BYTES;
    let html_excerpt = truncate_bytes(&html, MAX_STORED_HTML_BYTES).to_string();

    Ok(FetchedPage {
        requested_url,
        url: current.to_string(),
        title: extracted.title,
        description: extracted.description,
        text: extracted.text,
        html_excerpt,
        html_bytes: html.len(),
        html_truncated,
        status: status.as_u16(),
        content_type: main_type,
        redirects,
        fetched_at: now_iso_utc(),
    })
}

/* ------------------------------ 正文提取 ------------------------------- */

#[derive(Debug, Clone, Default)]
pub struct Extracted {
    pub title: String,
    pub description: String,
    pub text: String,
}

pub fn extract(html: &str) -> Extracted {
    let lower = html.to_ascii_lowercase();
    let cleaned = strip_blocks(html, &lower, &["script", "style", "noscript", "svg", "template"]);
    let cleaned_lower = cleaned.to_ascii_lowercase();

    let title = find_between(&cleaned, &cleaned_lower, "<title", "</title>")
        .map(clean_text)
        .unwrap_or_default();
    let description = find_meta_description(&cleaned, &cleaned_lower);

    let body = find_between(&cleaned, &cleaned_lower, "<main", "</main>")
        .or_else(|| find_between(&cleaned, &cleaned_lower, "<article", "</article>"))
        .or_else(|| find_between(&cleaned, &cleaned_lower, "<body", "</body>"))
        .unwrap_or(cleaned.as_str());

    let text = collapse_ws(&html_to_text(body));
    Extracted {
        title: title.chars().take(200).collect(),
        description: description.chars().take(400).collect(),
        text: text.chars().take(MAX_TEXT_CHARS).collect(),
    }
}

fn strip_blocks(input: &str, lower: &str, tags: &[&str]) -> String {
    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < input.len() {
        if lower[i..].starts_with("<!--") {
            if let Some(end) = lower[i..].find("-->") {
                i += end + 3;
                continue;
            }
        }
        if lower[i..].starts_with('<') {
            let mut matched = None;
            for tag in tags {
                let open = format!("<{tag}");
                if lower[i..].starts_with(&open) {
                    let next = lower[i + open.len()..].chars().next();
                    if matches!(next, Some(c) if c == '>' || c == '/' || c.is_whitespace()) {
                        matched = Some(*tag);
                        break;
                    }
                }
            }
            if let Some(tag) = matched {
                let close = format!("</{tag}");
                if let Some(rel) = lower[i..].find(&close) {
                    if let Some(gt) = lower[i + rel..].find('>') {
                        i += rel + gt + 1;
                        continue;
                    }
                }
                break;
            }
        }
        let ch = match input[i..].chars().next() {
            Some(ch) => ch,
            None => break,
        };
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn find_between<'a>(input: &'a str, lower: &str, open: &str, close: &str) -> Option<&'a str> {
    let start = lower.find(open)?;
    let start = lower[start..].find('>')? + start + 1;
    let end = lower[start..].find(close)?;
    Some(&input[start..start + end])
}

fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let pattern = format!("{attr}=");
    let index = lower.find(&pattern)?;
    let rest = tag[index + pattern.len()..].trim_start();
    let first = rest.chars().next()?;
    if first == '"' || first == '\'' {
        let inner = &rest[1..];
        let end = inner.find(first)?;
        Some(inner[..end].to_string())
    } else {
        let end = rest
            .find(|c: char| c.is_whitespace() || c == '>')
            .unwrap_or(rest.len());
        Some(rest[..end].to_string())
    }
}

fn find_meta_description(input: &str, lower: &str) -> String {
    let mut search = 0usize;
    while let Some(rel) = lower[search..].find("<meta") {
        let start = search + rel;
        let Some(gt) = lower[start..].find('>') else {
            break;
        };
        let end = start + gt;
        let tag = &input[start..end];
        let name = attr_value(tag, "name")
            .unwrap_or_default()
            .to_ascii_lowercase();
        let property = attr_value(tag, "property")
            .unwrap_or_default()
            .to_ascii_lowercase();
        if name == "description" || property == "og:description" || name == "twitter:description" {
            if let Some(content) = attr_value(tag, "content") {
                let text = collapse_ws(&decode_entities(&content));
                if !text.is_empty() {
                    return text;
                }
            }
        }
        search = end + 1;
    }
    String::new()
}

fn html_to_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    let mut quote: Option<char> = None;
    for ch in input.chars() {
        if in_tag {
            if let Some(q) = quote {
                if ch == q {
                    quote = None;
                }
            } else if ch == '"' || ch == '\'' {
                quote = Some(ch);
            } else if ch == '>' {
                in_tag = false;
                out.push(' ');
            }
        } else if ch == '<' {
            in_tag = true;
            quote = None;
        } else {
            out.push(ch);
        }
    }
    decode_entities(&out)
}

fn decode_entity(entity: &str) -> Option<String> {
    let named = match entity {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "nbsp" => " ",
        "mdash" => "—",
        "ndash" => "–",
        "hellip" => "…",
        "ldquo" => "“",
        "rdquo" => "”",
        "lsquo" => "‘",
        "rsquo" => "’",
        "middot" => "·",
        "bull" => "•",
        "copy" => "©",
        "reg" => "®",
        "trade" => "™",
        _ => {
            if let Some(hex) = entity
                .strip_prefix("#x")
                .or_else(|| entity.strip_prefix("#X"))
            {
                return u32::from_str_radix(hex, 16)
                    .ok()
                    .and_then(char::from_u32)
                    .map(String::from);
            }
            if let Some(dec) = entity.strip_prefix('#') {
                return dec.parse::<u32>().ok().and_then(char::from_u32).map(String::from);
            }
            return None;
        }
    };
    Some(named.to_string())
}

fn decode_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.char_indices().peekable();
    while let Some((index, ch)) = chars.next() {
        if ch != '&' {
            out.push(ch);
            continue;
        }
        let rest = &input[index + 1..];
        let Some(end) = rest.find(';') else {
            out.push(ch);
            continue;
        };
        if end == 0 || end > 12 {
            out.push(ch);
            continue;
        }
        if let Some(decoded) = decode_entity(&rest[..end]) {
            out.push_str(&decoded);
            for _ in 0..end + 1 {
                chars.next();
            }
        } else {
            out.push(ch);
        }
    }
    out
}

fn clean_text(input: &str) -> String {
    collapse_ws(&decode_entities(input))
}

fn collapse_ws(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_bytes(input: &str, max: usize) -> &str {
    if input.len() <= max {
        return input;
    }
    let mut end = max;
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1;
    }
    &input[..end]
}

/* -------------------------------- 去重 --------------------------------- */

pub fn url_key(raw: &str) -> String {
    match Url::parse(raw.trim()) {
        Ok(mut url) => {
            url.set_fragment(None);
            url.to_string()
        }
        Err(_) => raw.trim().to_string(),
    }
}

fn is_punctuation(ch: char) -> bool {
    ch.is_ascii_punctuation()
        || matches!(
            ch,
            '，' | '。'
                | '、'
                | '；'
                | '：'
                | '！'
                | '？'
                | '（'
                | '）'
                | '《'
                | '》'
                | '“'
                | '”'
                | '‘'
                | '’'
                | '—'
                | '…'
                | '·'
                | '「'
                | '」'
        )
}

fn normalize_text(input: &str) -> String {
    input
        .chars()
        .filter(|ch| !ch.is_whitespace() && !is_punctuation(*ch))
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

pub fn content_key(input: &str) -> String {
    let normalized = normalize_text(input);
    if normalized.is_empty() {
        return String::new();
    }
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    sha256::hex(&hasher.finalize())
}

pub fn bigrams(input: &str) -> HashSet<String> {
    let chars: Vec<char> = normalize_text(input).chars().collect();
    chars
        .windows(2)
        .map(|pair| pair.iter().collect::<String>())
        .collect()
}

pub fn similarity(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let intersection = a.intersection(b).count() as f64;
    let union = a.union(b).count() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

/// 同 URL 优先；否则与最近 100 条 url/search/ai 候选做内容近似比对。
pub async fn find_duplicate(
    pool: &SqlitePool,
    url: &str,
    text: &str,
) -> Result<Option<DuplicateKind>, AppError> {
    let key = url_key(url);
    let existing: Option<(String, String, String)> = sqlx::query_as(
        "SELECT id, title, status FROM candidates \
         WHERE status <> 'rejected' AND source_url = ?1 \
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&key)
    .fetch_optional(pool)
    .await?;
    if let Some((id, title, status)) = existing {
        return Ok(Some(DuplicateKind::Url { id, title, status }));
    }

    if normalize_text(text).chars().count() < MIN_TEXT_FOR_SIMILARITY {
        return Ok(None);
    }
    let new_key = content_key(text);
    let new_bigrams = bigrams(text);
    if new_bigrams.len() < 40 {
        return Ok(None);
    }

    let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT id, title, payload_json FROM candidates \
         WHERE status <> 'rejected' AND source IN ('url', 'search', 'ai') \
         ORDER BY created_at DESC LIMIT ?1",
    )
    .bind(DEDUPE_SCAN_LIMIT)
    .fetch_all(pool)
    .await?;

    for (id, title, payload) in rows {
        let Some(payload) = payload else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        let Some(previous) = value.get("contentText").and_then(|item| item.as_str()) else {
            continue;
        };
        if content_key(previous) == new_key {
            return Ok(Some(DuplicateKind::Content {
                id,
                title,
                similarity: 1.0,
            }));
        }
        if normalize_text(previous).chars().count() < MIN_TEXT_FOR_SIMILARITY {
            continue;
        }
        let score = similarity(&new_bigrams, &bigrams(previous));
        if score >= CONTENT_SIMILARITY_THRESHOLD {
            return Ok(Some(DuplicateKind::Content {
                id,
                title,
                similarity: score,
            }));
        }
    }
    Ok(None)
}

/// 候选 payload：HTML 明确标记为未清洗，任何渲染路径都不得直接执行。
pub fn build_payload(page: &FetchedPage) -> String {
    json!({
        "source": {
            "url": page.url,
            "requestedUrl": page.requested_url,
            "title": page.title,
            "status": page.status,
            "contentType": page.content_type,
            "redirects": page.redirects,
            "fetchedAt": page.fetched_at,
        },
        "html": {
            "state": "unclean",
            "needsCleaning": true,
            "excerpt": page.html_excerpt,
            "bytes": page.html_bytes,
            "truncated": page.html_truncated,
        },
        "contentText": page.text,
        "contentHash": content_key(&page.text),
    })
    .to_string()
}

/* ----------------------------- 搜索 Provider ---------------------------- */

pub fn parse_search_hits(provider: &str, body: &str) -> Result<Vec<SearchHit>, AppError> {
    let value: Value = serde_json::from_str(body)
        .map_err(|_| fetch_err("E_SEARCH_PARSE", "搜索服务返回的不是 JSON"))?;

    let array = match provider {
        "tavily" => value.get("results"),
        "brave" => value.get("web").and_then(|web| web.get("results")),
        "bing" => value.get("webPages").and_then(|pages| pages.get("value")),
        _ => value
            .get("results")
            .or_else(|| value.get("items"))
            .or_else(|| value.get("web").and_then(|web| web.get("results"))),
    }
    .and_then(|item| item.as_array());

    let Some(array) = array else {
        return Err(fetch_err(
            "E_SEARCH_PARSE",
            "无法识别搜索服务响应结构，请确认服务类型与地址",
        ));
    };

    let mut hits = Vec::new();
    let mut seen = HashSet::new();
    for item in array {
        let url = item
            .get("url")
            .or_else(|| item.get("link"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if url.is_empty() {
            continue;
        }
        let key = url_key(&url);
        if !seen.insert(key) {
            continue;
        }
        let title = item
            .get("title")
            .or_else(|| item.get("name"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let snippet = item
            .get("content")
            .or_else(|| item.get("description"))
            .or_else(|| item.get("snippet"))
            .or_else(|| item.get("summary"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        hits.push(SearchHit {
            url,
            title,
            snippet,
        });
    }
    Ok(hits)
}

fn with_query(base: &str, pairs: &[(&str, String)]) -> Result<Url, AppError> {
    let mut url = Url::parse(base).map_err(|_| fetch_err("E_URL_INVALID", "搜索服务地址不合法"))?;
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(key, value);
        }
    }
    Ok(url)
}

pub async fn search_web(
    cfg: &SearchConfig,
    key: Option<&str>,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchHit>, AppError> {
    let provider = cfg.provider_id.as_str();
    if !ai::SEARCH_PROVIDERS.contains(&provider) {
        return Err(fetch_err("E_SEARCH_PARSE", "未知的搜索服务类型"));
    }
    let query = query.trim();
    if query.is_empty() {
        return Err(fetch_err("E_URL_INVALID", "检索关键词为空"));
    }
    let base = cfg.base_url.trim();
    if base.is_empty() {
        return Err(fetch_err(
            "E_SEARCH_UNAVAILABLE",
            "搜索服务未配置：请先在设置里填写服务地址",
        ));
    }
    let parsed = Url::parse(base).map_err(|_| fetch_err("E_URL_INVALID", "搜索服务地址不合法"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(fetch_err("E_URL_SCHEME", "搜索服务地址只支持 http/https"));
    }
    if cfg.auth_mode != "none" && key.unwrap_or("").is_empty() {
        return Err(fetch_err(
            "E_SEARCH_UNAVAILABLE",
            format!("{provider} 搜索服务未配置 Key"),
        ));
    }

    let client = ai::build_client(SEARCH_TIMEOUT_MS).map_err(ai_to_fetch)?;
    let limit = limit.clamp(1, 10);

    let response = match provider {
        "tavily" => {
            let url = format!("{}/search", base.trim_end_matches('/'));
            let body = json!({
                "query": query,
                "max_results": limit,
                "search_depth": "basic",
                "include_answer": false,
            });
            let mut request = client.post(url).json(&body);
            if let Some(key) = key {
                request = request.bearer_auth(key);
            }
            request.send().await
        }
        "brave" => {
            let url = with_query(
                &format!("{}/res/v1/web/search", base.trim_end_matches('/')),
                &[("q", query.to_string()), ("count", limit.to_string())],
            )?;
            let mut request = client.get(url);
            if let Some(key) = key {
                request = request.header("X-Subscription-Token", key);
            }
            request.send().await
        }
        "bing" => {
            let url = with_query(
                &format!("{}/v7.0/search", base.trim_end_matches('/')),
                &[("q", query.to_string()), ("count", limit.to_string())],
            )?;
            let mut request = client.get(url);
            if let Some(key) = key {
                request = request.header("Ocp-Apim-Subscription-Key", key);
            }
            request.send().await
        }
        _ => {
            let url = with_query(
                base,
                &[("q", query.to_string()), ("limit", limit.to_string())],
            )?;
            let mut request = client.get(url);
            if let Some(key) = key {
                request = request.bearer_auth(key);
            }
            request.send().await
        }
    }
    .map_err(|err| transport_error(&err))?;

    let raw = ai::consume(response).await.map_err(ai_to_fetch)?;
    if !(200..300).contains(&raw.status) {
        let (code, message) = ai::classify_status(raw.status, &raw.body);
        return Err(AppError::Fetch {
            code,
            message: format!("{message}（搜索服务 HTTP {}）", raw.status),
        });
    }
    let mut hits = parse_search_hits(provider, &raw.body)?;
    hits.truncate(limit);
    Ok(hits)
}

/* -------------------------------- 时间 --------------------------------- */

fn now_iso_utc() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = seconds.div_euclid(86_400);
    let rem = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year,
        month,
        day,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(err: &AppError) -> &str {
        match err {
            AppError::Fetch { code, .. } => code,
            _ => "OTHER",
        }
    }

    #[tokio::test]
    async fn guard_accepts_public_https_and_blocks_dangerous_targets() {
        assert!(validate_url("https://93.184.216.34/article", false)
            .await
            .is_ok());
        for raw in [
            "ftp://example.com/file",
            "javascript:alert(1)",
            "https://user:pass@example.com/",
            "http://localhost:8080/",
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://172.16.1.1/",
            "http://192.168.1.1/",
            "http://169.254.1.1/",
            "http://[::1]/",
            "http://intranet.home/",
            "http://metadata.google.internal/",
        ] {
            let err = validate_url(raw, false).await.expect_err(raw);
            assert!(
                matches!(code(&err), "E_URL_BLOCKED" | "E_URL_SCHEME" | "E_URL_INVALID"),
                "{raw} => {err:?}"
            );
        }
    }

    #[tokio::test]
    async fn guard_allows_loopback_only_in_test_mode() {
        assert!(validate_url("http://127.0.0.1:9/", true).await.is_ok());
        assert!(validate_url("http://localhost:9/", true).await.is_ok());
        assert_eq!(
            code(&validate_url("http://127.0.0.1:9/", false).await.unwrap_err()),
            "E_URL_BLOCKED"
        );
    }

    /// 起一个只回 302 的本地服务器：路径数字逐次 +1，达到 `switch_at` 后改指向 `switch_to`。
    fn spawn_redirect_server(
        connections: usize,
        switch_at: u32,
        switch_to: &'static str,
    ) -> (String, std::thread::JoinHandle<()>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("绑定本地端口");
        let addr = listener.local_addr().expect("读取本地地址");
        let handle = std::thread::spawn(move || {
            for _ in 0..connections {
                let Ok((mut stream, _)) = listener.accept() else {
                    break;
                };
                let mut buf = [0u8; 2048];
                let _ = stream.read(&mut buf);
                let request = String::from_utf8_lossy(&buf);
                let path = request.split_whitespace().nth(1).unwrap_or("/").to_string();
                let hop: u32 = path
                    .trim_start_matches('/')
                    .split('?')
                    .next()
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0);
                let location = if hop >= switch_at {
                    switch_to.to_string()
                } else {
                    format!("/{}", hop + 1)
                };
                let response = format!(
                    "HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        (format!("http://{addr}/0"), handle)
    }

    #[tokio::test]
    async fn redirect_to_private_address_is_blocked_hop_by_hop() {
        let (url, handle) = spawn_redirect_server(1, 0, "http://10.0.0.1/secret");
        let options = FetchOptions {
            allow_loopback: true,
            ..Default::default()
        };
        let err = fetch_page(&url, &options).await.expect_err("应被拦截");
        assert_eq!(code(&err), "E_URL_BLOCKED");
        handle.join().expect("测试服务器应正常退出");
    }

    #[tokio::test]
    async fn redirect_chain_over_five_hops_is_rejected() {
        // 初始 /0 起连续 302 到 /1…/5，第 6 次跳转即超过 5 跳上限
        let (url, handle) = spawn_redirect_server(6, u32::MAX, "");
        let options = FetchOptions {
            allow_loopback: true,
            ..Default::default()
        };
        let err = fetch_page(&url, &options).await.expect_err("应超限");
        assert_eq!(code(&err), "E_URL_REDIRECT");
        handle.join().expect("测试服务器应正常退出");
    }

    /// 需公网，默认忽略：`cargo test --lib -- --ignored fetches_real_public_page`
    #[tokio::test]
    #[ignore = "需要公网访问"]
    async fn fetches_real_public_page() {
        let page = fetch_page("https://example.com", &FetchOptions::default())
            .await
            .expect("公开页面应抓取成功");
        assert_eq!(page.status, 200);
        assert!(page.title.to_lowercase().contains("example"), "标题应提取成功：{:?}", page.title);
        assert!(!page.text.trim().is_empty(), "正文不应为空");
        assert_eq!(page.redirects.len(), 0);
    }

    #[test]
    fn extract_removes_scripts_and_decodes_entities() {
        let html = r#"
            <html><head><title>界序 &amp; 案例</title>
            <meta name="description" content="一个用于测试的描述 &quot;说明&quot;">
            <style>.x{color:red}</style><script>alert('x')</script></head>
            <body><main><h1>标题</h1><p>第一段&nbsp;正文</p><p>第二段</p></main></body></html>
        "#;
        let extracted = extract(html);
        assert_eq!(extracted.title, "界序 & 案例");
        assert!(extracted.description.contains("一个用于测试的描述"));
        assert!(extracted.text.contains("第一段 正文"));
        assert!(!extracted.text.contains("alert"));
        assert!(!extracted.text.contains("color:red"));
    }

    #[test]
    fn content_similarity_detects_near_duplicates() {
        let base = "这是一个用于测试内容近似去重的长文本，包含界面排版、动效节奏、交互反馈与信息层级的描述。\
为了验证字符二元组的重合度，这里刻意写得足够长，并且在末尾补充一些不重复的句子：\
玻璃质感、留白比例、字体层级、过渡曲线、错误提示、空状态、加载态、深色模式、键盘可达性。";
        let same = base.replace("测试", "检验").replace("长文本", "长篇幅");
        let other = "另一段完全不同的正文，谈论数据库迁移、命令行参数、安装包签名与版本发布流程。\
内容之间只有少量通用虚词重合，因此不应被判为近似重复，即使长度接近也不行。";
        let base_grams = bigrams(base);
        assert!(similarity(&base_grams, &bigrams(&same)) >= CONTENT_SIMILARITY_THRESHOLD);
        assert!(similarity(&base_grams, &bigrams(other)) < CONTENT_SIMILARITY_THRESHOLD);
        assert_eq!(content_key(base), content_key(&format!("  {base}  ")));
    }

    #[test]
    fn url_key_normalizes_fragment_and_case() {
        assert_eq!(
            url_key("HTTPS://Example.com/A?b=1#top"),
            "https://example.com/A?b=1"
        );
    }

    #[test]
    fn search_hit_parsers_match_three_provider_shapes() {
        let tavily = r#"{"results":[{"url":"https://a.test/1","title":"A","content":"摘要 A"}]}"#;
        let brave = r#"{"web":{"results":[{"url":"https://b.test/2","title":"B","description":"摘要 B"}]}}"#;
        let bing = r#"{"webPages":{"value":[{"url":"https://c.test/3","name":"C","snippet":"摘要 C"}]}}"#;

        let hits = parse_search_hits("tavily", tavily).unwrap();
        assert_eq!(hits[0].url, "https://a.test/1");
        assert_eq!(hits[0].snippet, "摘要 A");

        let hits = parse_search_hits("brave", brave).unwrap();
        assert_eq!(hits[0].title, "B");

        let hits = parse_search_hits("bing", bing).unwrap();
        assert_eq!(hits[0].snippet, "摘要 C");

        assert_eq!(
            code(&parse_search_hits("tavily", "{\"error\":\"x\"}").unwrap_err()),
            "E_SEARCH_PARSE"
        );
    }

    #[test]
    fn payload_marks_html_as_unclean() {
        let page = FetchedPage {
            requested_url: "https://example.com/".into(),
            url: "https://example.com/".into(),
            title: "示例".into(),
            description: String::new(),
            text: "正文".into(),
            html_excerpt: "<p>正文</p>".into(),
            html_bytes: 12,
            html_truncated: false,
            status: 200,
            content_type: "text/html".into(),
            redirects: vec![],
            fetched_at: "2026-11-09T00:00:00Z".into(),
        };
        let payload: Value = serde_json::from_str(&build_payload(&page)).unwrap();
        assert_eq!(payload["html"]["state"], "unclean");
        assert_eq!(payload["html"]["needsCleaning"], true);
        assert_eq!(payload["contentText"], "正文");
    }
}
