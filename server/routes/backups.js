import fs from 'fs';
import { db, uuid, now } from '../lib/context.js';
import { route } from '../lib/drivers.js';
import { PROVIDERS, readConfig, packConfig, publicConfig, mergeConfig, testDrive } from '../lib/storage.js';
import { startBackup, getBackup, deleteBackupFiles, applyRetention, refreshNextRun, restoreBackup } from '../lib/backup.js';
import { parseCron, validateTimezone } from '../lib/cron.js';

const REQUIRED = {
  local: ['path'],
  webdav: ['url'],
  s3: ['bucket', 'accessKeyId', 'secretAccessKey'],
};

function publicDrive(row) {
  const usage = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes),0) AS bytes FROM backups WHERE drive_id = ? AND status = 'completed'`).get(row.id);
  return {
    id: row.id, provider: row.provider, label: row.label, connected: !!row.connected, folder: row.folder,
    last_sync_at: row.last_sync_at, created_at: row.created_at,
    config: publicConfig(row), backups_count: usage.n, backups_bytes: usage.bytes,
  };
}

function validateDrive(provider, config) {
  if (!PROVIDERS[provider]) return `Unknown drive type "${provider}"`;
  const missing = REQUIRED[provider].filter((k) => !String(config?.[k] ?? '').trim());
  if (missing.length) return `Missing field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  if (provider === 'webdav' && !/^https?:\/\//i.test(config.url)) return 'The WebDAV URL must start with http:// or https://';
  if (provider === 's3' && config.endpoint && !/^https?:\/\//i.test(config.endpoint)) return 'The endpoint must start with http:// or https://';
  return null;
}

function readSchedule(b, existing = {}) {
  const s = {
    connection_id: b.connection_id ?? existing.connection_id,
    drive_id: b.drive_id === undefined ? existing.drive_id ?? null : (b.drive_id || null),
    frequency: b.frequency ?? existing.frequency ?? 'daily',
    cron_expression: String(b.cron_expression ?? existing.cron_expression ?? '0 3 * * *').trim(),
    time: b.time ?? existing.time ?? '03:00',
    timezone: b.timezone ?? existing.timezone ?? 'UTC',
    retention_count: Math.max(1, parseInt(b.retention_count ?? existing.retention_count ?? 2, 10) || 2),
    retention_unit: (b.retention_unit ?? existing.retention_unit) === 'days' ? 'days' : 'backups',
    enabled: b.enabled === undefined ? (existing.enabled ?? 1) : (b.enabled ? 1 : 0),
  };
  parseCron(s.cron_expression); // throws with a readable message
  if (!validateTimezone(s.timezone)) throw new Error(`Unknown time zone "${s.timezone}"`);
  if (!s.connection_id || !db.prepare('SELECT 1 FROM db_connections WHERE id = ?').get(s.connection_id)) throw new Error('Choose the database to back up');
  return s;
}

const decorateBackup = (b) => {
  const drive = b.drive_id ? db.prepare('SELECT label, provider FROM cloud_drives WHERE id = ?').get(b.drive_id) : null;
  return { ...b, drive_label: drive?.label ?? null, drive_provider: drive?.provider ?? null, downloadable: !!(b.local_path && fs.existsSync(b.local_path)) };
};

export function registerBackupRoutes(app) {
  /* ---------- Drives (backup destinations) ---------- */
  app.get('/api/cloud-drives', (_req, res) => {
    res.json({ drives: db.prepare('SELECT * FROM cloud_drives ORDER BY created_at DESC').all().map(publicDrive), providers: PROVIDERS });
  });

  app.post('/api/cloud-drives', route(async (req, res) => {
    const { provider, label, folder = '', config = {} } = req.body || {};
    const problem = validateDrive(provider, config);
    if (problem) return res.status(400).json({ error: problem });
    const id = uuid();
    const ts = now();
    const row = { id, provider, label: String(label || PROVIDERS[provider].label).trim(), folder: String(folder || '').trim(), config: packConfig(mergeConfig(provider, {}, config)) };
    const test = await testDrive({ ...row, config: row.config });
    db.prepare(`INSERT INTO cloud_drives (id, provider, label, email, connected, folder, config, created_at, updated_at, last_sync_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, provider, row.label, '', test.ok ? 1 : 0, row.folder, row.config, ts, ts, test.ok ? ts : null);
    res.json({ drive: publicDrive(db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(id)), test });
  }));

  app.put('/api/cloud-drives/:id', route(async (req, res) => {
    const row = db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Drive not found' });
    const b = req.body || {};
    const cfg = mergeConfig(row.provider, readConfig(row), b.config || {});
    const problem = validateDrive(row.provider, cfg);
    if (problem) return res.status(400).json({ error: problem });
    const updated = { ...row, label: String(b.label ?? row.label).trim() || row.label, folder: b.folder === undefined ? row.folder : String(b.folder).trim(), config: packConfig(cfg) };
    const test = await testDrive(updated);
    db.prepare('UPDATE cloud_drives SET label=?, folder=?, config=?, connected=?, updated_at=? WHERE id=?')
      .run(updated.label, updated.folder, updated.config, test.ok ? 1 : 0, now(), row.id);
    res.json({ drive: publicDrive(db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(row.id)), test });
  }));

  app.post('/api/cloud-drives/:id/test', route(async (req, res) => {
    const row = db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Drive not found' });
    const test = await testDrive(row);
    db.prepare('UPDATE cloud_drives SET connected=?, updated_at=? WHERE id=?').run(test.ok ? 1 : 0, now(), row.id);
    res.json({ drive: publicDrive(db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(row.id)), test });
  }));

  app.delete('/api/cloud-drives/:id', (req, res) => {
    db.prepare('DELETE FROM cloud_drives WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  /* ---------- Schedules ---------- */
  const scheduleRow = (s) => {
    const conn = db.prepare('SELECT name FROM db_connections WHERE id = ?').get(s.connection_id);
    const drive = s.drive_id ? db.prepare('SELECT label, provider FROM cloud_drives WHERE id = ?').get(s.drive_id) : null;
    return { ...s, enabled: !!s.enabled, connection_name: conn?.name ?? '(deleted)', drive_label: drive?.label ?? null, drive_provider: drive?.provider ?? null };
  };

  app.get('/api/backup-schedules', (_req, res) => {
    res.json({ schedules: db.prepare('SELECT * FROM backup_schedules ORDER BY created_at DESC').all().map(scheduleRow) });
  });

  app.post('/api/backup-schedules', (req, res) => {
    let s;
    try { s = readSchedule(req.body || {}); } catch (e) { return res.status(400).json({ error: e.message }); }
    const id = uuid();
    const ts = now();
    db.prepare(`INSERT INTO backup_schedules (id, connection_id, drive_id, frequency, cron_expression, time, timezone, retention_count, retention_unit, enabled, backups_kept, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, 0, ?, ?)`).run(id, s.connection_id, s.drive_id, s.frequency, s.cron_expression, s.time, s.timezone, s.retention_count, s.retention_unit, s.enabled, ts, ts);
    refreshNextRun(id);
    res.json({ schedule: scheduleRow(db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(id)) });
  });

  app.put('/api/backup-schedules/:id', route(async (req, res) => {
    const existing = db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    let s;
    try { s = readSchedule(req.body || {}, existing); } catch (e) { return res.status(400).json({ error: e.message }); }
    db.prepare(`UPDATE backup_schedules SET connection_id=?, drive_id=?, frequency=?, cron_expression=?, time=?, timezone=?, retention_count=?, retention_unit=?, enabled=?, updated_at=? WHERE id=?`)
      .run(s.connection_id, s.drive_id, s.frequency, s.cron_expression, s.time, s.timezone, s.retention_count, s.retention_unit, s.enabled, now(), existing.id);
    refreshNextRun(existing.id);
    applyRetention(existing.id).catch(() => {});
    res.json({ schedule: scheduleRow(db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(existing.id)) });
  }));

  app.delete('/api/backup-schedules/:id', (req, res) => {
    db.prepare('DELETE FROM backup_schedules WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/backup-schedules/:id/run', route(async (req, res) => {
    const s = db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Schedule not found' });
    const b = startBackup({ connectionId: s.connection_id, scheduleId: s.id, driveId: s.drive_id, trigger: 'manual' });
    db.prepare('UPDATE backup_schedules SET last_run_at = ? WHERE id = ?').run(now(), s.id);
    res.json({ backup: decorateBackup(b) });
  }));

  /* ---------- Backups ---------- */
  app.get('/api/backups', (_req, res) => {
    const rows = db.prepare('SELECT * FROM backups ORDER BY created_at DESC LIMIT 200').all().map(decorateBackup);
    const stats = db.prepare(`SELECT COUNT(*) AS total, SUM(status='completed') AS completed, SUM(status='failed') AS failed,
      SUM(status='running') AS running, COALESCE(SUM(CASE WHEN status='completed' THEN size_bytes END),0) AS bytes FROM backups`).get();
    const scheduled = db.prepare('SELECT COUNT(*) AS n FROM backup_schedules WHERE enabled = 1').get().n;
    res.json({ backups: rows, stats: { ...stats, scheduled } });
  });

  app.post('/api/backups/run', route(async (req, res) => {
    const { connectionId, driveId } = req.body || {};
    if (!connectionId) return res.status(400).json({ error: 'Choose the database to back up' });
    res.json({ backup: decorateBackup(startBackup({ connectionId, driveId: driveId || null, trigger: 'manual' })) });
  }));

  app.get('/api/backups/:id/download', (req, res) => {
    const b = getBackup(req.params.id);
    if (!b || !b.local_path || !fs.existsSync(b.local_path)) return res.status(404).json({ error: 'The dump file is no longer on the server' });
    res.download(b.local_path, b.filename);
  });

  app.delete('/api/backups/:id', route(async (req, res) => {
    const b = getBackup(req.params.id);
    if (!b) return res.status(404).json({ error: 'Backup not found' });
    if (b.status === 'running') return res.status(409).json({ error: 'This backup is still running' });
    await deleteBackupFiles(b);
    db.prepare('DELETE FROM backups WHERE id = ?').run(b.id);
    res.json({ success: true });
  }));

  app.post('/api/backups/:id/restore', route(async (req, res) => {
    const b = getBackup(req.params.id);
    if (!b || b.status !== 'completed') return res.status(404).json({ error: 'Backup not found' });
    const r = await restoreBackup(b, req.body?.connectionId || b.connection_id);
    res.json({ success: r.failed === 0, ...r });
  }));
}
