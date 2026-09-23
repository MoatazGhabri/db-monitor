CREATE TABLE IF NOT EXISTS db_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'mysql',
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 3306,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL DEFAULT '',
  ssl_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'offline',
  tables_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  last_connected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cloud_drives (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  connected INTEGER NOT NULL DEFAULT 0,
  storage_used_bytes INTEGER NOT NULL DEFAULT 0,
  storage_total_bytes INTEGER NOT NULL DEFAULT 0,
  folder TEXT NOT NULL DEFAULT '',
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_schedules (
  id TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES db_connections(id) ON DELETE CASCADE,
  drive_id TEXT REFERENCES cloud_drives(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL DEFAULT 'daily',
  cron_expression TEXT NOT NULL DEFAULT '0 3 * * *',
  time TEXT NOT NULL DEFAULT '03:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  retention_count INTEGER NOT NULL DEFAULT 2,
  retention_unit TEXT NOT NULL DEFAULT 'backups',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  backups_kept INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS query_history (
  id TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES db_connections(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  rows_affected INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  executed_by TEXT NOT NULL DEFAULT 'system',
  executed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qh_conn ON query_history(connection_id);
CREATE INDEX IF NOT EXISTS idx_qh_time ON query_history(executed_at DESC);


-- ---------- Platform settings (profile, notifications, preferences) ----------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------- Backups (real dump files produced by the platform) ----------
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES db_connections(id) ON DELETE SET NULL,
  connection_name TEXT NOT NULL DEFAULT '',
  schedule_id TEXT REFERENCES backup_schedules(id) ON DELETE SET NULL,
  drive_id TEXT REFERENCES cloud_drives(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  local_path TEXT,
  remote_name TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  tables_count INTEGER NOT NULL DEFAULT 0,
  rows_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  error TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_backups_time ON backups(created_at DESC);

-- ---------- Import / export jobs ----------
CREATE TABLE IF NOT EXISTS io_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  connection_id TEXT REFERENCES db_connections(id) ON DELETE SET NULL,
  connection_name TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  rows_count INTEGER NOT NULL DEFAULT 0,
  statements_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_time ON io_jobs(created_at DESC);
