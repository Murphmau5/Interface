//! HTML 预览沙箱（第 2、3 层）。
//!
//! 硬边界：
//! - 预览窗口 label = `preview-html`，不在任何 capability 里 → 拿不到 IPC；
//! - 内容经自定义协议 `preview://` 提供，Windows 下实际源是 `http://preview.localhost`；
//! - 内容页再套一层 `sandbox="allow-scripts"` 的 iframe，永不加 `allow-same-origin`；
//! - CSP 全部使用显式协议源，不写 `'self'`（opaque origin 下 `'self'` 匹配不到任何源）。

use std::borrow::Cow;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager, State, UriSchemeContext, WebviewUrl, WebviewWindowBuilder};

use crate::db::Db;
use crate::error::AppError;

pub const PREVIEW_WINDOW_LABEL: &str = "preview-html";
pub const PREVIEW_ORIGIN: &str = "http://preview.localhost";
const PREVIEW_DIR: &str = "previews/v1";
const SANITIZED_EXT: &str = "html";

/// 宿主页 CSP：只允许内联样式（页面自身的布局）、data: 图片与同协议 iframe。
pub const HOST_CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; \
frame-src http://preview.localhost; script-src 'none'; connect-src 'none'; \
base-uri 'none'; form-action 'none'; object-src 'none'";

/// 内容页 CSP：脚本一律不执行；样式/图片只允许内联与本协议源。
pub const CONTENT_CSP: &str = "default-src 'none'; style-src 'unsafe-inline' http://preview.localhost; \
img-src data: http://preview.localhost; font-src data: http://preview.localhost; \
script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; \
base-uri 'none'; object-src 'none'";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewHandle {
    pub label: String,
    pub url: String,
}

/// 注册 `preview://` 处理器。只接受 `<64 hex>/p|/c` 形式，其余一律 404，避免路径穿越。
pub fn register(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.register_uri_scheme_protocol("preview", |ctx, request| {
        serve(ctx, &request)
    })
}

fn serve(
    ctx: UriSchemeContext<'_, tauri::Wry>,
    request: &Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let path = request.uri().path();
    let Some((kind, digest)) = parse_preview_path(path) else {
        return plain(StatusCode::NOT_FOUND, "预览地址无效");
    };

    let data_dir = match ctx.app_handle().try_state::<Db>() {
        Some(db) => db.data_dir.clone(),
        None => return plain(StatusCode::INTERNAL_SERVER_ERROR, "数据目录未就绪"),
    };

    let absolute = sanitized_path(&data_dir, &digest);
    let html = match std::fs::read_to_string(&absolute) {
        Ok(html) => html,
        Err(_) => return plain(StatusCode::NOT_FOUND, "预览副本不存在，请重新清洗"),
    };

    match kind {
        RouteKind::Host => html_response(host_page(&digest), HOST_CSP),
        RouteKind::Content => html_response(html, CONTENT_CSP),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RouteKind {
    Host,
    Content,
}

fn parse_preview_path(path: &str) -> Option<(RouteKind, String)> {
    let mut segments = path.trim_start_matches('/').split('/');
    let first = segments.next()?;
    let second = segments.next()?;
    if segments.next().is_some() {
        return None;
    }
    let kind = match first {
        "p" => RouteKind::Host,
        "c" => RouteKind::Content,
        _ => return None,
    };
    if !is_sha256_hex(second) {
        return None;
    }
    Some((kind, second.to_string()))
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// 只拼接固定目录 + 已校验的 hex 文件名，不接受任何调用方路径片段。
fn sanitized_path(data_dir: &Path, digest: &str) -> PathBuf {
    data_dir
        .join(PREVIEW_DIR)
        .join(format!("{digest}.{SANITIZED_EXT}"))
}

fn plain(status: StatusCode, message: &str) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Content-Security-Policy", "default-src 'none'")
        .body(Cow::Owned(message.as_bytes().to_vec()))
        .unwrap_or_else(|_| Response::new(Cow::Owned(Vec::<u8>::new())))
}

fn html_response(body: String, csp: &str) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Security-Policy", csp)
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header("Cache-Control", "no-store")
        .body(Cow::Owned(body.into_bytes()))
        .unwrap_or_else(|_| Response::new(Cow::Owned(Vec::<u8>::new())))
}

/// 宿主页：无脚本、无外部资源，iframe 只带 `allow-scripts`。
fn host_page(digest: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>预览沙箱</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #0b0c0e; }}
  body {{ display: flex; flex-direction: column; }}
  header {{
    flex: 0 0 auto; height: 32px; display: flex; align-items: center; gap: 10px;
    padding: 0 12px; border-bottom: 1px solid #23262b;
    font: 12px/1 system-ui, "Microsoft YaHei", sans-serif; color: #9aa0a6;
  }}
  header b {{ font-weight: 600; color: #d7dadd; letter-spacing: .02em; }}
  header .meta {{ margin-left: auto; font-variant-numeric: tabular-nums; }}
  main {{ position: relative; flex: 1 1 auto; min-height: 0; }}
  iframe {{ position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }}
</style>
</head>
<body>
<header><b>预览沙箱</b><span>只读 · 无 IPC · 脚本已清洗</span><span class="meta">隔离窗口</span></header>
<main>
<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" src="/c/{digest}"></iframe>
</main>
</body>
</html>"#
    )
}

/// 打开（或复用）独立预览窗口。只有 `sanitize_state = cleaned` 的素材允许进入。
#[tauri::command]
pub async fn preview_open_html(
    app: AppHandle,
    db: State<'_, Db>,
    asset_id: String,
) -> Result<PreviewHandle, AppError> {
    let row: Option<(String, String, Option<String>, String)> = sqlx::query_as(
        "SELECT sanitize_state, sha256, sanitized_rel_path, original_name FROM assets WHERE id = ?1",
    )
    .bind(&asset_id)
    .fetch_optional(&db.pool)
    .await?;

    let (state, sha256, rel_path, original_name) =
        row.ok_or_else(|| AppError::NotFound("素材不存在".into()))?;

    if state != "cleaned" {
        return Err(AppError::InvalidInput(
            "该 HTML 尚未通过清洗，不能进入预览".into(),
        ));
    }
    let rel_path = rel_path.ok_or_else(|| AppError::InvalidInput("缺少清洗副本路径".into()))?;
    if !is_safe_rel_path(&rel_path) {
        return Err(AppError::InvalidInput("清洗副本路径非法".into()));
    }
    if !db.data_dir.join(&rel_path).is_file() {
        return Err(AppError::InvalidInput("清洗副本不存在，请重新清洗".into()));
    }

    let url = format!("{PREVIEW_ORIGIN}/p/{sha256}");
    let parsed = url
        .parse::<tauri::Url>()
        .map_err(|_| AppError::InvalidInput("预览地址生成失败".into()))?;

    if let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        window
            .navigate(parsed)
            .map_err(|err| AppError::InvalidInput(format!("预览窗口跳转失败：{err}")))?;
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(PreviewHandle {
            label: PREVIEW_WINDOW_LABEL.to_string(),
            url,
        });
    }

    WebviewWindowBuilder::new(&app, PREVIEW_WINDOW_LABEL, WebviewUrl::External(parsed))
        .title(format!("预览 · {original_name}"))
        .inner_size(980.0, 720.0)
        .min_inner_size(720.0, 480.0)
        .center()
        .build()
        .map_err(|err| AppError::InvalidInput(format!("创建预览窗口失败：{err}")))?;

    Ok(PreviewHandle {
        label: PREVIEW_WINDOW_LABEL.to_string(),
        url,
    })
}

/// 只允许 `previews/v1/<hex>.html` 这样的相对路径，防止被篡改的 DB 值指到别处。
fn is_safe_rel_path(rel_path: &str) -> bool {
    let path = Path::new(rel_path);
    let components: Vec<Component<'_>> = path.components().collect();
    if components.len() != 3 {
        return false;
    }
    let normalized = components
        .iter()
        .map(|component| match component {
            Component::Normal(value) => value.to_string_lossy().into_owned(),
            _ => String::new(),
        })
        .collect::<Vec<_>>();
    normalized[0] == "previews"
        && normalized[1] == "v1"
        && normalized[2].strip_suffix(".html").is_some_and(is_sha256_hex)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIGEST: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn accepts_only_known_routes() {
        assert_eq!(
            parse_preview_path(&format!("/p/{DIGEST}")),
            Some((RouteKind::Host, DIGEST.to_string()))
        );
        assert_eq!(
            parse_preview_path(&format!("/c/{DIGEST}")),
            Some((RouteKind::Content, DIGEST.to_string()))
        );
        assert!(parse_preview_path("/p/../../app.db").is_none());
        assert!(parse_preview_path(&format!("/x/{DIGEST}")).is_none());
        assert!(parse_preview_path(&format!("/p/{DIGEST}/extra")).is_none());
        assert!(parse_preview_path("/p/short").is_none());
    }

    #[test]
    fn validates_sanitized_relative_path() {
        assert!(is_safe_rel_path(&format!("previews/v1/{DIGEST}.html")));
        assert!(!is_safe_rel_path(&format!("previews/v1/../{DIGEST}.html")));
        assert!(!is_safe_rel_path(&format!("previews/v1/{DIGEST}.css")));
        assert!(!is_safe_rel_path("/absolute/v1/x.html"));
        assert!(!is_safe_rel_path(&format!("previews/v2/{DIGEST}.html")));
    }

    #[test]
    fn csp_never_uses_self() {
        assert!(!HOST_CSP.contains("'self'"));
        assert!(!CONTENT_CSP.contains("'self'"));
        assert!(HOST_CSP.contains(PREVIEW_ORIGIN));
        assert!(CONTENT_CSP.contains(PREVIEW_ORIGIN));
        assert!(CONTENT_CSP.contains("script-src 'none'"));
    }

    #[test]
    fn host_page_keeps_sandbox_without_same_origin() {
        let page = host_page(DIGEST);
        assert!(page.contains(r#"sandbox="allow-scripts""#));
        assert!(!page.to_ascii_lowercase().contains("allow-same-origin"));
        assert!(!page.to_ascii_lowercase().contains("<script"));
    }
}
