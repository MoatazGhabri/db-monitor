import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { db, uuid, now, BACKUP_DIR, getSettings } from './context.js';
import { paramsFromRow, withDb, friendlyError } from './drivers.js';
import { listTables } from './schema.js';
import { dumpSql, executeScript } from './dump.js';
import { putFile, deleteFile } from './storage.js';
import { nextRun } from './cron.js';
import { notifyEvent } from './notify.js';

const slug = (s) => String(s || 'db').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'db';
const formatBytes = (n) => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
};
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const running = new Set(); // schedule/connection keys currently backing up

const getConn = (id) => db.prepare('SELECT * FROM db_connections WHERE id = ?').get(id);
const getDrive = (id) => (id ? db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(id) : null);
export const getBackup = (id) => db.prepare('SELECT * FROM backups WHERE id = ?').get(id);

/** Create the backup record and run the dump in the background. Returns the (running) record. */
export function startBackup({ connectionId, scheduleId = null, driveId = null, trigger = 'manual' }) {
  const conn = getConn(connectionId);
  if (!conn) throw new Error('Connection not found');
  const lockKey = `${connectionId}:${scheduleId || ''}`;
  if (running.has(lockKey)) throw new Error(`A backup of "${conn.name}" is already running`);
  const drive = getDrive(driveId);
  if (driveId && !drive) throw new Error('Destination drive not found');

  const id = uuid();
  const filename = `${slug(conn.name)}_${stamp()}.sql.gz`;
  db.prepare(`INSERT INTO backups (id, connection_id, connection_name, schedule_id, drive_id, filename, status, trigger_type, created_at)
    VALUES (?,?,?,?,?,?, 'running', ?, ?)`).run(id, connectionId, conn.name, scheduleId, driveId, filename, trigger, now());

  running.add(lockKey);
  performBackup(id, conn, drive).finally(() => running.delete(lockKey));
  return getBackup(id);
}

async function performBackup(id, conn, drive) {
  const started = Date.now();
  const row = getBackup(id);
  const localPath = path.join(BACKUP_DIR, row.filename);
  let p;
  try {
    p = paramsFromRow(conn);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const gz = zlib.createGzip({ level: 6 });
    const out = fs.createWriteStream(localPath);
    const finished = new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); gz.on('error', reject); });
    gz.pipe(out);
    const write = (chunk) => new Promise((resolve) => { if (gz.write(chunk)) resolve(); else gz.once('drain', resolve); });

    const stats = await withDb(p, async (h) => {
      const tables = await listTables(h, p);
      return dumpSql(h, conn.engine, tables, { includeSchema: true, includeData: true, dropExisting: true, dbName: conn.database_name, write });
    }, { timeoutMs: 0 });
    gz.end();
    await finished;

    const size = fs.statSync(localPath).size;
    let remoteName = null;
    if (drive) {
      try {
        await putFile(drive, localPath, row.filename);
        remoteName = row.filename;
        db.prepare('UPDATE cloud_drives SET last_sync_at = ?, connected = 1, updated_at = ? WHERE id = ?').run(now(), now(), drive.id);
      } catch (err) {
        throw new Error(`Dump created (${size} bytes, kept locally) but the upload to "${drive.label}" failed: ${err.message}`);
      }
    }
    db.prepare(`UPDATE backups SET status='completed', local_path=?, remote_name=?, size_bytes=?, tables_count=?, rows_count=?, duration_ms=?, finished_at=? WHERE id=?`)
      .run(localPath, remoteName, size, stats.tables, stats.rows, Date.now() - started, now(), id);
    if (row.schedule_id) {
      db.prepare('UPDATE backup_schedules SET last_status = ? WHERE id = ?').run('completed', row.schedule_id);
      applyRetention(row.schedule_id).catch((e) => console.error('[retention]', e.message));
    }
    const dest = drive ? `${drive.label} (${drive.provider === 'google_drive' ? 'Google Drive' : drive.provider})` : 'DBHub server (local disk only)';
    notifyEvent('backupSucceeded', `Backup of "${conn.name}" completed`,
      `${formatBytes(size)} · ${stats.tables} tables · ${stats.rows} rows\nSaved to: ${dest}\nDownload it from DBHub → Backups.`);
  } catch (err) {
    const message = friendlyError(err, p);
    const hasFile = fs.existsSync(localPath);
    db.prepare(`UPDATE backups SET status='failed', error=?, local_path=?, size_bytes=?, duration_ms=?, finished_at=? WHERE id=?`)
      .run(message, hasFile ? localPath : null, hasFile ? fs.statSync(localPath).size : 0, Date.now() - started, now(), id);
    if (row.schedule_id) db.prepare('UPDATE backup_schedules SET last_status = ? WHERE id = ?').run('failed', row.schedule_id);
    console.error(`[backup] ${conn.name} failed:`, message);
    const dest = drive ? ` (destination: ${drive.label})` : '';
    notifyEvent('backupFailed', `Backup of "${conn.name}" failed`, `${message}${dest}`);
  }
}

/** Remove the local dump and the copy on the destination drive. */
export async function deleteBackupFiles(b) {
  if (b.local_path) fs.rmSync(b.local_path, { force: true });
  if (b.drive_id && b.remote_name) {
    const drive = getDrive(b.drive_id);
    if (drive) { try { await deleteFile(drive, b.remote_name); } catch (e) { console.error('[backup] remote delete failed:', e.message); } }
  }
}

/** Keep the last N backups (or the last N days) of a schedule and delete the rest. */
export async function applyRetention(scheduleId) {
  const s = db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(scheduleId);
  if (!s) return 0;
  const list = db.prepare(`SELECT * FROM backups WHERE schedule_id = ? AND status = 'completed' ORDER BY created_at DESC`).all(scheduleId);
  let doomed;
  if (s.retention_unit === 'days') {
    const cutoff = Date.now() - s.retention_count * 86400000;
    doomed = list.filter((b, i) => i > 0 && new Date(b.created_at).getTime() < cutoff); // always keep the newest one
  } else {
    doomed = list.slice(Math.max(1, s.retention_count));
  }
  for (const b of doomed) {
    await deleteBackupFiles(b);
    db.prepare('DELETE FROM backups WHERE id = ?').run(b.id);
  }
  db.prepare('UPDATE backup_schedules SET backups_kept = ? WHERE id = ?').run(list.length - doomed.length, scheduleId);
  return doomed.length;
}

export async function restoreBackup(backupRow, targetConnectionId) {
  if (!backupRow.local_path || !fs.existsSync(backupRow.local_path)) throw new Error('The dump file is no longer on the server');
  const target = getConn(targetConnectionId);
  if (!target) throw new Error('Target connection not found');
  const sql = zlib.gunzipSync(fs.readFileSync(backupRow.local_path)).toString('utf8');
  const p = paramsFromRow(target);
  return withDb(p, (h) => executeScript(h, target.engine, sql, { stopOnError: true }), { timeoutMs: 0 });
}

/* =====================================================================
 * Scheduler
 * ===================================================================== */
export function scheduleTimezone(s) {
  return s.timezone || getSettings().profile.timezone || 'UTC';
}

export function computeNext(s, from = new Date()) {
  try { return nextRun(s.cron_expression, scheduleTimezone(s), from)?.toISOString() ?? null; } catch { return null; }
}

export function refreshNextRun(scheduleId) {
  const s = db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(scheduleId);
  if (!s) return;
  db.prepare('UPDATE backup_schedules SET next_run_at = ? WHERE id = ?').run(s.enabled ? computeNext(s) : null, scheduleId);
}

function tick() {
  const due = db.prepare('SELECT * FROM backup_schedules WHERE enabled = 1').all();
  const t = Date.now();
  for (const s of due) {
    if (!s.next_run_at) { refreshNextRun(s.id); continue; }
    if (new Date(s.next_run_at).getTime() > t) continue;
    try {
      startBackup({ connectionId: s.connection_id, scheduleId: s.id, driveId: s.drive_id, trigger: 'schedule' });
      db.prepare('UPDATE backup_schedules SET last_run_at = ? WHERE id = ?').run(now(), s.id);
    } catch (err) {
      console.error(`[scheduler] ${s.id}:`, err.message);
    }
    db.prepare('UPDATE backup_schedules SET next_run_at = ? WHERE id = ?').run(computeNext(s, new Date()), s.id);
  }
}

export function startScheduler() {
  // A backup left "running" by a previous process can never finish.
  db.prepare(`UPDATE backups SET status='failed', error='Interrupted by a server restart', finished_at=? WHERE status='running'`).run(now());
  setInterval(() => { try { tick(); } catch (e) { console.error('[scheduler]', e.message); } }, 30_000).unref();
  tick();
}
