use tauri::State;

use crate::{
    commands::connections::get_connection_from_pool,
    error::Result,
    models::{
        RemoteFileEntry, SftpCreateDirectoryRequest, SftpDeleteRequest, SftpDownloadRequest,
        SftpListRequest, SftpTransferResult, SftpUploadRequest,
    },
    ssh,
    state::AppState,
};

#[tauri::command]
pub async fn sftp_list_directory(
    state: State<'_, AppState>,
    request: SftpListRequest,
) -> Result<Vec<RemoteFileEntry>> {
    let connection = get_connection_from_pool(&state.pool, &request.connection_id).await?;
    ssh::list_directory(connection, request).await
}

#[tauri::command]
pub async fn sftp_create_directory(
    state: State<'_, AppState>,
    request: SftpCreateDirectoryRequest,
) -> Result<()> {
    let connection = get_connection_from_pool(&state.pool, &request.connection_id).await?;
    ssh::create_directory(connection, request).await
}

#[tauri::command]
pub async fn sftp_delete_paths(
    state: State<'_, AppState>,
    request: SftpDeleteRequest,
) -> Result<()> {
    let connection = get_connection_from_pool(&state.pool, &request.connection_id).await?;
    ssh::delete_paths(connection, request).await
}

#[tauri::command]
pub async fn sftp_upload_file(
    state: State<'_, AppState>,
    request: SftpUploadRequest,
) -> Result<SftpTransferResult> {
    let connection = get_connection_from_pool(&state.pool, &request.connection_id).await?;
    let connection_id = connection.id.clone();
    let connection_name = connection.name.clone();
    let result = ssh::upload_file(connection, request).await?;
    record_transfer_activity(
        &state,
        "upload",
        &connection_id,
        &connection_name,
        &format!("Uploaded {}", result.path),
        result.bytes,
    )
    .await?;
    Ok(result)
}

#[tauri::command]
pub async fn sftp_download_file(
    state: State<'_, AppState>,
    request: SftpDownloadRequest,
) -> Result<SftpTransferResult> {
    let connection = get_connection_from_pool(&state.pool, &request.connection_id).await?;
    let connection_id = connection.id.clone();
    let connection_name = connection.name.clone();
    let result = ssh::download_file(connection, request).await?;
    record_transfer_activity(
        &state,
        "download",
        &connection_id,
        &connection_name,
        &format!("Downloaded {}", result.path),
        result.bytes,
    )
    .await?;
    Ok(result)
}

async fn record_transfer_activity(
    state: &State<'_, AppState>,
    kind: &str,
    connection_id: &str,
    connection_name: &str,
    detail: &str,
    bytes: u64,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO activity (id, kind, connection_id, connection_name, detail, bytes)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(kind)
    .bind(connection_id)
    .bind(connection_name)
    .bind(detail)
    .bind(bytes as i64)
    .execute(&state.pool)
    .await?;
    Ok(())
}
