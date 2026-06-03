use std::{
    collections::HashMap,
    sync::{mpsc::Sender, Arc, Mutex},
};

use sqlx::SqlitePool;
use tauri::AppHandle;

use crate::{
    database,
    error::{AppError, Result},
};

pub struct AppState {
    pub pool: SqlitePool,
    pub sessions: SessionRegistry,
}

impl AppState {
    pub async fn initialize(app: &AppHandle) -> Result<Self> {
        let pool = database::connect(app).await?;

        Ok(Self {
            pool,
            sessions: SessionRegistry::default(),
        })
    }
}

#[derive(Clone, Default)]
pub struct SessionRegistry {
    inner: Arc<Mutex<HashMap<String, TerminalHandle>>>,
}

pub struct TerminalHandle {
    stdin: Sender<String>,
}

impl TerminalHandle {
    pub fn new(stdin: Sender<String>) -> Self {
        Self { stdin }
    }
}

impl SessionRegistry {
    pub fn insert(&self, id: String, handle: TerminalHandle) -> Result<()> {
        let mut sessions = self.lock()?;
        sessions.insert(id, handle);
        Ok(())
    }

    pub fn write(&self, id: &str, data: String) -> Result<()> {
        let sessions = self.lock()?;
        let handle = sessions
            .get(id)
            .ok_or_else(|| AppError::NotFound(format!("terminal session {id}")))?;
        handle
            .stdin
            .send(data)
            .map_err(|err| AppError::Task(err.to_string()))
    }

    pub fn remove(&self, id: &str) -> Result<()> {
        let mut sessions = self.lock()?;
        sessions.remove(id);
        Ok(())
    }

    pub fn count(&self) -> usize {
        self.inner
            .lock()
            .map(|sessions| sessions.len())
            .unwrap_or(0)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, HashMap<String, TerminalHandle>>> {
        self.inner
            .lock()
            .map_err(|err| AppError::Task(format!("session registry poisoned: {err}")))
    }
}
