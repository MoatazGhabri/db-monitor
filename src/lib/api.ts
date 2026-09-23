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

/* ---------- Local API helpers ---------- */
async function parse(r: Response) {
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = (data && typeof data.error === 'string' && data.error) || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return data;
}

async function localRequest(method: string, path: string, body?: unknown) {
  let r: Response;
  try {
    r = await fetch(`${LOCAL_API_URL}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the DBHub API server. Is the "dbhub-server" container / `npm start` in /server running?');
  }
  return parse(r);
}

const localGet = (path: string) => localRequest('GET', path);
const localPost = (path: string, body: unknown) => localRequest('POST', path, body);
const localPut = (path: string, body: unknown) => localRequest('PUT', path, body);
const localDelete = (path: string) => localRequest('DELETE', path);

function requireLocal(feature: string): void {
  if (STORAGE_MODE !== 'local') {
    throw new Error(`${feature} needs a live database connection and is only available in local mode (VITE_API_MODE=local).`);
  }
}

/* ---------- Connections ---------- */
export type ConnectionInput = Omit<DbConnection, 'id' | 'created_at' | 'updated_at' | 'last_connected_at' | 'status' | 'tables_count' | 'size_bytes'>;
/** Saved connection + the reason it could not connect (if it could not). */
export type SavedConnection = DbConnection & { connection_error?: string };

export interface CheckResult {
  ok: boolean;
  error?: string;
  version?: string;
  latency_ms?: number;
  connection: DbConnection;
}

export async function fetchConnections(): Promise<DbConnection[]> {
  if (STORAGE_MODE === 'local') return localGet('/connections');
  const { data, error } = await supabase!.from('db_connections').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbConnection[];
}

/** Saves the connection, then really connects to it so `status` is accurate. */
export async function createConnection(conn: ConnectionInput): Promise<SavedConnection> {
  if (STORAGE_MODE === 'local') return localPost('/connections', conn);
  const { data, error } = await supabase!.from('db_connections').insert({ ...conn, status: 'offline', tables_count: 0, size_bytes: 0 }).select().single();
  if (error) throw error;
  return data as DbConnection;
}

/** Leave `password_encrypted` empty to keep the stored password. */
export async function updateConnection(id: string, conn: ConnectionInput): Promise<SavedConnection> {
  requireLocal('Editing a connection');
  return localPut(`/connections/${id}`, conn);
}

/** (Re)connects to a saved database and refreshes its status, table count and size. */
export async function checkConnection(id: string): Promise<CheckResult> {
  requireLocal('Checking a connection');
  return localPost(`/connections/${id}/check`, {});
}

export async function deleteConnection(id: string): Promise<void> {
  if (STORAGE_MODE === 'local') { await localDelete(`/connections/${id}`); return; }
  const { error } = await supabase!.from('db_connections').delete().eq('id', id);
  if (error) throw error;
}

export async function testConnection(connection: {
  host: string; port: number; database: string; username: string; password: string; engine: string; ssl: boolean;
  /** When editing a saved connection, an empty password reuses the stored one. */
  connectionId?: string;
}): Promise<{ success: boolean; engine: string; version: string; latency_ms: number; message: string; tables?: number; size_bytes?: number }> {
  if (STORAGE_MODE === 'local') return localPost('/test-connection', { connection });
  return callEdgeFunction('/test', { connection });
}

export interface QueryResult {
  success: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  rowsAffected: number;
  durationMs: number;
  executedAt: string;
  error?: string;
}

export interface QueryHistoryEntry {
  id: string;
  connection_id: string;
  query: string;
  duration_ms: number;
  rows_affected: number;
  status: 'success' | 'slow' | 'error';
  executed_by: string;
  executed_at: string;
}

/* ---------- Query Execution ---------- */
export async function executeQuery(connectionId: string, sql: string, user?: string): Promise<QueryResult> {
  if (STORAGE_MODE === 'local') {
    // The server answers HTTP 200 with `success: false` on SQL errors so the query is still logged.
    const r = await localPost('/query', { connectionId, sql, user });
    if (r && r.success === false) throw new Error(r.error || 'Query failed');
    return r;
  }
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

/* ---------- Table Structure (live from the connected database) ---------- */
export interface TableSummary {
  schema: string;
  name: string;
  type: string;                 // 'BASE TABLE' | 'VIEW' | ...
  engine: string | null;
  collation: string | null;
  rows: number | null;          // null for views
  rows_estimated: boolean;
  data_bytes: number;
  index_bytes: number;
  auto_increment: number | null;
  row_format: string | null;
  comment: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  key: string;                  // 'PRI' | 'UNI' | 'MUL' | ''
  defaultValue: string | null;
  extra: string;
  comment: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  type: string;
  unique: boolean;
  primary: boolean;
}

export interface TableDataResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  totalExact: boolean;
  page: number;
  pageSize: number;
}

export async function fetchTables(connectionId: string): Promise<{ tables: TableSummary[] }> {
  requireLocal('Browsing tables');
  return localPost('/tables', { connectionId });
}

export async function fetchColumns(connectionId: string, tableName: string, schema?: string): Promise<{ columns: ColumnInfo[] }> {
  requireLocal('Browsing columns');
  return localPost('/columns', { connectionId, tableName, schema });
}

export async function fetchIndexes(connectionId: string, tableName: string, schema?: string): Promise<{ indexes: IndexInfo[] }> {
  requireLocal('Browsing indexes');
  return localPost('/indexes', { connectionId, tableName, schema });
}

export async function fetchTableData(
  connectionId: string,
  tableName: string,
  opts: { schema?: string; page?: number; pageSize?: number; orderBy?: string; orderDir?: 'asc' | 'desc' } = {},
): Promise<TableDataResult> {
  requireLocal('Browsing table data');
  return localPost('/table-data', { connectionId, tableName, ...opts });
}


/* ---------- Platform: settings, status, dashboard, search ---------- */
export interface Profile { name: string; email: string; role: string; timezone: string; }
export interface NotificationChannel { enabled: boolean; url: string; }
export interface Settings {
  profile: Profile;
  notifications: { slack: NotificationChannel; webhook: NotificationChannel; events: { connectionDown: boolean; backupFailed: boolean; diskFull: boolean } };
  preferences: { slowQueryMs: number; queryTimeoutSec: number; historyRetentionDays: number; defaultPageSize: number; language: string; dateFormat: string; timeFormat: string };
}
export interface SystemInfo { version: string; hostname: string; docker: boolean; node: string; startedAt: string; encryption: string; timezones: string[]; }

export async function fetchSettings(): Promise<{ settings: Settings; defaults: Settings; system: SystemInfo }> {
  requireLocal('Settings');
  return localGet('/settings');
}
export async function saveSettings(patch: Partial<Settings>): Promise<{ settings: Settings }> {
  requireLocal('Settings');
  return localPut('/settings', patch);
}
export async function testNotification(channel: 'slack' | 'webhook', url: string): Promise<{ success: boolean }> {
  requireLocal('Notifications');
  return localPost('/settings/test-notification', { channel, url });
}

export interface PlatformStatus {
  version: string; hostname: string; total: number; online: number;
  health: 'operational' | 'warning' | 'degraded'; alerts: number; uptimeSec: number; profile: Profile;
}
export async function fetchStatus(): Promise<PlatformStatus> {
  requireLocal('Platform status');
  return localGet('/status');
}

export interface Alert { id: string; level: 'warning' | 'error'; title: string; detail: string; at: string; page: string; }
export async function fetchAlerts(): Promise<{ alerts: Alert[] }> {
  requireLocal('Alerts');
  return localGet('/alerts');
}

export interface SearchResult {
  databases: { id: string; name: string; engine: string; database_name: string; status: string }[];
  tables: { connection_id: string; connection_name: string; schema: string; name: string; type: string }[];
}
export async function searchPlatform(q: string): Promise<SearchResult> {
  if (STORAGE_MODE !== 'local' || !q.trim()) return { databases: [], tables: [] };
  return localGet(`/search?q=${encodeURIComponent(q)}`);
}

export interface DashboardData {
  stats: {
    databases: number; online: number; tables: number; totalBytes: number;
    queries24h: number; queriesTrend: number | null; errors24h: number; avgQueryMs: number; activeConnections: number;
  };
  host: { cpu: number; ramPercent: number; disk: { percent: number; used: number; total: number }; uptimeSec: number; series: { t: number; cpu: number; ram: number }[] };
  databases: { id: string; name: string; engine: string; status: string; tables: number; size_bytes: number; last_connected_at: string | null }[];
  topTables: { name: string; connection_name: string; connection_id: string; rows: number | null; bytes: number }[];
  recentQueries: { id: string; query: string; duration_ms: number; status: string; executed_at: string; connection_id: string; connection_name: string }[];
  lastBackup: { filename: string; connection_name: string; size_bytes: number; created_at: string } | null;
  backupsFailed48h: number;
}
export async function fetchDashboard(): Promise<DashboardData> {
  requireLocal('The dashboard');
  return localGet('/dashboard');
}

/* ---------- Monitoring ---------- */
export interface MonitoringData {
  host: { cpu: number; cpus: number; load1: number; ramTotal: number; ramUsed: number; ramPercent: number; disk: { total: number; free: number; used: number; percent: number }; uptimeSec: number; series: { t: number; cpu: number; ram: number; load1: number }[] };
  db: {
    status: { version: string; connections: number; running: number; maxConnections: number; uptime: number; queries: number; unit: string };
    activity: { id: number; user: string; host: string; database: string; state: string; idle: boolean; query: string; seconds: number }[];
    sample: { t: number; connections: number; running: number; qps: number; rowsRead: number; rowsWritten: number; cacheHit: number | null };
    series: { t: number; connections: number; running: number; qps: number; rowsRead: number; rowsWritten: number; cacheHit: number | null }[];
  } | null;
  dbError: string | null;
  slow: { query: string; calls: number; avg_ms: number; max_ms: number; impact: 'low' | 'medium' | 'high' }[];
  latency: { hour: string; avg_ms: number; count: number }[];
  slowThresholdMs: number;
}
export async function fetchMonitoring(connectionId?: string): Promise<MonitoringData> {
  requireLocal('Monitoring');
  return localPost('/monitoring', connectionId ? { connectionId } : {});
}

/* ---------- Database users & permissions ---------- */
export interface DbUser {
  name: string; host: string | null; superuser: boolean; canLogin: boolean; locked: boolean;
  detail: string; level: 'Full' | 'Read/Write' | 'Read' | 'None'; perTable: Record<string, string>; privileges: string[];
}
export async function fetchDbUsers(connectionId: string): Promise<{ engine: string; database: string; users: DbUser[]; tables: string[]; total: number; notes: string[] }> {
  requireLocal('Database users');
  return localPost('/db-users', { connectionId });
}

/* ---------- Query history (server-backed) ---------- */
export interface QueryHistoryEntryFull {
  id: string; connection_id: string; connection_name: string; query: string;
  duration_ms: number; rows_affected: number; status: 'success' | 'slow' | 'error'; executed_by: string; executed_at: string;
}
export async function fetchQueryHistoryFull(opts: { connectionId?: string; status?: string; q?: string; limit?: number } = {}): Promise<{ queries: QueryHistoryEntryFull[]; stats: { total: number; success: number; slow: number; error: number; avg_ms: number } }> {
  requireLocal('Query history');
  const params = new URLSearchParams();
  if (opts.connectionId) params.set('connectionId', opts.connectionId);
  if (opts.status) params.set('status', opts.status);
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return localGet(`/query-history${qs ? `?${qs}` : ''}`);
}
export async function clearQueryHistory(connectionId?: string): Promise<{ deleted: number }> {
  requireLocal('Query history');
  return localDelete(`/query-history${connectionId ? `?connectionId=${connectionId}` : ''}`);
}

/* ---------- Cloud drives (backup destinations) ---------- */
export type DriveProvider = 'local' | 'webdav' | 's3';
export interface CloudDrive {
  id: string; provider: DriveProvider; label: string; connected: boolean; folder: string;
  last_sync_at: string | null; created_at: string; config: Record<string, string | boolean>;
  backups_count: number; backups_bytes: number;
}
export interface DriveTestResult { ok: boolean; message: string; free_bytes?: number; }
export async function fetchDrives(): Promise<{ drives: CloudDrive[]; providers: Record<DriveProvider, { label: string; secrets: string[] }> }> {
  requireLocal('Cloud drives');
  return localGet('/cloud-drives');
}
export async function createDrive(input: { provider: DriveProvider; label: string; folder?: string; config: Record<string, string> }): Promise<{ drive: CloudDrive; test: DriveTestResult }> {
  requireLocal('Cloud drives');
  return localPost('/cloud-drives', input);
}
export async function updateDrive(id: string, input: { label?: string; folder?: string; config?: Record<string, string> }): Promise<{ drive: CloudDrive; test: DriveTestResult }> {
  requireLocal('Cloud drives');
  return localPut(`/cloud-drives/${id}`, input);
}
export async function testDrive(id: string): Promise<{ drive: CloudDrive; test: DriveTestResult }> {
  requireLocal('Cloud drives');
  return localPost(`/cloud-drives/${id}/test`, {});
}
export async function deleteDrive(id: string): Promise<void> {
  requireLocal('Cloud drives');
  await localDelete(`/cloud-drives/${id}`);
}

/* ---------- Backup schedules ---------- */
export interface BackupSchedule {
  id: string; connection_id: string; connection_name: string; drive_id: string | null; drive_label: string | null; drive_provider: DriveProvider | null;
  frequency: string; cron_expression: string; time: string; timezone: string;
  retention_count: number; retention_unit: 'backups' | 'days'; enabled: boolean;
  last_run_at: string | null; next_run_at: string | null; last_status: string | null; backups_kept: number;
}
export type ScheduleInput = {
  connection_id: string; drive_id?: string | null; cron_expression: string; time?: string; timezone: string;
  retention_count: number; retention_unit: 'backups' | 'days'; enabled: boolean; frequency?: string;
};
export async function fetchBackupSchedules(): Promise<{ schedules: BackupSchedule[] }> {
  requireLocal('Backup schedules');
  return localGet('/backup-schedules');
}
export async function createBackupSchedule(input: ScheduleInput): Promise<{ schedule: BackupSchedule }> {
  requireLocal('Backup schedules');
  return localPost('/backup-schedules', input);
}
export async function updateBackupSchedule(id: string, input: ScheduleInput): Promise<{ schedule: BackupSchedule }> {
  requireLocal('Backup schedules');
  return localPut(`/backup-schedules/${id}`, input);
}
export async function deleteBackupSchedule(id: string): Promise<void> {
  requireLocal('Backup schedules');
  await localDelete(`/backup-schedules/${id}`);
}
export async function runBackupSchedule(id: string): Promise<{ backup: BackupRecord }> {
  requireLocal('Backups');
  return localPost(`/backup-schedules/${id}/run`, {});
}

/* ---------- Backups ---------- */
export interface BackupRecord {
  id: string; connection_id: string; connection_name: string; schedule_id: string | null;
  drive_id: string | null; drive_label: string | null; drive_provider: DriveProvider | null;
  filename: string; size_bytes: number; tables_count: number; rows_count: number;
  status: 'running' | 'completed' | 'failed'; trigger_type: 'manual' | 'schedule'; error: string | null;
  duration_ms: number; created_at: string; finished_at: string | null; downloadable: boolean;
}
export async function fetchBackups(): Promise<{ backups: BackupRecord[]; stats: { total: number; completed: number; failed: number; running: number; bytes: number; scheduled: number } }> {
  requireLocal('Backups');
  return localGet('/backups');
}
export async function runBackup(connectionId: string, driveId?: string | null): Promise<{ backup: BackupRecord }> {
  requireLocal('Backups');
  return localPost('/backups/run', { connectionId, driveId: driveId || null });
}
export async function deleteBackup(id: string): Promise<void> {
  requireLocal('Backups');
  await localDelete(`/backups/${id}`);
}
export function backupDownloadUrl(id: string): string {
  return `${LOCAL_API_URL}/backups/${id}/download`;
}
export async function restoreBackup(id: string, connectionId?: string): Promise<{ success: boolean; executed: number; total: number; failed: number; errors: { statement: string; error: string }[] }> {
  requireLocal('Restore');
  return localPost(`/backups/${id}/restore`, connectionId ? { connectionId } : {});
}

/* ---------- Import / Export ---------- */
export interface IoJob {
  id: string; type: 'Import' | 'Export'; connection_id: string; connection_name: string;
  target: string; format: string; filename: string; status: 'running' | 'Completed' | 'Failed';
  size_bytes: number; rows_count: number; statements_count: number; error: string | null;
  created_at: string; finished_at: string | null;
}
export async function fetchIoJobs(): Promise<{ jobs: IoJob[] }> {
  requireLocal('Import / Export jobs');
  return localGet('/io-jobs');
}

/** Streams the export to disk via the browser's download machinery. Returns the job id from the response header. */
export async function exportData(input: {
  connectionId: string; format: 'sql' | 'csv' | 'json'; tables?: string[];
  includeSchema?: boolean; includeData?: boolean; dropExisting?: boolean; gzip?: boolean;
}): Promise<void> {
  requireLocal('Export');
  const r = await fetch(`${LOCAL_API_URL}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!r.ok) { const data = await r.json().catch(() => null); throw new Error(data?.error || `Export failed (${r.status})`); }
  const disposition = r.headers.get('Content-Disposition') || '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `export.${input.format}`;
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function importData(input: {
  connectionId: string; format: 'sql' | 'csv' | 'json'; filename: string; content: string;
  tableName?: string; schema?: string; createTable?: boolean; truncate?: boolean; emptyAsNull?: boolean; stopOnError?: boolean;
}): Promise<{ success: boolean; statements: number; failed: number; errors: { statement: string; error: string }[]; rows: number; notes?: string[] }> {
  requireLocal('Import');
  const data = await localPost('/import', input);
  return data;
}
