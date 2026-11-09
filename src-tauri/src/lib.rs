mod ai;
mod commands;
mod config;
mod content_pkg;
mod db;
mod error;
mod fetch;
#[cfg(test)]
mod e2e;
mod html_sanitize;
mod preview;
mod search;
mod secrets;
mod sha256;

use tauri::Manager;

/// 全部应用命令的统一派发入口。
///
/// 固定为 `Wry` 运行时：命令签名里的 `AppHandle` 默认就是 `AppHandle<Wry>`，
/// 泛型运行时会拿不到 `CommandArg` 实现。
fn dispatch(invoke: tauri::ipc::Invoke<tauri::Wry>) -> bool {
    fn handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool {
        tauri::generate_handler![
            commands::settings::settings_get_all,
            commands::settings::settings_set,
            commands::cases::cases_query,
            commands::cases::cases_facets,
            commands::cases::cases_view_counts,
            commands::cases::cases_counts,
            commands::cases::cases_create,
            commands::cases::cases_rename,
            commands::cases::cases_toggle_favorite,
            commands::cases::cases_soft_delete,
            commands::cases::cases_update_payload,
            commands::cases::cases_export_markdown,
            commands::cases::cases_export_bundle,
            commands::catalog::catalog_list,
            commands::library::tags_list,
            commands::library::tags_create,
            commands::library::cases_tags,
            commands::library::cases_set_tags,
            commands::library::collections_list,
            commands::library::collections_create,
            commands::library::collections_add_case,
            commands::library::collections_remove_case,
            commands::assets::assets_import,
            commands::assets::assets_sanitize_html,
            commands::assets::assets_list_for_case,
            preview::preview_open_html,
            commands::candidates::candidates_list,
            commands::candidates::candidates_create,
            commands::candidates::candidates_reject,
            commands::candidates::candidates_approve,
            commands::ai::ai_settings_get,
            commands::ai::ai_provider_set,
            commands::ai::ai_search_set,
            commands::ai::ai_credential_set,
            commands::ai::ai_credential_clear,
            commands::ai::ai_test_connection,
            commands::ai::ai_analyze,
            commands::ai::ai_config_export,
            commands::discovery::discovery_fetch_url,
            commands::discovery::discovery_search,
            commands::content::content_packages_list,
            commands::content::content_package_import,
            commands::content::content_package_install_url,
            commands::content::content_package_uninstall,
            commands::system::app_info,
        ]
    }

    handler()(invoke)
}

pub fn run() {
    // reqwest 0.13 的 rustls-no-provider 组合要求进程级 crypto provider；
    // ring provider 在任何 AI 请求构建 Client 前安装一次（幂等）
    ai::ensure_tls_provider();

    // 应用自定义命令不受 capability ACL 约束，必须在派发层按窗口标签拦截：
    // 预览窗口（preview-html）只渲染清洗后的静态 HTML，不允许触达任何 IPC。
    preview::register(tauri::Builder::default())
        .setup(|app| {
            let data_dir = config::resolve_data_dir(app.handle())
                .map_err(|err| std::io::Error::other(err))?;
            let pool = tauri::async_runtime::block_on(db::connect(&data_dir))
                .map_err(|err| std::io::Error::other(format!("数据库初始化失败：{err}")))?;

            // 老库补写搜索列；失败不阻塞启动，列空只影响搜索命中
            if let Err(err) = tauri::async_runtime::block_on(search::backfill(&pool)) {
                eprintln!("搜索列补写失败：{err}");
            }

            app.manage(db::Db::new(pool, data_dir));
            Ok(())
        })
        .invoke_handler(|invoke| {
            if invoke.message.webview().label() != "main" {
                invoke.resolver.reject("预览窗口不允许调用应用命令");
                return true;
            }
            dispatch(invoke)
        })
        .run(tauri::generate_context!())
        .expect("界序 INTERFACE 启动失败");
}
