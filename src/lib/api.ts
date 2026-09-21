import { supabase, callEdgeFunction, STORAGE_MODE, LOCAL_API_URL } from '@/lib/supabase';

/* ---------- Types ---------- */
export interface DbConnection {
  id: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password_encrypted: string;
  ssl_enabled: boolean;
  status: string;
  tables_count: number;
  size_bytes: number;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudDrive {
  id: string;
  provider: string;
  label: string;
  email: string;
  connected: boolean;
  storage_used_bytes: number;
  storage_total_bytes: number;
  folder: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupSchedule {
  id: string;
  connection_id: string;
  drive_id: string | null;
  frequency: string;
  cron_expression: string;
  time: string;
  timezone: string;
  retention_count: number;
  retention_unit: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  backups_kept: number;
  created_at: string;
  updated_at: string;
}

export interface QueryHistoryEntry {
  id: string;
  connection_id: string;
  query: string;
  duration_ms: number;
  rows_affected: number;
  status: string;
  executed_by: string;
  executed_at: string;
}

export interface QueryResult {
  success: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  rowsAffected: number;
  durationMs: number;
  executedAt: string;
}

/* ---------- Local API helpers ---------- */
async function localGet(path: string) {
  const r = await fetch(`${LOCAL_API_URL}${path}`);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}
async function localPost(path: string, body: unknown) {
  const r = await fetch(`${LOCAL_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}
async function localPut(path: string, body: unknown) {
  const r = await fetch(`${LOCAL_API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}
async function localDelete(path: string) {
  const r = await fetch(`${LOCAL_API_URL}${path}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}

/* ---------- Connections ---------- */
export async function fetchConnections(): Promise<DbConnection[]> {
  if (STORAGE_MODE === 'local') return localGet('/connections');
  const { data, error } = await supabase!.from('db_connections').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbConnection[];
}

export async function createConnection(conn: Omit<DbConnection, 'id' | 'created_at' | 'updated_at' | 'last_connected_at' | 'status' | 'tables_count' | 'size_bytes'>): Promise<DbConnection> {
  if (STORAGE_MODE === 'local') return localPost('/connections', { ...conn, ssl_enabled: conn.ssl_enabled ? 1 : 0 });
  const { data, error } = await supabase!.from('db_connections').insert({ ...conn, status: 'offline', tables_count: 0, size_bytes: 0 }).select().single();
  if (error) throw error;
  return data as DbConnection;
}

export async function deleteConnection(id: string): Promise<void> {
  if (STORAGE_MODE === 'local') { await localDelete(`/connections/${id}`); return; }
  const { error } = await supabase!.from('db_connections').delete().eq('id', id);
  if (error) throw error;
}

export async function testConnection(connection: {
  host: string; port: number; database: string; username: string; password: string; engine: string; ssl: boolean;
}): Promise<{ success: boolean; engine: string; version: string; latency_ms: number; message: string }> {
  if (STORAGE_MODE === 'local') return localPost('/test-connection', { connection });
  return callEdgeFunction('/test', { connection });
}

/* ---------- Cloud Drives ---------- */
export async function fetchCloudDrives(): Promise<CloudDrive[]> {
  if (STORAGE_MODE === 'local') {
    const rows = await localGet('/cloud-drives');
    return rows.map((r: Record<string, unknown>) => ({ ...r, connected: !!r.connected }));
  }
  const { data, error } = await supabase!.from('cloud_drives').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudDrive[];
}

export async function createCloudDrive(drive: Omit<CloudDrive, 'id' | 'created_at' | 'updated_at' | 'last_sync_at'>): Promise<CloudDrive> {
  if (STORAGE_MODE === 'local') {
    const r = await localPost('/cloud-drives', { ...drive, connected: drive.connected ? 1 : 0 });
    return { ...r, connected: !!r.connected };
  }
  const { data, error } = await supabase!.from('cloud_drives').insert(drive).select().single();
  if (error) throw error;
  return data as CloudDrive;
}

export async function updateCloudDrive(id: string, updates: Partial<CloudDrive>): Promise<void> {
  if (STORAGE_MODE === 'local') { await localPut(`/cloud-drives/${id}`, updates); return; }
  const { error } = await supabase!.from('cloud_drives').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteCloudDrive(id: string): Promise<void> {
  if (STORAGE_MODE === 'local') { await localDelete(`/cloud-drives/${id}`); return; }
  const { error } = await supabase!.from('cloud_drives').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Backup Schedules ---------- */
export async function fetchBackupSchedules(): Promise<BackupSchedule[]> {
  if (STORAGE_MODE === 'local') {
    const rows = await localGet('/backup-schedules');
    return rows.map((r: Record<string, unknown>) => ({ ...r, enabled: !!r.enabled }));
  }
  const { data, error } = await supabase!.from('backup_schedules').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BackupSchedule[];
}

export async function createBackupSchedule(schedule: Omit<BackupSchedule, 'id' | 'created_at' | 'updated_at' | 'last_run_at' | 'next_run_at' | 'backups_kept'>): Promise<BackupSchedule> {
  if (STORAGE_MODE === 'local') {
    const r = await localPost('/backup-schedules', { ...schedule, enabled: schedule.enabled ? 1 : 0 });
    return { ...r, enabled: !!r.enabled };
  }
  const { data, error } = await supabase!.from('backup_schedules').insert({ ...schedule, backups_kept: 0 }).select().single();
  if (error) throw error;
  return data as BackupSchedule;
}

export async function updateBackupSchedule(id: string, updates: Partial<BackupSchedule>): Promise<void> {
  if (STORAGE_MODE === 'local') { await localPut(`/backup-schedules/${id}`, updates); return; }
  const { error } = await supabase!.from('backup_schedules').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteBackupSchedule(id: string): Promise<void> {
  if (STORAGE_MODE === 'local') { await localDelete(`/backup-schedules/${id}`); return; }
  const { error } = await supabase!.from('backup_schedules').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- Query Execution ---------- */
export async function executeQuery(connectionId: string, sql: string, user?: string): Promise<QueryResult> {
  if (STORAGE_MODE === 'local') return localPost('/query', { connectionId, sql, user });
  return callEdgeFunction('/query', { connectionId, sql, user });
}

export async function fetchQueryHistory(connectionId?: string): Promise<QueryHistoryEntry[]> {
  if (STORAGE_MODE === 'local') {
    const qs = connectionId ? `?connectionId=${connectionId}` : '';
    return localGet(`/query-history${qs}`);
  }
  let query = supabase!.from('query_history').select('*').order('executed_at', { ascending: false }).limit(100);
  if (connectionId) query = query.eq('connection_id', connectionId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as QueryHistoryEntry[];
}

/* ---------- Table Structure ---------- */
export async function fetchTables(connectionId: string): Promise<{ tables: { name: string; rows: string; size: string; engine: string; collation: string }[] }> {
  if (STORAGE_MODE === 'local') return localPost('/tables', { connectionId });
  return callEdgeFunction('/tables', { connectionId });
}

export async function fetchColumns(connectionId: string, tableName: string): Promise<{ columns: { name: string; type: string; nullable: boolean; key: string; defaultValue: string | null; extra: string }[] }> {
  if (STORAGE_MODE === 'local') return localPost('/columns', { connectionId, tableName });
  return callEdgeFunction('/columns', { connectionId, tableName });
}
