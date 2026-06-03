use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use tauri::State;

use crate::{
    error::{AppError, Result},
    models::{
        Activity, Connection, ConnectionPayload, ConnectionTestRequest, DashboardSummary,
        SaveConnectionPasswordRequest, TestConnectionResult,
    },
    ssh,
    state::AppState,
};

#[tauri::command]
pub async fn list_connections(state: State<'_, AppState>) -> Result<Vec<Connection>> {
    list_connections_from_pool(&state.pool).await
}

#[tauri::command]
pub async fn get_connection(state: State<'_, AppState>, id: String) -> Result<Connection> {
    get_connection_from_pool(&state.pool, &id).await
}

#[tauri::command]
pub async fn create_connection(
    state: State<'_, AppState>,
    payload: ConnectionPayload,
) -> Result<Connection> {
    validate_connection_payload(&payload)?;

    let id = uuid::Uuid::new_v4().to_string();
    let name = payload
        .name
        .clone()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| payload.host.clone());
    let tags = serde_json::to_string(&payload.tags.unwrap_or_default())?;
    let auth_type = payload.auth_type.clone();

    sqlx::query(
        r#"
        INSERT INTO connections (
          id, name, host, port, username, auth_type, key_path, key_alias,
          favorite, tags, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(name)
    .bind(payload.host.trim())
    .bind(i64::from(payload.port.unwrap_or(22)))
    .bind(payload.username.trim())
    .bind(&auth_type)
    .bind(payload.key_path)
    .bind(payload.key_alias)
    .bind(if payload.favorite.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(tags)
    .bind(payload.notes.unwrap_or_default())
    .execute(&state.pool)
    .await?;

    get_connection_from_pool(&state.pool, &id).await
}

#[tauri::command]
pub async fn update_connection(
    state: State<'_, AppState>,
    id: String,
    payload: ConnectionPayload,
) -> Result<Connection> {
    validate_connection_payload(&payload)?;

    let name = payload
        .name
        .clone()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| payload.host.clone());
    let tags = serde_json::to_string(&payload.tags.unwrap_or_default())?;
    let auth_type = payload.auth_type.clone();

    let result = sqlx::query(
        r#"
        UPDATE connections
        SET name = ?,
            host = ?,
            port = ?,
            username = ?,
            auth_type = ?,
            key_path = ?,
            key_alias = ?,
            favorite = ?,
            tags = ?,
            notes = ?,
            saved_password = CASE WHEN ? = 'password' THEN saved_password ELSE NULL END,
            updated_at = datetime('now')
        WHERE id = ?
        "#,
    )
    .bind(name)
    .bind(payload.host.trim())
    .bind(i64::from(payload.port.unwrap_or(22)))
    .bind(payload.username.trim())
    .bind(&auth_type)
    .bind(payload.key_path)
    .bind(payload.key_alias)
    .bind(if payload.favorite.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(tags)
    .bind(payload.notes.unwrap_or_default())
    .bind(&auth_type)
    .bind(&id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("connection {id}")));
    }

    get_connection_from_pool(&state.pool, &id).await
}

#[tauri::command]
pub async fn delete_connection(state: State<'_, AppState>, id: String) -> Result<()> {
    sqlx::query("DELETE FROM connections WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn save_connection_password(
    state: State<'_, AppState>,
    request: SaveConnectionPasswordRequest,
) -> Result<()> {
    let password = request.password.trim_end_matches(['\r', '\n']);
    if password.is_empty() {
        return Err(AppError::InvalidInput("password is required".into()));
    }

    let result = sqlx::query(
        r#"
        UPDATE connections
        SET saved_password = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND auth_type = 'password'
        "#,
    )
    .bind(password)
    .bind(&request.connection_id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "password connection {}",
            request.connection_id
        )));
    }

    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    request: ConnectionTestRequest,
) -> Result<TestConnectionResult> {
    let result = ssh::test_connection(request.clone()).await?;

    if result.ok {
        if let Some(connection_id) = request.connection_id {
            sqlx::query(
                r#"
                UPDATE connections
                SET last_connected_at = datetime('now'),
                    os = COALESCE(NULLIF(?, ''), os),
                    updated_at = datetime('now')
                WHERE id = ?
                "#,
            )
            .bind(result.os.clone().unwrap_or_default())
            .bind(connection_id)
            .execute(&state.pool)
            .await?;
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn dashboard_summary(state: State<'_, AppState>) -> Result<DashboardSummary> {
    let total_hosts: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM connections")
        .fetch_one(&state.pool)
        .await?;

    let transfers_today: (i64, Option<i64>) = sqlx::query_as(
        r#"
        SELECT COUNT(*), COALESCE(SUM(bytes), 0)
        FROM activity
        WHERE kind IN ('upload', 'download')
          AND date(created_at) = date('now')
        "#,
    )
    .fetch_one(&state.pool)
    .await?;

    let recent_connections = recent_connections_from_pool(&state.pool, 6).await?;
    let recent_activity = recent_activity_from_pool(&state.pool, 8).await?;

    Ok(DashboardSummary {
        total_hosts: total_hosts.0,
        active_sessions: state.sessions.count(),
        transfers_today: transfers_today.0,
        transfer_bytes_today: transfers_today.1.unwrap_or(0),
        recent_connections,
        recent_activity,
    })
}

pub async fn get_connection_from_pool(pool: &SqlitePool, id: &str) -> Result<Connection> {
    let row = sqlx::query(
        r#"
        SELECT id, name, host, port, username, auth_type, saved_password, key_path, key_alias,
               favorite, tags, notes, os, last_connected_at, created_at, updated_at
        FROM connections
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(row) => {
            let mut connection = row_to_connection(row)?;
            resolve_key_path(pool, &mut connection).await?;
            Ok(connection)
        }
        None => Err(AppError::NotFound(format!("connection {id}"))),
    }
}

async fn list_connections_from_pool(pool: &SqlitePool) -> Result<Vec<Connection>> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, host, port, username, auth_type, saved_password, key_path, key_alias,
               favorite, tags, notes, os, last_connected_at, created_at, updated_at
        FROM connections
        ORDER BY favorite DESC, COALESCE(last_connected_at, updated_at) DESC, name ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(row_to_connection).collect()
}

async fn recent_connections_from_pool(pool: &SqlitePool, limit: i64) -> Result<Vec<Connection>> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, host, port, username, auth_type, saved_password, key_path, key_alias,
               favorite, tags, notes, os, last_connected_at, created_at, updated_at
        FROM connections
        ORDER BY COALESCE(last_connected_at, updated_at) DESC, favorite DESC
        LIMIT ?
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(row_to_connection).collect()
}

async fn recent_activity_from_pool(pool: &SqlitePool, limit: i64) -> Result<Vec<Activity>> {
    let rows = sqlx::query(
        r#"
        SELECT id, kind, connection_id, connection_name, detail, bytes, created_at
        FROM activity
        ORDER BY created_at DESC
        LIMIT ?
        "#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(Activity {
                id: row.try_get("id")?,
                kind: row.try_get("kind")?,
                connection_id: row.try_get("connection_id")?,
                connection_name: row.try_get("connection_name")?,
                detail: row.try_get("detail")?,
                bytes: row.try_get("bytes")?,
                created_at: row.try_get("created_at")?,
            })
        })
        .collect()
}

fn row_to_connection(row: SqliteRow) -> Result<Connection> {
    let tags_json: String = row.try_get("tags")?;
    let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
    let port: i64 = row.try_get("port")?;
    let favorite: i64 = row.try_get("favorite")?;

    Ok(Connection {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        host: row.try_get("host")?,
        port: port as u16,
        username: row.try_get("username")?,
        auth_type: row.try_get("auth_type")?,
        saved_password: row.try_get("saved_password")?,
        key_path: row.try_get("key_path")?,
        key_alias: row.try_get("key_alias")?,
        favorite: favorite != 0,
        tags,
        notes: row.try_get("notes")?,
        os: row.try_get("os")?,
        last_connected_at: row.try_get("last_connected_at")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn validate_connection_payload(payload: &ConnectionPayload) -> Result<()> {
    if payload.host.trim().is_empty() {
        return Err(AppError::InvalidInput("host is required".into()));
    }
    if payload.username.trim().is_empty() {
        return Err(AppError::InvalidInput("username is required".into()));
    }
    if payload.port.unwrap_or(22) == 0 {
        return Err(AppError::InvalidInput("port must be greater than 0".into()));
    }
    if !["agent", "password", "key"].contains(&payload.auth_type.as_str()) {
        return Err(AppError::InvalidInput("unsupported auth type".into()));
    }
    Ok(())
}

async fn resolve_key_path(pool: &SqlitePool, connection: &mut Connection) -> Result<()> {
    if connection.auth_type != "key" || connection.key_path.is_some() {
        return Ok(());
    }

    let Some(alias) = connection.key_alias.as_deref() else {
        return Ok(());
    };

    let key_path: Option<(String,)> =
        sqlx::query_as("SELECT key_path FROM ssh_keys WHERE name = ? LIMIT 1")
            .bind(alias)
            .fetch_optional(pool)
            .await?;

    if let Some((path,)) = key_path {
        connection.key_path = Some(path);
    }

    Ok(())
}
