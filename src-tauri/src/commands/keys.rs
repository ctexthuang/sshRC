use sqlx::{sqlite::SqliteRow, Row};
use tauri::State;

use crate::{
    error::{AppError, Result},
    models::{SshKey, SshKeyPayload},
    state::AppState,
};

#[tauri::command]
pub async fn list_ssh_keys(state: State<'_, AppState>) -> Result<Vec<SshKey>> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, key_path, public_key, fingerprint, encrypted, created_at, updated_at
        FROM ssh_keys
        ORDER BY updated_at DESC, name ASC
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    rows.into_iter().map(row_to_key).collect()
}

#[tauri::command]
pub async fn create_ssh_key(state: State<'_, AppState>, payload: SshKeyPayload) -> Result<SshKey> {
    validate_key_payload(&payload)?;

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO ssh_keys (id, name, key_path, public_key, fingerprint, encrypted)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(payload.name.trim())
    .bind(payload.key_path.trim())
    .bind(payload.public_key)
    .bind(payload.fingerprint)
    .bind(if payload.encrypted.unwrap_or(true) {
        1_i64
    } else {
        0_i64
    })
    .execute(&state.pool)
    .await?;

    get_key(&state, id).await
}

#[tauri::command]
pub async fn update_ssh_key(
    state: State<'_, AppState>,
    id: String,
    payload: SshKeyPayload,
) -> Result<SshKey> {
    validate_key_payload(&payload)?;

    let result = sqlx::query(
        r#"
        UPDATE ssh_keys
        SET name = ?,
            key_path = ?,
            public_key = ?,
            fingerprint = ?,
            encrypted = ?,
            updated_at = datetime('now')
        WHERE id = ?
        "#,
    )
    .bind(payload.name.trim())
    .bind(payload.key_path.trim())
    .bind(payload.public_key)
    .bind(payload.fingerprint)
    .bind(if payload.encrypted.unwrap_or(true) {
        1_i64
    } else {
        0_i64
    })
    .bind(&id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("ssh key {id}")));
    }

    get_key(&state, id).await
}

#[tauri::command]
pub async fn delete_ssh_key(state: State<'_, AppState>, id: String) -> Result<()> {
    sqlx::query("DELETE FROM ssh_keys WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

fn validate_key_payload(payload: &SshKeyPayload) -> Result<()> {
    if payload.name.trim().is_empty() {
        return Err(AppError::InvalidInput("key name is required".into()));
    }
    if payload.key_path.trim().is_empty() {
        return Err(AppError::InvalidInput("key path is required".into()));
    }
    Ok(())
}

async fn get_key(state: &State<'_, AppState>, id: String) -> Result<SshKey> {
    let row = sqlx::query(
        r#"
        SELECT id, name, key_path, public_key, fingerprint, encrypted, created_at, updated_at
        FROM ssh_keys
        WHERE id = ?
        "#,
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(row) => row_to_key(row),
        None => Err(AppError::NotFound(format!("ssh key {id}"))),
    }
}

fn row_to_key(row: SqliteRow) -> Result<SshKey> {
    let encrypted: i64 = row.try_get("encrypted")?;
    Ok(SshKey {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        key_path: row.try_get("key_path")?,
        public_key: row.try_get("public_key")?,
        fingerprint: row.try_get("fingerprint")?,
        encrypted: encrypted != 0,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
