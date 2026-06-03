use std::sync::mpsc;

use tauri::{AppHandle, Emitter, State};

use crate::{
    commands::connections::get_connection_from_pool,
    error::Result,
    models::{TerminalExit, TerminalOutput, TerminalSessionInfo, TerminalStartRequest},
    ssh,
    state::{AppState, TerminalHandle},
};

#[tauri::command]
pub async fn start_terminal_session(
    app: AppHandle,
    state: State<'_, AppState>,
    request: TerminalStartRequest,
) -> Result<TerminalSessionInfo> {
    let connection = get_connection_from_pool(&state.pool, &request.connection_id).await?;
    let connection_id = request.connection_id.clone();
    let session_id = uuid::Uuid::new_v4().to_string();
    let (stdin_tx, stdin_rx) = mpsc::channel::<String>();

    state
        .sessions
        .insert(session_id.clone(), TerminalHandle::new(stdin_tx))?;

    let registry = state.sessions.clone();
    let app_for_thread = app.clone();
    let thread_session_id = session_id.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let result = ssh::run_terminal(
            connection,
            request,
            stdin_rx,
            app_for_thread.clone(),
            thread_session_id.clone(),
        );
        let _ = registry.remove(&thread_session_id);

        if let Err(error) = result {
            let _ = app_for_thread.emit(
                "terminal-output",
                TerminalOutput {
                    session_id: thread_session_id.clone(),
                    data: format!("\r\n{error}\r\n"),
                },
            );
            let _ = app_for_thread.emit(
                "terminal-exit",
                TerminalExit {
                    session_id: thread_session_id,
                    message: error.to_string(),
                },
            );
        }
    });

    Ok(TerminalSessionInfo {
        id: session_id,
        connection_id,
    })
}

#[tauri::command]
pub async fn write_terminal_session(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<()> {
    state.sessions.write(&session_id, data)
}

#[tauri::command]
pub async fn stop_terminal_session(state: State<'_, AppState>, session_id: String) -> Result<()> {
    let _ = state.sessions.write(&session_id, "\u{4}".into());
    state.sessions.remove(&session_id)
}
