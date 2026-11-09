mod commands;
mod config;
mod db;
mod error;
mod search;
mod sha256;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
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
        .invoke_handler(tauri::generate_handler![
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
            commands::assets::assets_list_for_case,
            commands::candidates::candidates_list,
            commands::candidates::candidates_create,
            commands::candidates::candidates_reject,
            commands::candidates::candidates_approve,
            commands::system::app_info,
        ])
        .run(tauri::generate_context!())
        .expect("界序 INTERFACE 启动失败");
}
