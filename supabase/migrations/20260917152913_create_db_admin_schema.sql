/*
# DBHub Admin Platform — Core Schema

Creates the metadata tables that power the database administration platform.
These tables store configuration (database connections, cloud drives, backup schedules)
and audit data (query history). The actual user databases are NOT stored here —
they are connected to remotely via the db-proxy edge function.

## New Tables

1. `db_connections` — Stores connection details for each real database server
   (MySQL, PostgreSQL, MariaDB, etc.) that the platform manages.
2. `cloud_drives` — Stores connected cloud storage providers for backups.
3. `backup_schedules` — Automated backup configurations with cron + retention.
4. `query_history` — Audit log of SQL queries executed through the platform.

## Security

- RLS enabled on all tables.
- Single-tenant admin tool: policies allow anon + authenticated CRUD.
- In production, add Supabase Auth and scope to authenticated users.
*/

-- 1. db_connections
CREATE TABLE IF NOT EXISTS db_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  engine text NOT NULL DEFAULT 'mysql',
  host text NOT NULL,
  port int NOT NULL DEFAULT 3306,
  database_name text NOT NULL,
  username text NOT NULL,
  password_encrypted text NOT NULL DEFAULT '',
  ssl_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'offline',
  tables_count int NOT NULL DEFAULT 0,
  size_bytes bigint NOT NULL DEFAULT 0,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE db_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_connections" ON db_connections;
CREATE POLICY "anon_select_connections" ON db_connections FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_connections" ON db_connections;
CREATE POLICY "anon_insert_connections" ON db_connections FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_connections" ON db_connections;
CREATE POLICY "anon_update_connections" ON db_connections FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_connections" ON db_connections;
CREATE POLICY "anon_delete_connections" ON db_connections FOR DELETE
  TO anon, authenticated USING (true);

-- 2. cloud_drives
CREATE TABLE IF NOT EXISTS cloud_drives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  label text NOT NULL,
  email text NOT NULL DEFAULT '',
  connected boolean NOT NULL DEFAULT false,
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  storage_total_bytes bigint NOT NULL DEFAULT 0,
  folder text NOT NULL DEFAULT '',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cloud_drives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_drives" ON cloud_drives;
CREATE POLICY "anon_select_drives" ON cloud_drives FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_drives" ON cloud_drives;
CREATE POLICY "anon_insert_drives" ON cloud_drives FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_drives" ON cloud_drives;
CREATE POLICY "anon_update_drives" ON cloud_drives FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_drives" ON cloud_drives;
CREATE POLICY "anon_delete_drives" ON cloud_drives FOR DELETE
  TO anon, authenticated USING (true);

-- 3. backup_schedules
CREATE TABLE IF NOT EXISTS backup_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES db_connections(id) ON DELETE CASCADE,
  drive_id uuid REFERENCES cloud_drives(id) ON DELETE SET NULL,
  frequency text NOT NULL DEFAULT 'daily',
  cron_expression text NOT NULL DEFAULT '0 3 * * *',
  time text NOT NULL DEFAULT '03:00',
  timezone text NOT NULL DEFAULT 'UTC',
  retention_count int NOT NULL DEFAULT 2,
  retention_unit text NOT NULL DEFAULT 'backups',
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  backups_kept int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE backup_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_schedules" ON backup_schedules;
CREATE POLICY "anon_select_schedules" ON backup_schedules FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_schedules" ON backup_schedules;
CREATE POLICY "anon_insert_schedules" ON backup_schedules FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_schedules" ON backup_schedules;
CREATE POLICY "anon_update_schedules" ON backup_schedules FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_schedules" ON backup_schedules;
CREATE POLICY "anon_delete_schedules" ON backup_schedules FOR DELETE
  TO anon, authenticated USING (true);

-- 4. query_history
CREATE TABLE IF NOT EXISTS query_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES db_connections(id) ON DELETE CASCADE,
  query text NOT NULL,
  duration_ms int NOT NULL DEFAULT 0,
  rows_affected int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  executed_by text NOT NULL DEFAULT 'system',
  executed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE query_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_history" ON query_history;
CREATE POLICY "anon_select_history" ON query_history FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_history" ON query_history;
CREATE POLICY "anon_insert_history" ON query_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_history" ON query_history;
CREATE POLICY "anon_update_history" ON query_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_history" ON query_history;
CREATE POLICY "anon_delete_history" ON query_history FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_backup_schedules_connection ON backup_schedules(connection_id);
CREATE INDEX IF NOT EXISTS idx_query_history_connection ON query_history(connection_id);
CREATE INDEX IF NOT EXISTS idx_query_history_executed_at ON query_history(executed_at DESC);
