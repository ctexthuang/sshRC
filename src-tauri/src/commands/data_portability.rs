use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager, State};

use crate::{
    error::{AppError, Result},
    models::{
        Connection, DataExportRequest, DataExportResult, DataImportRequest, DataImportResult,
        SshKey,
    },
    private_key::{normalize_private_key_content, private_key_is_encrypted},
    state::AppState,
};

const SSHCR_EXPORT_FORMAT: &str = "sshcr.portable.v1";

#[tauri::command]
pub async fn export_data(
    state: State<'_, AppState>,
    request: DataExportRequest,
) -> Result<DataExportResult> {
    let connections = export_connections(&state.pool).await?;
    let ssh_keys = export_ssh_keys(&state.pool).await?;
    let bundle = SshcrExportBundle {
        format: SSHCR_EXPORT_FORMAT.into(),
        app: "sshRC".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        exported_at: current_timestamp(),
        connections,
        ssh_keys,
    };
    let content = serde_json::to_string_pretty(&bundle)?;
    let path = request.path.and_then(non_empty);

    if let Some(path) = path.as_deref() {
        write_text_file(path, &content)?;
    }

    Ok(DataExportResult {
        format: SSHCR_EXPORT_FORMAT.into(),
        connections_exported: bundle.connections.len(),
        ssh_keys_exported: bundle.ssh_keys.len(),
        content,
        path,
    })
}

#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    state: State<'_, AppState>,
    request: DataImportRequest,
) -> Result<DataImportResult> {
    let content = match (
        request.content.and_then(non_empty),
        request.path.and_then(non_empty),
    ) {
        (Some(content), _) => content,
        (None, Some(path)) => fs::read_to_string(expand_home(&path))?,
        (None, None) => {
            return Err(AppError::InvalidInput(
                "import content or file path is required".into(),
            ))
        }
    };

    let value: Value = serde_json::from_str(&content)?;
    if is_termora_export(&value) {
        import_termora(&app, &state.pool, value).await
    } else if is_sshcr_export(&value) {
        let bundle: SshcrExportBundle = serde_json::from_value(value)?;
        import_sshcr_bundle(&state.pool, bundle).await
    } else {
        Err(AppError::InvalidInput(
            "unsupported import format: expected sshRC or Termora JSON".into(),
        ))
    }
}

async fn import_sshcr_bundle(
    pool: &SqlitePool,
    bundle: SshcrExportBundle,
) -> Result<DataImportResult> {
    let mut result = DataImportResult {
        format: bundle.format,
        connections_imported: 0,
        ssh_keys_imported: 0,
        skipped: 0,
        warnings: Vec::new(),
    };

    for key in bundle.ssh_keys {
        let exists = ssh_key_exists(pool, &key.name, &key.key_path).await?;
        if exists {
            result.skipped += 1;
            continue;
        }
        insert_ssh_key(
            pool,
            SshKeyDraft {
                name: key.name,
                key_path: key.key_path,
                public_key: key.public_key,
                fingerprint: key.fingerprint,
                encrypted: key.encrypted,
            },
        )
        .await?;
        result.ssh_keys_imported += 1;
    }

    for connection in bundle.connections {
        let exists = connection_exists(
            pool,
            &connection.host,
            connection.port,
            &connection.username,
        )
        .await?;
        if exists {
            result.skipped += 1;
            continue;
        }
        insert_connection(
            pool,
            ConnectionDraft {
                name: connection.name,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                auth_type: normalize_auth_type(&connection.auth_type),
                key_path: connection.key_path,
                key_alias: connection.key_alias,
                favorite: connection.favorite,
                tags: connection.tags,
                notes: connection.notes,
            },
        )
        .await?;
        result.connections_imported += 1;
    }

    Ok(result)
}

async fn import_termora(
    app: &AppHandle,
    pool: &SqlitePool,
    value: Value,
) -> Result<DataImportResult> {
    let export: TermoraExport = serde_json::from_value(value)?;
    let key_dir = app
        .path()
        .app_data_dir()?
        .join("imported_keys")
        .join("termora");
    fs::create_dir_all(&key_dir)?;

    let mut result = DataImportResult {
        format: "termora".into(),
        connections_imported: 0,
        ssh_keys_imported: 0,
        skipped: 0,
        warnings: Vec::new(),
    };

    let folders = export
        .hosts
        .iter()
        .filter(|host| host.protocol.eq_ignore_ascii_case("Folder"))
        .filter_map(|host| host.id.as_ref().zip(host.name.as_ref()))
        .map(|(id, name)| (id.clone(), name.clone()))
        .collect::<HashMap<_, _>>();

    let mut key_aliases_by_termora_id = HashMap::new();
    let mut used_key_filenames = HashSet::new();

    for key_pair in export.key_pairs {
        let Some(name) = key_pair.name.or(key_pair.remark).and_then(non_empty) else {
            result.skipped += 1;
            result
                .warnings
                .push("skipped a Termora key pair without name".into());
            continue;
        };

        let private_key = key_pair
            .private_key
            .as_deref()
            .and_then(normalize_private_key_content);
        let encrypted = private_key
            .as_deref()
            .map(private_key_is_encrypted)
            .unwrap_or(false);
        let key_path = if let Some(private_key) = private_key.as_deref() {
            let filename =
                unique_key_filename(&mut used_key_filenames, &name, key_pair.r#type.as_deref());
            let path = key_dir.join(filename);
            write_private_key(&path, private_key)?;
            path.to_string_lossy().to_string()
        } else {
            if key_pair
                .private_key
                .as_ref()
                .and_then(|value| non_empty(value.clone()))
                .is_some()
            {
                result.warnings.push(format!(
                    "Termora key pair {name} uses an unsupported private-key format; edit the SSH key and choose a local private key file"
                ));
            }
            format!("termora://key-pairs/{}", key_pair.id)
        };

        key_aliases_by_termora_id.insert(key_pair.id.clone(), name.clone());

        if ssh_key_exists(pool, &name, &key_path).await? {
            result.skipped += 1;
            continue;
        }

        insert_ssh_key(
            pool,
            SshKeyDraft {
                name,
                key_path,
                public_key: key_pair.public_key.and_then(non_empty),
                fingerprint: None,
                encrypted,
            },
        )
        .await?;
        result.ssh_keys_imported += 1;
    }

    for host in export.hosts {
        if !host.protocol.eq_ignore_ascii_case("SSH") {
            continue;
        }

        let Some(hostname) = host.host.and_then(non_empty) else {
            result.skipped += 1;
            result
                .warnings
                .push("skipped a Termora SSH host without host address".into());
            continue;
        };
        let Some(username) = host.username.and_then(non_empty) else {
            result.skipped += 1;
            result
                .warnings
                .push("skipped a Termora SSH host without username".into());
            continue;
        };
        let port = host.port.unwrap_or(22);
        if port == 0 {
            result.skipped += 1;
            result.warnings.push(format!(
                "skipped Termora host {} because port is 0",
                display_name(host.name.as_deref(), &hostname)
            ));
            continue;
        }

        if connection_exists(pool, &hostname, port, &username).await? {
            result.skipped += 1;
            continue;
        }

        let auth_type = host
            .authentication
            .as_ref()
            .and_then(|auth| auth.r#type.as_deref())
            .map(termora_auth_type)
            .unwrap_or("agent")
            .to_string();

        let key_alias = if auth_type == "key" {
            host.authentication
                .as_ref()
                .and_then(|auth| auth.password.as_ref())
                .and_then(|id| key_aliases_by_termora_id.get(id))
                .cloned()
        } else {
            None
        };

        if auth_type == "key" && key_alias.is_none() {
            result.warnings.push(format!(
                "imported {} as key auth but did not find its Termora key pair",
                display_name(host.name.as_deref(), &hostname)
            ));
        }
        if auth_type == "password" {
            result.warnings.push(format!(
                "imported {} without saving Termora password",
                display_name(host.name.as_deref(), &hostname)
            ));
        }

        let mut tags = Vec::new();
        if let Some(parent_id) = host.parent_id.as_ref() {
            if let Some(folder_name) = folders
                .get(parent_id)
                .and_then(|name| non_empty(name.clone()))
            {
                tags.push(folder_name);
            }
        }
        tags.push("Termora".into());
        tags.sort();
        tags.dedup();

        insert_connection(
            pool,
            ConnectionDraft {
                name: host
                    .name
                    .and_then(non_empty)
                    .unwrap_or_else(|| hostname.clone()),
                host: hostname,
                port,
                username,
                auth_type,
                key_path: None,
                key_alias,
                favorite: false,
                tags,
                notes: "Imported from Termora".into(),
            },
        )
        .await?;
        result.connections_imported += 1;
    }

    Ok(result)
}

async fn export_connections(pool: &SqlitePool) -> Result<Vec<Connection>> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, host, port, username, auth_type, key_path, key_alias,
               favorite, tags, notes, os, last_connected_at, created_at, updated_at
        FROM connections
        ORDER BY favorite DESC, COALESCE(last_connected_at, updated_at) DESC, name ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
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
                saved_password: None,
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
        })
        .collect()
}

async fn export_ssh_keys(pool: &SqlitePool) -> Result<Vec<SshKey>> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, key_path, public_key, fingerprint, encrypted, created_at, updated_at
        FROM ssh_keys
        ORDER BY updated_at DESC, name ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
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
        })
        .collect()
}

async fn insert_connection(pool: &SqlitePool, draft: ConnectionDraft) -> Result<()> {
    let tags = serde_json::to_string(&draft.tags)?;
    sqlx::query(
        r#"
        INSERT INTO connections (
          id, name, host, port, username, auth_type, key_path, key_alias,
          favorite, tags, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(draft.name.trim())
    .bind(draft.host.trim())
    .bind(i64::from(draft.port))
    .bind(draft.username.trim())
    .bind(normalize_auth_type(&draft.auth_type))
    .bind(trim_option(draft.key_path))
    .bind(trim_option(draft.key_alias))
    .bind(if draft.favorite { 1_i64 } else { 0_i64 })
    .bind(tags)
    .bind(draft.notes)
    .execute(pool)
    .await?;
    Ok(())
}

async fn insert_ssh_key(pool: &SqlitePool, draft: SshKeyDraft) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO ssh_keys (id, name, key_path, public_key, fingerprint, encrypted)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(draft.name.trim())
    .bind(draft.key_path.trim())
    .bind(trim_option(draft.public_key))
    .bind(trim_option(draft.fingerprint))
    .bind(if draft.encrypted { 1_i64 } else { 0_i64 })
    .execute(pool)
    .await?;
    Ok(())
}

async fn connection_exists(
    pool: &SqlitePool,
    host: &str,
    port: u16,
    username: &str,
) -> Result<bool> {
    let count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM connections WHERE host = ? AND port = ? AND username = ?",
    )
    .bind(host.trim())
    .bind(i64::from(port))
    .bind(username.trim())
    .fetch_one(pool)
    .await?;
    Ok(count.0 > 0)
}

async fn ssh_key_exists(pool: &SqlitePool, name: &str, key_path: &str) -> Result<bool> {
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM ssh_keys WHERE name = ? OR key_path = ?")
            .bind(name.trim())
            .bind(key_path.trim())
            .fetch_one(pool)
            .await?;
    Ok(count.0 > 0)
}

fn is_termora_export(value: &Value) -> bool {
    value
        .get("exporter")
        .and_then(Value::as_str)
        .map(|exporter| exporter.to_lowercase().contains("termora"))
        .unwrap_or(false)
        || value.get("keyPairs").is_some()
}

fn is_sshcr_export(value: &Value) -> bool {
    value
        .get("format")
        .and_then(Value::as_str)
        .map(|format| format == SSHCR_EXPORT_FORMAT)
        .unwrap_or(false)
}

fn termora_auth_type(value: &str) -> &'static str {
    match value.to_ascii_lowercase().as_str() {
        "password" => "password",
        "publickey" | "key" | "privatekey" => "key",
        _ => "agent",
    }
}

fn normalize_auth_type(value: &str) -> String {
    match value {
        "password" | "key" | "agent" => value.into(),
        other => termora_auth_type(other).into(),
    }
}

fn current_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn trim_option(value: Option<String>) -> Option<String> {
    value.and_then(non_empty)
}

fn display_name(name: Option<&str>, host: &str) -> String {
    name.and_then(|value| non_empty(value.to_string()))
        .unwrap_or_else(|| host.to_string())
}

fn write_text_file(path: &str, content: &str) -> Result<()> {
    let path = PathBuf::from(expand_home(path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    Ok(())
}

fn write_private_key(path: &PathBuf, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    set_private_key_permissions(path)?;
    Ok(())
}

#[cfg(unix)]
fn set_private_key_permissions(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o600);
    fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_key_permissions(_path: &PathBuf) -> Result<()> {
    Ok(())
}

fn expand_home(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest).to_string_lossy().to_string();
        }
    }
    path.to_string()
}

fn unique_key_filename(used: &mut HashSet<String>, name: &str, key_type: Option<&str>) -> String {
    let base = sanitize_filename(name);
    let suffix = key_type
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "key".into());
    let mut candidate = format!("{base}_{suffix}");
    let mut counter = 2;
    while used.contains(&candidate) {
        candidate = format!("{base}_{suffix}_{counter}");
        counter += 1;
    }
    used.insert(candidate.clone());
    candidate
}

fn sanitize_filename(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        "termora_key".into()
    } else {
        sanitized
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SshcrExportBundle {
    format: String,
    app: String,
    version: String,
    exported_at: String,
    connections: Vec<Connection>,
    ssh_keys: Vec<SshKey>,
}

#[derive(Debug)]
struct ConnectionDraft {
    name: String,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    key_path: Option<String>,
    key_alias: Option<String>,
    favorite: bool,
    tags: Vec<String>,
    notes: String,
}

#[derive(Debug)]
struct SshKeyDraft {
    name: String,
    key_path: String,
    public_key: Option<String>,
    fingerprint: Option<String>,
    encrypted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TermoraExport {
    #[serde(default)]
    hosts: Vec<TermoraHost>,
    #[serde(default)]
    key_pairs: Vec<TermoraKeyPair>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TermoraHost {
    id: Option<String>,
    name: Option<String>,
    protocol: String,
    parent_id: Option<String>,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    authentication: Option<TermoraAuthentication>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TermoraAuthentication {
    r#type: Option<String>,
    password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TermoraKeyPair {
    id: String,
    name: Option<String>,
    public_key: Option<String>,
    private_key: Option<String>,
    r#type: Option<String>,
    remark: Option<String>,
}
