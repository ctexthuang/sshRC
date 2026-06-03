use std::fs;

use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tauri::{AppHandle, Manager};

use crate::error::Result;

pub async fn connect(app: &AppHandle) -> Result<SqlitePool> {
    let data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("sshcr.sqlite");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect(&db_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
