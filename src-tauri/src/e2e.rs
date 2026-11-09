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

    /// 返回二进制响应（内容包下载用）。
    fn spawn_binary_server(
        body: Vec<u8>,
        content_type: &str,
    ) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("绑定本地假服务器");
        let address = listener.local_addr().expect("读取本地端口");
        let content_type = content_type.to_string();
        let handle = thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let _ = read_request(&mut stream);
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(header.as_bytes());
            let _ = stream.write_all(&body);
        });
        (format!("http://{address}/content-package.zip"), handle)
    }

    #[tokio::test]
    #[cfg(windows)]
    async fn content_package_local_and_online_install_uninstall() {
        use crate::content_pkg::{self, PackageLimits, TRUSTED_KEYS_SETTING};

        let data_dir = std::env::temp_dir().join(format!("jiexu-pkg-e2e-{}", Uuid::new_v4()));
        let pool = crate::db::connect(&data_dir).await.expect("创建测试数据库");

        let seed = [0x51u8; 32];
        let public_key = content_pkg::fixture_public_key(&seed);
        sqlx::query(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        )
        .bind(TRUSTED_KEYS_SETTING)
        .bind(crate::sha256::hex(&public_key))
        .execute(&pool)
        .await
        .expect("写入测试信任公钥");

        let keys = content_pkg::resolve_trusted_keys(&pool)
            .await
            .expect("解析信任公钥");
        assert!(keys.contains(&public_key), "设置里的公钥应参与校验");

        // 本地导入：真实落盘再读回，覆盖「没有服务器也能装」
        let first = content_pkg::fixture_package(&seed, "e2e.pack", "1.0.0", &[("a", "标题 A")]);
        let file = data_dir.join("e2e.pack.zip");
        std::fs::write(&file, &first).expect("写出测试内容包");
        let bytes = std::fs::read(&file).expect("读回测试内容包");
        let report = content_pkg::import_package(
            &pool,
            &bytes,
            "local",
            file.to_str(),
            &keys,
            &PackageLimits::default(),
        )
        .await
        .expect("本地导入");
        assert_eq!(report.stats.created, 1);

        // 在线安装：本地假服务器提供增量包，走下载 → 校验 → 合并
        let second = content_pkg::fixture_package(&seed, "e2e.pack", "1.1.0", &[("a", "标题 A2")]);
        let (url, server) = spawn_binary_server(second, "application/zip");
        let downloaded = content_pkg::download_package(&url, true, &PackageLimits::default())
            .await
            .expect("下载内容包");
        let report = content_pkg::import_package(
            &pool,
            &downloaded,
            "online",
            Some(&url),
            &keys,
            &PackageLimits::default(),
        )
        .await
        .expect("在线导入");
        assert_eq!(report.stats.updated, 1);
        server.join().expect("等待下载服务器");

        let title: String = sqlx::query_scalar("SELECT title FROM cases WHERE id = 'pkg:e2e.pack:a'")
            .fetch_one(&pool)
            .await
            .expect("读取合并后的条目");
        assert_eq!(title, "标题 A2");

        // 用户自建案例，卸载时不能动
        sqlx::query(
            "INSERT INTO cases (id, kind, title, summary, payload_json, confidence, created_at, updated_at) \
             VALUES ('user-own', 'style', '自建', '', '{}', 'user_defined', \
             strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        )
        .execute(&pool)
        .await
        .expect("写入用户自建案例");

        let report = content_pkg::uninstall_package(&pool, "e2e.pack")
            .await
            .expect("卸载内容包");
        assert_eq!(report.removed, 1);

        let left: Vec<String> = sqlx::query_scalar("SELECT id FROM cases ORDER BY id")
            .fetch_all(&pool)
            .await
            .expect("读取剩余案例");
        assert!(
            !left.contains(&"pkg:e2e.pack:a".to_string()),
            "内容包条目应被移除"
        );
        assert!(left.contains(&"user-own".to_string()), "用户自建案例应保留");
        assert!(left.len() > 1, "内置示例数据不应被卸载影响");

        let packages = content_pkg::list_packages(&pool)
            .await
            .expect("列出内容包");
        assert!(packages.is_empty());

        drop(pool);
        let _ = std::fs::remove_dir_all(&data_dir);
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
