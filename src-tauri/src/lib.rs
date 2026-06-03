mod commands;
mod database;
mod error;
mod models;
mod private_key;
mod ssh;
mod state;

use state::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state =
                tauri::async_runtime::block_on(async move { AppState::initialize(&handle).await })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connections::list_connections,
            commands::connections::get_connection,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::connections::save_connection_password,
            commands::connections::test_connection,
            commands::connections::dashboard_summary,
            commands::data_portability::export_data,
            commands::data_portability::import_data,
            commands::keys::list_ssh_keys,
            commands::keys::create_ssh_key,
            commands::keys::update_ssh_key,
            commands::keys::delete_ssh_key,
            commands::release::release_info,
            commands::release::check_latest_release,
            commands::release::download_latest_installer,
            commands::release::open_latest_release_page,
            commands::sftp::sftp_list_directory,
            commands::sftp::sftp_create_directory,
            commands::sftp::sftp_delete_paths,
            commands::sftp::sftp_upload_file,
            commands::sftp::sftp_download_file,
            commands::terminal::start_terminal_session,
            commands::terminal::write_terminal_session,
            commands::terminal::stop_terminal_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sshCR");
}
