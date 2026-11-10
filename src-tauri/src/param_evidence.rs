//! 参数证据链（specRef）归一化。
//!
//! 口径：参数级 `verified` 必须同时满足「有 specRef、五个字段齐全、URL 为 https、
//! quote 与参数值一一对应」；任一不满足就降为 `estimated`。没有 specRef 的参数最高只能是
//! `estimated`。内容包导入、案例写入都走这里，保证前后端与导入路径同一口径。

use serde_json::{Map, Value};

const MAX_PLATFORM_CHARS: usize = 80;
const MAX_VERSION_CHARS: usize = 80;
const MAX_COMPONENT_CHARS: usize = 160;
const MAX_URL_CHARS: usize = 600;
const MAX_QUOTE_CHARS: usize = 2000;

/// 归一化一个 payload 对象；返回被降级/修正的原因，便于导入摘要展示。
pub fn normalize_payload(payload: &mut Value) -> Vec<String> {
    let mut notes = Vec::new();
    let Some(root) = payload.as_object_mut() else {
        return notes;
    };

    normalize_refs(root, &mut notes);
    normalize_alts(root, &mut notes);
    normalize_binding(root, &mut notes);
    clamp_sources(root, &mut notes);

    notes
}

/// 字符串入口：解析失败时原样返回，不阻断写入。
pub fn normalize_payload_str(payload_json: &str) -> (String, Vec<String>) {
    let Ok(mut value) = serde_json::from_str::<Value>(payload_json) else {
        return (payload_json.to_string(), Vec::new());
    };
    let notes = normalize_payload(&mut value);
    if notes.is_empty() {
        return (payload_json.to_string(), notes);
    }
    (value.to_string(), notes)
}

fn normalize_refs(root: &mut Map<String, Value>, notes: &mut Vec<String>) {
    let Some(Value::Object(refs)) = root.get_mut("paramRefs") else {
        if let Some(value) = root.get("paramRefs") {
            if !value.is_null() {
                root.insert("paramRefs".into(), Value::Object(Map::new()));
                notes.push("paramRefs 不是对象，已清空".into());
            }
        }
        return;
    };

    let keys: Vec<String> = refs.keys().cloned().collect();
    for key in keys {
        let valid = refs.get(&key).is_some_and(valid_ref);
        if !valid {
            refs.remove(&key);
            notes.push(format!("paramRefs.{key} 字段不完整或 URL 非 https，已移除"));
        }
    }
}

fn normalize_alts(root: &mut Map<String, Value>, notes: &mut Vec<String>) {
    let Some(Value::Object(alts)) = root.get_mut("paramRefAlts") else {
        return;
    };
    let keys: Vec<String> = alts.keys().cloned().collect();
    for key in keys {
        let Some(Value::Array(entries)) = alts.get_mut(&key) else {
            alts.remove(&key);
            notes.push(format!("paramRefAlts.{key} 不是数组，已移除"));
            continue;
        };
        let before = entries.len();
        entries.retain(valid_ref);
        if entries.len() != before {
            notes.push(format!(
                "paramRefAlts.{key} 移除 {} 条不合法参考值",
                before - entries.len()
            ));
        }
        if entries.is_empty() {
            alts.remove(&key);
        }
    }
}

fn normalize_binding(root: &mut Map<String, Value>, notes: &mut Vec<String>) {
    let Some(Value::Object(binding)) = root.get_mut("specBinding") else {
        return;
    };
    let bound = binding.get("bound").and_then(Value::as_bool).unwrap_or(false);
    binding.insert("bound".into(), Value::Bool(bound));

    if bound {
        let mut missing = Vec::new();
        for key in ["platform", "version"] {
            let ok = binding
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(|text| !text.trim().is_empty());
            if !ok {
                missing.push(key);
            }
        }
        if !missing.is_empty() {
            binding.insert("bound".into(), Value::Bool(false));
            binding.insert("note".into(), Value::String("非平台绑定".into()));
            notes.push(format!(
                "specBinding 缺少 {}，已按非平台绑定处理",
                missing.join(" / ")
            ));
        }
    } else {
        binding.insert("note".into(), Value::String("非平台绑定".into()));
    }
}

fn clamp_sources(root: &mut Map<String, Value>, notes: &mut Vec<String>) {
    // 先把判断依据取出来，再取 paramSources 的可变借用，避免同时持有两处借用。
    let preview = root.get("preview").cloned().unwrap_or(Value::Null);
    let refs = root.get("paramRefs").cloned().unwrap_or(Value::Null);
    let Some(Value::Object(sources)) = root.get_mut("paramSources") else {
        return;
    };

    let keys: Vec<String> = sources.keys().cloned().collect();
    for key in keys {
        let is_verified = sources
            .get(&key)
            .and_then(Value::as_str)
            .is_some_and(|level| level == "verified");
        if !is_verified {
            continue;
        }

        let reference = refs
            .as_object()
            .and_then(|refs| refs.get(&key))
            .filter(|value| valid_ref(value));

        let Some(reference) = reference else {
            sources.insert(key.clone(), Value::String("estimated".into()));
            notes.push(format!("{key} 缺有效 specRef，verified 降为 estimated"));
            continue;
        };

        let Some(actual) = preview.get(&key) else {
            sources.insert(key.clone(), Value::String("estimated".into()));
            notes.push(format!("{key} 不在 preview 中，verified 降为 estimated"));
            continue;
        };

        if !quote_matches(actual, reference) {
            sources.insert(key.clone(), Value::String("estimated".into()));
            notes.push(format!("{key} 的原文引句与数值不对应，verified 降为 estimated"));
        }
    }
}

fn valid_ref(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    let limits = [
        ("platform", MAX_PLATFORM_CHARS),
        ("version", MAX_VERSION_CHARS),
        ("component", MAX_COMPONENT_CHARS),
        ("url", MAX_URL_CHARS),
        ("quote", MAX_QUOTE_CHARS),
    ];
    for (key, max) in limits {
        let Some(text) = object.get(key).and_then(Value::as_str).map(str::trim) else {
            return false;
        };
        if text.is_empty() || text.chars().count() > max {
            return false;
        }
    }
    object
        .get("url")
        .and_then(Value::as_str)
        .is_some_and(|url| url.trim().starts_with("https://"))
}

/// quote 与数值一一对应：缓动要求整个 cubic-bezier 四元组出现；
/// 其余数值要求值里的每个数字字面量都在引句里以独立数字出现。
fn quote_matches(actual: &Value, reference: &Value) -> bool {
    let quote = reference
        .get("quote")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let compact_quote = compact(quote);

    match actual {
        Value::String(text) => {
            let value = text.trim();
            if value.starts_with("cubic-bezier") {
                let Some(expected) = bezier_values(value) else {
                    return false;
                };
                let Some(quoted) = bezier_values(quote) else {
                    return false;
                };
                return expected
                    .iter()
                    .zip(quoted.iter())
                    .all(|(left, right)| (left - right).abs() < f64::EPSILON);
            }
            let tokens = number_tokens(value);
            if tokens.is_empty() {
                // 非数值选项（如 scene / treatment）：要求引句里出现原词
                return compact_quote.contains(&compact(value));
            }
            tokens.iter().all(|token| contains_number(quote, token))
        }
        Value::Number(number) => {
            let token = number.to_string();
            contains_number(quote, &token)
        }
        _ => false,
    }
}

fn compact(text: &str) -> String {
    text.chars().filter(|ch| !ch.is_whitespace()).collect()
}

fn bezier_values(text: &str) -> Option<Vec<f64>> {
    let start = text.find("cubic-bezier(")? + "cubic-bezier(".len();
    let end = text[start..].find(')')? + start;
    let values: Vec<f64> = text[start..end]
        .split(',')
        .filter_map(|part| part.trim().parse::<f64>().ok())
        .collect();
    if values.len() == 4 {
        Some(values)
    } else {
        None
    }
}

fn number_tokens(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            current.push(ch);
        } else if !current.is_empty() {
            push_token(&mut tokens, &current);
            current.clear();
        }
    }
    if !current.is_empty() {
        push_token(&mut tokens, &current);
    }
    tokens
}

fn push_token(tokens: &mut Vec<String>, raw: &str) {
    let trimmed = raw.trim_matches('.');
    if !trimmed.is_empty() && trimmed.chars().any(|ch| ch.is_ascii_digit()) {
        tokens.push(trimmed.to_string());
    }
}

/// 独立数字匹配：24 不会命中 240，0 不会命中 0.2。
fn contains_number(quote: &str, token: &str) -> bool {
    let bytes = quote.as_bytes();
    let needle = token.as_bytes();
    let mut start = 0;
    while let Some(offset) = quote[start..].find(token) {
        let index = start + offset;
        let before_ok = index == 0
            || !bytes[index - 1].is_ascii_digit() && bytes[index - 1] != b'.';
        let end = index + needle.len();
        let after_ok = end >= bytes.len() || !bytes[end].is_ascii_digit() && bytes[end] != b'.';
        if before_ok && after_ok {
            return true;
        }
        start = index + needle.len();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn payload(source: Value, reference: Option<Value>, actual: Value) -> Value {
        let mut root = json!({
            "v": 3,
            "preview": { "kind": "component", "hitTarget": actual },
            "paramSources": { "hitTarget": source },
        });
        if let Some(reference) = reference {
            root["paramRefs"] = json!({ "hitTarget": reference });
        }
        root
    }

    fn valid_ref() -> Value {
        json!({
            "platform": "W3C",
            "version": "WCAG 2.2",
            "component": "SC 2.5.8 Target Size (Minimum)",
            "url": "https://www.w3.org/TR/WCAG22/#target-size-minimum",
            "quote": "The size of the target for pointer inputs is at least 24 by 24 CSS pixels"
        })
    }

    #[test]
    fn keeps_verified_when_ref_matches_value() {
        let mut root = payload(json!("verified"), Some(valid_ref()), json!(24));
        let notes = normalize_payload(&mut root);
        assert!(notes.is_empty());
        assert_eq!(root["paramSources"]["hitTarget"], json!("verified"));
    }

    #[test]
    fn downgrades_verified_without_ref() {
        let mut root = payload(json!("verified"), None, json!(24));
        normalize_payload(&mut root);
        assert_eq!(root["paramSources"]["hitTarget"], json!("estimated"));
    }

    #[test]
    fn downgrades_when_quote_misses_value() {
        let mut reference = valid_ref();
        reference["quote"] = json!("at least 44 by 44 points");
        let mut root = payload(json!("verified"), Some(reference), json!(24));
        normalize_payload(&mut root);
        assert_eq!(root["paramSources"]["hitTarget"], json!("estimated"));
    }

    #[test]
    fn rejects_non_https_ref() {
        let mut reference = valid_ref();
        reference["url"] = json!("http://example.com/wcag");
        let mut root = payload(json!("verified"), Some(reference), json!(24));
        normalize_payload(&mut root);
        assert_eq!(root["paramSources"]["hitTarget"], json!("estimated"));
        assert!(root["paramRefs"].as_object().unwrap().is_empty());
    }

    #[test]
    fn downgrades_when_field_missing() {
        let mut reference = valid_ref();
        reference.as_object_mut().unwrap().remove("component");
        let mut root = payload(json!("verified"), Some(reference), json!(24));
        normalize_payload(&mut root);
        assert_eq!(root["paramSources"]["hitTarget"], json!("estimated"));
    }

    #[test]
    fn eases_require_full_bezier_quote() {
        let mut root = json!({
            "v": 3,
            "preview": { "kind": "style", "easing": "cubic-bezier(0.2,0,0,1)" },
            "paramSources": { "easing": "verified" },
            "paramRefs": { "easing": {
                "platform": "Material 3",
                "version": "Expressive 2025+",
                "component": "Standard easing",
                "url": "https://m3.material.io/styles/motion/easing-and-duration/tokens-specs",
                "quote": "Standard: cubic-bezier(0.2, 0, 0, 1)"
            }}
        });
        assert!(normalize_payload(&mut root).is_empty());

        root["paramRefs"]["easing"]["quote"] = json!("Standard easing 0.2 0 0 1");
        normalize_payload(&mut root);
        assert_eq!(root["paramSources"]["easing"], json!("estimated"));
    }

    #[test]
    fn generic_binding_is_marked() {
        let mut root = json!({
            "v": 3,
            "preview": { "kind": "component", "control": "button", "durationMs": 220, "easing": "ease" },
            "specBinding": { "bound": false }
        });
        normalize_payload(&mut root);
        assert_eq!(root["specBinding"]["note"], json!("非平台绑定"));
    }
}
