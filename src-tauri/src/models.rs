use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    #[serde(skip_serializing, default)]
    pub saved_password: Option<String>,
    pub key_path: Option<String>,
    pub key_alias: Option<String>,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub notes: String,
    pub os: Option<String>,
    pub last_connected_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionPayload {
    pub name: Option<String>,
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub auth_type: String,
    pub key_path: Option<String>,
    pub key_alias: Option<String>,
    pub favorite: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestRequest {
    pub connection_id: Option<String>,
    pub name: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub key_path: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub os: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub kind: String,
    pub connection_id: Option<String>,
    pub connection_name: Option<String>,
    pub detail: Option<String>,
    pub bytes: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    pub id: String,
    pub name: String,
    pub key_path: String,
    pub public_key: Option<String>,
    pub fingerprint: Option<String>,
    pub encrypted: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyPayload {
    pub name: String,
    pub key_path: String,
    pub public_key: Option<String>,
    pub fingerprint: Option<String>,
    pub encrypted: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub total_hosts: i64,
    pub active_sessions: usize,
    pub transfers_today: i64,
    pub transfer_bytes_today: i64,
    pub recent_connections: Vec<Connection>,
    pub recent_activity: Vec<Activity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpListRequest {
    pub connection_id: String,
    pub path: String,
    pub password: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpCreateDirectoryRequest {
    pub connection_id: String,
    pub path: String,
    pub password: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpDeleteRequest {
    pub connection_id: String,
    pub paths: Vec<String>,
    pub password: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpUploadRequest {
    pub connection_id: String,
    pub local_path: String,
    pub remote_path: String,
    pub password: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpDownloadRequest {
    pub connection_id: String,
    pub remote_path: String,
    pub local_path: String,
    pub password: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpTransferResult {
    pub path: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub entry_type: String,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub permissions: String,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStartRequest {
    pub connection_id: String,
    pub cols: Option<u32>,
    pub rows: Option<u32>,
    pub password: Option<String>,
    pub passphrase: Option<String>,
    pub keep_alive: Option<bool>,
    pub keep_alive_interval: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConnectionPasswordRequest {
    pub connection_id: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub connection_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalConnected {
    pub session_id: String,
    pub connection_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExit {
    pub session_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataImportRequest {
    pub path: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataExportRequest {
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataImportResult {
    pub format: String,
    pub connections_imported: usize,
    pub ssh_keys_imported: usize,
    pub skipped: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataExportResult {
    pub format: String,
    pub connections_exported: usize,
    pub ssh_keys_exported: usize,
    pub content: String,
    pub path: Option<String>,
}
