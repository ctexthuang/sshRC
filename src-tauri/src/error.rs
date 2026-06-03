use serde::ser::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("database migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("ssh error: {0}")]
    Ssh2(#[from] ssh2::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("task error: {0}")]
    Task(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("credentials required: {0}")]
    CredentialsRequired(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
