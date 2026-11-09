//! 端到端验证：本地假服务器 + 临时数据库 + 临时凭据账号。
//!
//! 覆盖：保存 Key → 测试连接 → 工作台分析 → 候选池 → 人工审核入库；
//! 以及抓取链路的「首次新增 / 二次重复」。
//! 仅用于测试构建，不进入发布产物。

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::thread;
    use std::time::Duration;

    use uuid::Uuid;

    use crate::ai::{self, AnalyzeInput, ProviderConfig};
    use crate::commands::{candidates, discovery};
    use crate::fetch::FetchOptions;
    use crate::secrets;

    fn read_request(stream: &mut TcpStream) -> String {
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 2048];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(count) => {
                    buffer.extend_from_slice(&chunk[..count]);
                    if let Some(end) = find_header_end(&buffer) {
                        let header = String::from_utf8_lossy(&buffer[..end]).to_lowercase();
                        let length = header
                            .lines()
                            .find_map(|line| {
                                line.strip_prefix("content-length:")
                                    .and_then(|value| value.trim().parse::<usize>().ok())
                            })
                            .unwrap_or(0);
                        while buffer.len() < end + 4 + length {
                            match stream.read(&mut chunk) {
                                Ok(0) | Err(_) => break,
                                Ok(count) => buffer.extend_from_slice(&chunk[..count]),
                            }
                        }
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        String::from_utf8_lossy(&buffer).to_string()
    }

    fn find_header_end(buffer: &[u8]) -> Option<usize> {
        buffer.windows(4).position(|window| window == b"\r\n\r\n")
    }

    fn spawn_server(
        expected: usize,
        content_type: &str,
        body: String,
    ) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("绑定本地假服务器");
        let address = listener.local_addr().expect("读取本地端口");
        let content_type = content_type.to_string();

        let handle = thread::spawn(move || {
            let mut authorizations = Vec::new();
            for _ in 0..expected {
                let Ok((mut stream, _)) = listener.accept() else {
                    break;
                };
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let request = read_request(&mut stream);
                let authorization = request
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        if name.eq_ignore_ascii_case("authorization") {
                            Some(value.trim().to_string())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();
                authorizations.push(authorization);
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.as_bytes().len()
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
            authorizations
        });

        (format!("http://{address}"), handle)
    }

    /// 假 OpenAI 兼容服务器：故意返回 confidence = verified，验证入库前被降级。
    fn spawn_openai_server(expected: usize) -> (String, thread::JoinHandle<Vec<String>>) {
        let analysis = serde_json::json!({
            "title": "假服务器案例",
            "summary": "端到端测试用分析结果",
            "confidence": "verified",
            "payload": { "preview": { "kind": "page" } }
        })
        .to_string();
        let body = serde_json::json!({
            "choices": [{ "message": { "role": "assistant", "content": analysis } }]
        })
        .to_string();
        spawn_server(expected, "application/json; charset=utf-8", body)
    }

    fn spawn_html_server(expected: usize) -> (String, thread::JoinHandle<Vec<String>>) {
        let body = r#"<!doctype html><html><head><title>端到端抓取样例</title>
            <meta name="description" content="抓取链路测试页面">
            <script>alert('should not survive')</script></head>
            <body><main><h1>样例</h1><p>这是一段足够长的正文，用于验证正文提取与候选去重逻辑可以正常工作。</p></main></body></html>"#
            .to_string();
        spawn_server(expected, "text/html; charset=utf-8", body)
    }

    #[tokio::test]
    #[cfg(windows)]
    async fn full_ai_chain_and_fetch_dedupe() {
        let data_dir = std::env::temp_dir().join(format!("jiexu-e2e-{}", Uuid::new_v4()));
        let pool = crate::db::connect(&data_dir).await.expect("创建测试数据库");

        let account = format!("jiexu-interface:test:e2e:{}", Uuid::new_v4());
        let comment = r#"{"last4":"-key","updatedAt":"2026-11-09T00:00:00Z"}"#;
        secrets::write(&account, "sk-e2e-key", comment).expect("写入临时凭据");
        let (stored, _) = secrets::read(&account)
            .expect("读取临时凭据")
            .expect("临时凭据应存在");
        assert_eq!(stored, "sk-e2e-key");

        let (base_url, server) = spawn_openai_server(2);
        let config = ProviderConfig {
            provider_id: "openai_compat".into(),
            base_url: base_url.clone(),
            model: "fake-model".into(),
            auth_mode: "bearer".into(),
            timeout_ms: 5_000,
            max_output_tokens: 512,
        };

        let tested = ai::test_model(&config, Some(&stored))
            .await
            .expect("测试连接不应抛错");
        assert!(tested.ok, "测试连接应成功：{} {}", tested.code, tested.message);

        let analyzed = ai::analyze(
            &config,
            Some(&stored),
            &AnalyzeInput {
                kind: "style".into(),
                draft: "一个玻璃拟态弹窗的交互草稿".into(),
                source_url: None,
            },
        )
        .await
        .expect("分析应成功");
        assert_eq!(analyzed.draft.confidence, "estimated");
        assert_ne!(analyzed.draft.confidence, "verified");

        let candidate = candidates::insert_candidate(
            &pool,
            "style",
            &analyzed.draft.title,
            &analyzed.draft.summary,
            &analyzed.draft.payload_json,
            "ai",
            None,
        )
        .await
        .expect("写入候选池");
        assert_eq!(candidate.status, "pending");

        let created = candidates::approve_candidate(&pool, &candidate.id, None)
            .await
            .expect("人工审核入库");
        let confidence: String = sqlx::query_scalar("SELECT confidence FROM cases WHERE id = ?1")
            .bind(&created.id)
            .fetch_one(&pool)
            .await
            .expect("读取入库案例");
        assert_eq!(confidence, "estimated");

        let (status, approved_case): (String, Option<String>) =
            sqlx::query_as("SELECT status, approved_case_id FROM candidates WHERE id = ?1")
                .bind(&candidate.id)
                .fetch_one(&pool)
                .await
                .expect("读取候选状态");
        assert_eq!(status, "approved");
        assert_eq!(approved_case.as_deref(), Some(created.id.as_str()));

        let authorizations = server.join().expect("等待假服务器");
        assert_eq!(authorizations.len(), 2);
        assert!(authorizations
            .iter()
            .all(|value| value == "Bearer sk-e2e-key"));

        // 抓取链路：首次新增、二次同 URL 重复
        let (html_url, html_server) = spawn_html_server(2);
        let options = FetchOptions {
            allow_loopback: true,
            timeout_ms: 5_000,
            ..FetchOptions::default()
        };
        let first = discovery::import_page_with(&pool, &html_url, "style", "url", &options).await;
        assert_eq!(first.outcome, "created", "{first:?}");
        let second = discovery::import_page_with(&pool, &html_url, "style", "url", &options).await;
        assert_eq!(second.outcome, "duplicate", "{second:?}");
        assert_eq!(second.existing_candidate_id.as_deref(), first.candidate_id.as_deref());
        let _ = html_server.join();

        secrets::delete(&account).expect("删除临时凭据");
        assert!(secrets::read(&account).expect("复查临时凭据").is_none());

        drop(pool);
        let _ = std::fs::remove_dir_all(&data_dir);
    }
}
