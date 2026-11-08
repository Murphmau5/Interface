mod commands;
mod config;
mod db;
mod error;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = config::resolve_data_dir(app.handle())
                .map_err(|err| std::io::Error::other(err))?;
            let pool = tauri::async_runtime::block_on(db::connect(&data_dir))
                .map_err(|err| std::io::Error::other(format!("数据库初始化失败：{err}")))?;
            app.manage(db::Db::new(pool, data_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::settings_get_all,
            commands::settings::settings_set,
            commands::cases::cases_list,
            commands::cases::cases_counts,
            commands::cases::cases_create,
            commands::cases::cases_rename,
            commands::cases::cases_toggle_favorite,
            commands::cases::cases_soft_delete,
            commands::system::app_info,
        ])
        .run(tauri::generate_context!())
        .expect("界序 INTERFACE 启动失败");
}
