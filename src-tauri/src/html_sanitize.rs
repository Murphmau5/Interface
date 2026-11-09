//! 导入 HTML 的白名单清洗器。
//!
//! 设计口径：
//! - 只做「白名单序列化」：认识的标签/属性才输出，其余一律丢弃并记录原因；
//! - 不追求成为完整 HTML5 解析器，但保证任何输入都不会产出可执行脚本；
//! - 不可清洗的输入（超限、非 UTF-8、含 NUL）显式 rejected，并逐条给出原因；
//! - CSS 侧剥 `@import`、外链 `url()`、`expression()`、`javascript:`、`behavior`、
//!   `-moz-binding`，并禁掉 `position: fixed/sticky` 以防止覆盖层诱导点击。

use serde::Serialize;

/// 单个 HTML 文件上限 2 MB；超过即拒绝，不做截断（截断可能改变结构含义）。
pub const MAX_INPUT_BYTES: usize = 2 * 1024 * 1024;
/// 输出上限；正常输入不会触达，用于防御实体展开类膨胀。
const MAX_OUTPUT_BYTES: usize = 4 * 1024 * 1024;
/// 原因列表上限，避免恶意文件把报告撑爆。
const MAX_ISSUES: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SanitizeState {
    Cleaned,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeIssue {
    pub kind: String,
    pub message: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeReport {
    pub state: SanitizeState,
    pub bytes_in: usize,
    pub bytes_out: usize,
    pub removed_tags: usize,
    pub removed_attributes: usize,
    pub removed_urls: usize,
    pub issues: Vec<SanitizeIssue>,
    pub issues_truncated: bool,
}

#[derive(Debug, Clone)]
pub struct SanitizedHtml {
    pub html: String,
    pub report: SanitizeReport,
}

const ALLOWED_TAGS: &[&str] = &[
    "html", "head", "body", "div", "span", "p", "a", "section", "article", "header", "footer",
    "main", "nav", "aside", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "ul",
    "ol", "li", "dl", "dt", "dd", "blockquote", "q", "cite", "pre", "code", "kbd", "samp", "var",
    "mark", "small", "strong", "em", "b", "i", "u", "s", "del", "ins", "sub", "sup", "br", "hr",
    "img", "button", "input", "select", "option", "optgroup", "label", "fieldset", "legend",
    "table", "caption", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col", "details",
    "summary", "progress", "meter", "time", "output", "wbr", "abbr", "style",
];

const VOID_TAGS: &[&str] = &["br", "hr", "img", "input", "col", "wbr"];

/// 连同内容一起丢弃的标签：其中多为原始文本容器或可执行/可嵌入内容。
const DROP_WITH_CONTENT: &[&str] = &[
    "script", "iframe", "object", "embed", "applet", "frame", "frameset", "svg", "math",
    "template", "noscript", "noembed", "noframes", "xmp", "plaintext", "textarea", "title",
    "canvas", "audio", "video",
];

const VOID_DROP_TAGS: &[&str] = &["meta", "link", "base"];

const ALLOWED_ATTRS: &[&str] = &[
    "class", "id", "style", "title", "lang", "dir", "role", "alt", "src", "href", "width",
    "height", "colspan", "rowspan", "type", "value", "placeholder", "disabled", "checked",
    "selected", "for", "name", "min", "max", "step", "open", "aria-label", "aria-hidden",
    "aria-expanded", "aria-pressed", "aria-checked", "aria-disabled", "aria-live", "aria-valuenow",
    "aria-valuemin", "aria-valuemax",
];

struct Sanitizer<'a> {
    src: &'a str,
    out: String,
    report: SanitizeReport,
}

impl<'a> Sanitizer<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            out: String::with_capacity(src.len()),
            report: SanitizeReport {
                state: SanitizeState::Cleaned,
                bytes_in: src.len(),
                bytes_out: 0,
                removed_tags: 0,
                removed_attributes: 0,
                removed_urls: 0,
                issues: Vec::new(),
                issues_truncated: false,
            },
        }
    }

    fn line_of(&self, offset: usize) -> usize {
        self.src.as_bytes()[..offset.min(self.src.len())]
            .iter()
            .filter(|byte| **byte == b'\n')
            .count()
            + 1
    }

    fn issue(&mut self, kind: &str, message: String, offset: usize) {
        if self.report.issues.len() >= MAX_ISSUES {
            self.report.issues_truncated = true;
            return;
        }
        let line = self.line_of(offset);
        self.report.issues.push(SanitizeIssue {
            kind: kind.to_string(),
            message,
            line,
        });
    }

    fn run(mut self) -> SanitizedHtml {
        let mut i = 0usize;
        let len = self.src.len();
        let bytes = self.src.as_bytes();

        while i < len {
            if bytes[i] != b'<' {
                let next = find_byte(bytes, i, b'<').unwrap_or(len);
                self.out.push_str(&self.src[i..next]);
                i = next;
                continue;
            }

            let rest = &self.src[i..];

            if rest.starts_with("<!--") {
                match find_case_insensitive(self.src, "-->", i + 4) {
                    Some(end) => i = end + 3,
                    None => i = len,
                }
                continue;
            }

            if rest.starts_with("<!") || rest.starts_with("<?") {
                match find_byte(bytes, i + 2, b'>') {
                    Some(end) => i = end + 1,
                    None => i = len,
                }
                continue;
            }

            let Some(tag_end) = find_tag_end(bytes, i) else {
                self.out.push_str("&lt;");
                i += 1;
                continue;
            };

            let Some(tag) = parse_tag(&self.src[i..=tag_end], i) else {
                self.out.push_str("&lt;");
                i += 1;
                continue;
            };

            if tag.closing {
                if is_allowed_tag(&tag.name) && !is_void(&tag.name) && tag.name != "style" {
                    self.out.push_str("</");
                    self.out.push_str(&tag.name);
                    self.out.push('>');
                }
                i = tag_end + 1;
                continue;
            }

            if tag.name == "style" {
                let content_start = tag_end + 1;
                let (css, after) = match find_closing(self.src, content_start, "style") {
                    Some(close_start) => (&self.src[content_start..close_start], close_after_close_tag(self.src, close_start)),
                    None => (&self.src[content_start..], len),
                };
                let line = self.line_of(content_start);
                let cleaned = sanitize_css(css, line, &mut self.report);
                self.out.push_str("<style>");
                self.out.push_str(&cleaned);
                self.out.push_str("</style>");
                i = after;
                continue;
            }

            if is_drop_with_content(&tag.name) {
                self.report.removed_tags += 1;
                self.issue(
                    "removed-tag",
                    format!("移除 <{}> 及其内容（脚本、嵌入或原始文本容器不允许）", tag.name),
                    i,
                );
                if tag.name == "embed" || tag.name == "frame" {
                    i = tag_end + 1;
                } else {
                    i = match find_closing(self.src, tag_end + 1, &tag.name) {
                        Some(close_start) => close_after_close_tag(self.src, close_start),
                        None => len,
                    };
                }
                continue;
            }

            if is_void_drop(&tag.name) {
                self.report.removed_tags += 1;
                self.issue(
                    "removed-tag",
                    format!("移除 <{}>（外部资源/文档元信息标签不在白名单）", tag.name),
                    i,
                );
                i = tag_end + 1;
                continue;
            }

            if !is_allowed_tag(&tag.name) {
                self.report.removed_tags += 1;
                self.issue(
                    "unknown-tag",
                    format!("移除 <{}> 标签（不在白名单，内部内容保留）", tag.name),
                    i,
                );
                i = tag_end + 1;
                continue;
            }

            self.write_open_tag(&tag, i, tag_end);
            i = tag_end + 1;
        }

        self.report.bytes_out = self.out.len();
        if self.out.len() > MAX_OUTPUT_BYTES {
            return rejected(self.src.len(), "清洗结果超过 4 MB 上限，已拒绝");
        }
        SanitizedHtml {
            html: self.out,
            report: self.report,
        }
    }

    fn write_open_tag(&mut self, tag: &ParsedTag, offset: usize, _tag_end: usize) {
        let mut kept: Vec<(String, String)> = Vec::with_capacity(tag.attrs.len());

        for (name, value) in &tag.attrs {
            if name.starts_with("on") {
                self.report.removed_attributes += 1;
                self.issue(
                    "event-attr",
                    format!("移除 <{}> 的事件属性 {}（内联事件处理器不允许）", tag.name, name),
                    offset,
                );
                continue;
            }
            if name == "srcdoc" {
                self.report.removed_attributes += 1;
                self.issue("event-attr", "移除 srcdoc（内嵌文档不允许）".into(), offset);
                continue;
            }
            if !is_allowed_attr(name) {
                self.report.removed_attributes += 1;
                self.issue(
                    "unknown-attr",
                    format!("移除 <{}> 的属性 {}（不在白名单）", tag.name, name),
                    offset,
                );
                continue;
            }

            if name == "style" {
                let line = self.line_of(offset);
                let cleaned = sanitize_css(value, line, &mut self.report);
                if cleaned.trim().is_empty() {
                    self.report.removed_attributes += 1;
                    continue;
                }
                kept.push((name.clone(), cleaned));
                continue;
            }

            if name == "src" || name == "href" {
                if let Some(reason) = url_rejection(name, value) {
                    self.report.removed_attributes += 1;
                    self.report.removed_urls += 1;
                    self.issue(
                        "unsafe-url",
                        format!("移除 <{}> 的 {}（{}）", tag.name, name, reason),
                        offset,
                    );
                    continue;
                }
            }

            let value = if name == "src" || name == "href" {
                normalize_url_text(value)
            } else {
                value.clone()
            };
            kept.push((name.clone(), value));
        }

        self.out.push('<');
        self.out.push_str(&tag.name);
        for (name, value) in kept {
            self.out.push(' ');
            self.out.push_str(&name);
            self.out.push_str("=\"");
            self.out.push_str(&escape_attr(&value));
            self.out.push('"');
        }
        self.out.push('>');
    }
}

fn rejected(bytes_in: usize, reason: &str) -> SanitizedHtml {
    SanitizedHtml {
        html: String::new(),
        report: SanitizeReport {
            state: SanitizeState::Rejected,
            bytes_in,
            bytes_out: 0,
            removed_tags: 0,
            removed_attributes: 0,
            removed_urls: 0,
            issues: vec![SanitizeIssue {
                kind: "rejected".into(),
                message: reason.to_string(),
                line: 1,
            }],
            issues_truncated: false,
        },
    }
}

/// 入口：按字节清洗。非 UTF-8 直接 rejected，不做有损解码（避免绕过白名单）。
pub fn sanitize_bytes(input: &[u8]) -> SanitizedHtml {
    match std::str::from_utf8(input) {
        Ok(text) => sanitize_html(text),
        Err(err) => rejected(
            input.len(),
            &format!("文件不是 UTF-8 文本（首个非法字节偏移 {}）", err.valid_up_to()),
        ),
    }
}

/// 入口：清洗一段 HTML 文本。不可清洗时返回 rejected 报告（html 为空）。
pub fn sanitize_html(input: &str) -> SanitizedHtml {
    if input.len() > MAX_INPUT_BYTES {
        return rejected(
            input.len(),
            &format!(
                "文件 {} KB，超过 {} KB 清洗上限",
                input.len() / 1024,
                MAX_INPUT_BYTES / 1024
            ),
        );
    }
    if input.contains('\0') {
        return rejected(input.len(), "文件包含 NUL 字节，无法作为文本清洗");
    }
    let stripped = input.strip_prefix('\u{feff}').unwrap_or(input);
    Sanitizer::new(stripped).run()
}

// ---------- 标签解析 ----------

struct ParsedTag {
    closing: bool,
    name: String,
    attrs: Vec<(String, String)>,
    #[allow(dead_code)]
    self_closing: bool,
}

fn parse_tag(raw: &str, base_offset: usize) -> Option<ParsedTag> {
    let bytes = raw.as_bytes();
    let len = bytes.len();
    if len < 3 || bytes[0] != b'<' || bytes[len - 1] != b'>' {
        return None;
    }

    let mut i = 1usize;
    while i < len && bytes[i].is_ascii_whitespace() {
        i += 1;
    }

    let closing = if i < len && bytes[i] == b'/' {
        i += 1;
        true
    } else {
        false
    };

    let name_start = i;
    while i < len && is_tag_name_byte(bytes[i]) {
        i += 1;
    }
    if i == name_start {
        return None;
    }
    let name = raw[name_start..i].to_ascii_lowercase();

    let mut attrs: Vec<(String, String)> = Vec::new();
    let mut self_closing = false;

    while i < len {
        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= len || bytes[i] == b'>' {
            break;
        }
        if bytes[i] == b'/' {
            self_closing = true;
            i += 1;
            continue;
        }

        let attr_start = i;
        while i < len && !bytes[i].is_ascii_whitespace() && bytes[i] != b'=' && bytes[i] != b'>' && bytes[i] != b'/' {
            i += 1;
        }
        if attr_start == i {
            i += 1;
            continue;
        }
        let attr_name = raw[attr_start..i].to_ascii_lowercase();

        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }

        let mut value = String::new();
        if i < len && bytes[i] == b'=' {
            i += 1;
            while i < len && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i < len && (bytes[i] == b'"' || bytes[i] == b'\'') {
                let quote = bytes[i];
                i += 1;
                let value_start = i;
                while i < len && bytes[i] != quote {
                    i += 1;
                }
                value = raw[value_start..i].to_string();
                if i < len {
                    i += 1;
                }
            } else {
                let value_start = i;
                while i < len && !bytes[i].is_ascii_whitespace() && bytes[i] != b'>' {
                    i += 1;
                }
                value = raw[value_start..i].to_string();
            }
        }

        if !attrs.iter().any(|(existing, _)| *existing == attr_name) {
            attrs.push((attr_name, value));
        }
    }

    let _ = base_offset;
    Some(ParsedTag {
        closing,
        name,
        attrs,
        self_closing,
    })
}

fn is_tag_name_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'-' || byte == b':' || byte == b'_'
}

fn find_tag_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start + 1;
    let mut quote: u8 = 0;
    while i < bytes.len() {
        let byte = bytes[i];
        if quote != 0 {
            if byte == quote {
                quote = 0;
            }
        } else if byte == b'"' || byte == b'\'' {
            quote = byte;
        } else if byte == b'>' {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn find_byte(bytes: &[u8], from: usize, target: u8) -> Option<usize> {
    bytes
        .iter()
        .enumerate()
        .skip(from)
        .find(|(_, byte)| **byte == target)
        .map(|(index, _)| index)
}

fn find_case_insensitive(haystack: &str, needle: &str, from: usize) -> Option<usize> {
    if from > haystack.len() {
        return None;
    }
    let lower = haystack[from..].to_ascii_lowercase();
    lower.find(&needle.to_ascii_lowercase()).map(|index| from + index)
}

/// 找到 `</name` 的起始位置（name 后必须是空白、`>` 或 `/`）。
fn find_closing(src: &str, from: usize, name: &str) -> Option<usize> {
    let mut cursor = from;
    loop {
        let index = find_case_insensitive(src, &format!("</{name}"), cursor)?;
        let after = index + 2 + name.len();
        let boundary = src.as_bytes().get(after).copied();
        if matches!(boundary, None | Some(b'>') | Some(b'/') | Some(b' ') | Some(b'\t') | Some(b'\n') | Some(b'\r')) {
            return Some(index);
        }
        cursor = index + 2;
    }
}

fn close_after_close_tag(src: &str, close_start: usize) -> usize {
    match find_tag_end(src.as_bytes(), close_start) {
        Some(end) => end + 1,
        None => src.len(),
    }
}

fn is_allowed_tag(name: &str) -> bool {
    ALLOWED_TAGS.contains(&name)
}

fn is_void(name: &str) -> bool {
    VOID_TAGS.contains(&name)
}

fn is_drop_with_content(name: &str) -> bool {
    DROP_WITH_CONTENT.contains(&name)
}

fn is_void_drop(name: &str) -> bool {
    VOID_DROP_TAGS.contains(&name)
}

fn is_allowed_attr(name: &str) -> bool {
    ALLOWED_ATTRS.contains(&name) || name.starts_with("data-") || name.starts_with("aria-")
}

// ---------- URL ----------

fn url_rejection(attr: &str, value: &str) -> Option<String> {
    let normalized = normalize_url_text(value);
    let lowered = normalized.to_ascii_lowercase();

    if lowered.starts_with("javascript:") || lowered.starts_with("vbscript:") {
        return Some("脚本协议 URL".into());
    }
    if lowered.starts_with("data:") {
        if attr == "src" && is_allowed_image_data_url(&lowered) {
            return None;
        }
        return Some("data: URL 仅允许 img 的 png/jpeg/gif/webp".into());
    }
    if attr == "src" {
        return Some("预览内不允许外部资源 URL（内容需内联为 data: 图片）".into());
    }
    // href：只允许同文档片段与相对锚点。
    if normalized.starts_with('#') {
        return None;
    }
    Some("预览内不允许外部跳转链接".into())
}

fn is_allowed_image_data_url(lowered: &str) -> bool {
    lowered.starts_with("data:image/png;")
        || lowered.starts_with("data:image/jpeg;")
        || lowered.starts_with("data:image/jpg;")
        || lowered.starts_with("data:image/gif;")
        || lowered.starts_with("data:image/webp;")
}

/// 解掉实体与空白后再判断，防 `jav&#x61;script:` / `java\tscript:` 绕过。
fn normalize_url_text(value: &str) -> String {
    let decoded = decode_basic_entities(value.trim());
    decoded
        .chars()
        .filter(|ch| !ch.is_ascii_control() && !ch.is_whitespace())
        .collect()
}

fn decode_basic_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'&' {
            if let Some(semi) = input[i..].find(';') {
                let entity = &input[i + 1..i + semi];
                if let Some(decoded) = decode_entity(entity) {
                    out.push(decoded);
                    i += semi + 1;
                    continue;
                }
            }
        }
        let ch = input[i..].chars().next().unwrap_or('\u{0}');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn decode_entity(entity: &str) -> Option<char> {
    if let Some(hex) = entity.strip_prefix("#x").or_else(|| entity.strip_prefix("#X")) {
        return u32::from_str_radix(hex, 16).ok().and_then(char::from_u32);
    }
    if let Some(dec) = entity.strip_prefix('#') {
        return dec.parse::<u32>().ok().and_then(char::from_u32);
    }
    match entity.to_ascii_lowercase().as_str() {
        "colon" => Some(':'),
        "tab" => Some('\t'),
        "newline" => Some('\n'),
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ => None,
    }
}

fn escape_attr(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(ch),
        }
    }
    out
}

// ---------- CSS ----------

/// 清洗 CSS：去 @import / url() / expression / javascript / behavior / 覆盖层定位。
pub(crate) fn sanitize_css(input: &str, line: usize, report: &mut SanitizeReport) -> String {
    let mut css = input.replace('\\', " ");
    css = remove_at_import(&mut css, report, line);
    css = remove_css_urls(&mut css, report, line);
    css = remove_keyword_function(&mut css, "expression", report, line);
    css = remove_keyword_function(&mut css, "javascript:", report, line);
    css = remove_declarations_containing(&mut css, "behavior", report, "css-behavior", line);
    css = remove_declarations_containing(&mut css, "-moz-binding", report, "css-binding", line);
    remove_overlay_positions(&css, report, line)
}

/// 只移除 `position` 声明里的 fixed/sticky；`background-position` 等不受影响。
fn remove_overlay_positions(css: &str, report: &mut SanitizeReport, line: usize) -> String {
    let lower = css.to_ascii_lowercase();
    let mut ranges: Vec<(usize, usize)> = Vec::new();

    for keyword in ["fixed", "sticky"] {
        let mut cursor = 0usize;
        while let Some(found) = lower[cursor..].find(keyword) {
            let index = cursor + found;
            let decl_start = css[..index]
                .rfind(|ch| ch == ';' || ch == '{')
                .map(|pos| pos + 1)
                .unwrap_or(0);
            let decl_end = css[index..]
                .find(|ch| ch == ';' || ch == '}')
                .map(|pos| index + pos + 1)
                .unwrap_or(css.len());
            let declaration = lower[decl_start..decl_end].to_string();
            if declaration.contains("position") {
                ranges.push((decl_start, decl_end));
            }
            cursor = index + keyword.len();
        }
    }

    if ranges.is_empty() {
        return css.to_string();
    }

    ranges.sort_by_key(|range| range.0);
    let mut merged: Vec<(usize, usize)> = Vec::new();
    for (start, end) in ranges {
        match merged.last_mut() {
            Some(last) if start <= last.1 => last.1 = last.1.max(end),
            _ => merged.push((start, end)),
        }
    }

    let mut out = String::with_capacity(css.len());
    let mut cursor = 0usize;
    for (start, end) in merged {
        out.push_str(&css[cursor..start]);
        push_issue(
            report,
            "css-overlay",
            "移除 position: fixed/sticky 声明（防覆盖层诱导点击）".into(),
            line,
        );
        cursor = end;
    }
    out.push_str(&css[cursor..]);
    out
}

fn remove_at_import(css: &mut String, report: &mut SanitizeReport, line: usize) -> String {
    let mut out = String::with_capacity(css.len());
    let mut rest = css.as_str();
    loop {
        let Some(index) = find_case_insensitive(rest, "@import", 0) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..index]);
        let tail = &rest[index..];
        let end = tail.find(';').map(|pos| pos + 1).unwrap_or(tail.len());
        report.removed_urls += 1;
        push_issue(report, "css-import", "移除 CSS @import（不允许外链样式）".into(), line);
        rest = &tail[end..];
    }
    out
}

fn remove_css_urls(css: &mut String, report: &mut SanitizeReport, line: usize) -> String {
    let mut out = String::with_capacity(css.len());
    let mut rest = css.as_str();
    loop {
        let Some(index) = find_case_insensitive(rest, "url(", 0) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..index]);
        let tail = &rest[index..];
        let end = tail.find(')').map(|pos| pos + 1).unwrap_or(tail.len());
        report.removed_urls += 1;
        push_issue(
            report,
            "css-url",
            "移除 CSS url()（不允许外部/内嵌资源引用）".into(),
            line,
        );
        out.push_str("none");
        rest = &tail[end..];
    }
    out
}

fn remove_keyword_function(
    css: &mut String,
    keyword: &str,
    report: &mut SanitizeReport,
    line: usize,
) -> String {
    let mut out = String::with_capacity(css.len());
    let mut rest = css.as_str();
    loop {
        let Some(index) = find_case_insensitive(rest, keyword, 0) else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..index]);
        let tail = &rest[index..];
        // expression(...) 可能嵌套括号，按配对深度一直删到最外层 `)`。
        let end = if keyword.ends_with(':') {
            tail.find(')').map(|pos| pos + 1).unwrap_or(tail.len())
        } else {
            match tail.find('(') {
                Some(open) => matching_paren(tail, open)
                    .map(|pos| pos + 1)
                    .unwrap_or(tail.len()),
                None => keyword.len(),
            }
        };
        push_issue(
            report,
            "css-keyword",
            format!("移除 CSS {keyword}（可执行/脚本关键字）"),
            line,
        );
        rest = &tail[end..];
    }
    out
}

fn remove_declarations_containing(
    css: &mut String,
    needle: &str,
    report: &mut SanitizeReport,
    kind: &str,
    line: usize,
) -> String {
    let mut out = String::with_capacity(css.len());
    let mut rest = css.as_str();
    loop {
        let Some(index) = find_case_insensitive(rest, needle, 0) else {
            out.push_str(rest);
            break;
        };
        // 丢掉整条声明：向前回到上一个 ; 或 {，向后到下一个 ; 或 }。
        let head = &rest[..index];
        let cut_start = head
            .rfind(|ch| ch == ';' || ch == '{')
            .map(|pos| pos + 1)
            .unwrap_or(0);
        out.push_str(&head[..cut_start]);
        let tail = &rest[cut_start..];
        let next_semi = tail.find(';');
        let next_brace = tail.find('}');
        let cut_end = match (next_semi, next_brace) {
            (Some(semi), Some(brace)) => semi.min(brace) + 1,
            (Some(semi), None) => semi + 1,
            (None, Some(brace)) => brace,
            (None, None) => tail.len(),
        };
        push_issue(
            report,
            kind,
            format!("移除 CSS 声明（包含不允许的 {needle}）"),
            line,
        );
        rest = &tail[cut_end..];
    }
    out
}

fn matching_paren(input: &str, open: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut depth = 0usize;
    let mut quote = 0u8;
    let mut i = open;
    while i < bytes.len() {
        let byte = bytes[i];
        if quote != 0 {
            if byte == quote {
                quote = 0;
            }
        } else if byte == b'"' || byte == b'\'' {
            quote = byte;
        } else if byte == b'(' {
            depth += 1;
        } else if byte == b')' {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

fn push_issue(report: &mut SanitizeReport, kind: &str, message: String, line: usize) {
    if report.issues.len() >= MAX_ISSUES {
        report.issues_truncated = true;
        return;
    }
    report.issues.push(SanitizeIssue {
        kind: kind.to_string(),
        message,
        line,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clean(input: &str) -> SanitizedHtml {
        sanitize_html(input)
    }

    #[test]
    fn removes_script_tag_and_content() {
        let result = clean("<div>a</div><script>alert('x')</script><p>b</p>");
        assert!(!result.html.to_ascii_lowercase().contains("<script"));
        assert!(!result.html.contains("alert"));
        assert!(result.html.contains("<div>a</div>"));
        assert!(result.html.contains("<p>b</p>"));
        assert!(result
            .report
            .issues
            .iter()
            .any(|issue| issue.message.contains("<script>")));
    }

    #[test]
    fn removes_unclosed_script_to_end() {
        let result = clean("<p>ok</p><script>alert(1)");
        assert!(result.html.contains("<p>ok</p>"));
        assert!(!result.html.contains("alert"));
    }

    #[test]
    fn removes_event_attributes() {
        let result = clean(r#"<img src="data:image/png;base64,AAAA" onerror="alert(1)" onload="alert(2)">"#);
        assert!(!result.html.to_ascii_lowercase().contains("onerror"));
        assert!(!result.html.to_ascii_lowercase().contains("onload"));
        assert!(result.html.contains("data:image/png"));
    }

    #[test]
    fn removes_javascript_urls() {
        for payload in [
            r#"<a href="javascript:alert(1)">x</a>"#,
            r#"<a href="JaVaScRiPt:alert(1)">x</a>"#,
            r#"<a href="jav&#x61;script:alert(1)">x</a>"#,
            r#"<a href="java&#9;script:alert(1)">x</a>"#,
            r#"<a href="vbscript:msgbox(1)">x</a>"#,
        ] {
            let result = clean(payload);
            assert!(
                !result.html.to_ascii_lowercase().contains("javascript:")
                    && !result.html.to_ascii_lowercase().contains("vbscript:"),
                "未清洗干净：{}",
                payload
            );
            assert!(!result.html.contains("href"));
        }
    }

    #[test]
    fn strips_css_external_references() {
        let result = clean(
            r#"<style>
                @import url("http://evil.example/a.css");
                .a { background: url(http://evil.example/x.png); }
                .b { width: expression(alert(1)); }
            </style>"#,
        );
        let lower = result.html.to_ascii_lowercase();
        assert!(!lower.contains("@import"));
        assert!(!lower.contains("url("));
        assert!(!lower.contains("evil.example"));
        assert!(!lower.contains("expression"));
        assert!(lower.contains("<style>"));
    }

    #[test]
    fn strips_nested_expression_fully() {
        let result = clean(
            r#"<style>.b { width: expression(alert(1)); color: red; }</style>"#,
        );
        assert!(!result.html.to_ascii_lowercase().contains("expression"));
        assert!(result.html.contains("color: red"));
    }

    #[test]
    fn removes_iframe_object_embed() {
        let result = clean(
            r#"<div>a</div><iframe src="https://evil">fallback</iframe><object data="x">o</object><embed src="y"><p>b</p>"#,
        );
        let lower = result.html.to_ascii_lowercase();
        assert!(!lower.contains("<iframe"));
        assert!(!lower.contains("<object"));
        assert!(!lower.contains("<embed"));
        assert!(!result.html.contains("fallback"));
        assert!(result.html.contains("<p>b</p>"));
    }

    #[test]
    fn neutralizes_overlay_positioning() {
        let result = clean(
            r#"<div style="position:fixed;inset:0;z-index:9999;background:#000">覆盖层</div>"#,
        );
        let lower = result.html.to_ascii_lowercase();
        assert!(!lower.contains("position:fixed"));
        assert!(!lower.contains("position: fixed"));
        assert!(result
            .report
            .issues
            .iter()
            .any(|issue| issue.kind == "css-overlay"));
    }

    #[test]
    fn keeps_safe_markup() {
        let result = clean(
            r#"<div class="card" data-id="7" style="color:#fff;border-radius:12px"><h1>标题</h1><p>正文 &amp; 说明</p></div>"#,
        );
        assert!(result.html.contains(r#"class="card""#));
        assert!(result.html.contains(r#"data-id="7""#));
        assert!(result.html.contains("border-radius:12px"));
        assert!(result.html.contains("<h1>标题</h1>"));
        assert!(result.html.contains("&amp;"));
        assert_eq!(result.report.removed_tags, 0);
        assert_eq!(result.report.removed_attributes, 0);
    }

    #[test]
    fn drops_meta_link_base_and_unknown_tags() {
        let result = clean(
            r#"<meta http-equiv="refresh" content="0;url=http://evil"><link rel="stylesheet" href="x"><base href="http://evil"><custom>safe</custom>"#,
        );
        let lower = result.html.to_ascii_lowercase();
        assert!(!lower.contains("<meta"));
        assert!(!lower.contains("<link"));
        assert!(!lower.contains("<base"));
        assert!(!lower.contains("<custom"));
        assert!(result.html.contains("safe"));
    }

    #[test]
    fn rejects_oversize_and_nul() {
        let big = "a".repeat(MAX_INPUT_BYTES + 1);
        assert_eq!(clean(&big).report.state, SanitizeState::Rejected);
        assert_eq!(clean("a\0b").report.state, SanitizeState::Rejected);
    }

    #[test]
    fn reports_line_numbers() {
        let result = clean("<div>ok</div>\n<script>alert(1)</script>");
        let issue = result
            .report
            .issues
            .iter()
            .find(|issue| issue.message.contains("<script>"))
            .expect("缺少 script 报告");
        assert_eq!(issue.line, 2);
    }

    #[test]
    fn strips_entity_encoded_attribute_scheme() {
        let result = clean(r#"<a href="&#106;&#97;vascript:alert(1)">x</a>"#);
        assert!(!result.html.contains("href"));
    }
}
