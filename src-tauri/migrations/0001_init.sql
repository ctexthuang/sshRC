CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'agent',
  key_path TEXT,
  key_alias TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  os TEXT,
  last_connected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_connections_updated_at ON connections(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_favorite ON connections(favorite DESC);

CREATE TABLE IF NOT EXISTS ssh_keys (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  key_path TEXT NOT NULL,
  public_key TEXT,
  fingerprint TEXT,
  encrypted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  connection_id TEXT,
  connection_name TEXT,
  detail TEXT,
  bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(connection_id) REFERENCES connections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at DESC);
