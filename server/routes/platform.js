import os from 'os';
import { db, VERSION, STARTED_AT, secretSource, getSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/context.js';
import { IN_DOCKER, route } from '../lib/drivers.js';
import { hostNow, hostSeriesData, dbSeriesData, diskUsage } from '../lib/metrics.js';
import { cachedTables, listTablesFor } from '../lib/schema.js';
import { sendTest } from '../lib/notify.js';
import { validateTimezone } from '../lib/cron.js';

const H = 3600_000;
const iso = (ms) => new Date(ms).toISOString();

/* ---------- alerts ---------- */
export function computeAlerts() {
  const alerts = [];
  for (const c of db.prepare(`SELECT * FROM db_connections WHERE status = 'offline'`).all()) {
    alerts.push({ id: `conn:${c.id}`, level: 'error', title: `${c.name} is offline`, detail: `${c.host}:${c.port} cannot be reached`, at: c.updated_at, page: 'databases' });
  }
  for (const b of db.prepare(`SELECT * FROM backups WHERE status = 'failed' AND created_at > ? ORDER BY created_at DESC LIMIT 5`).all(iso(Date.now() - 48 * H))) {
    alerts.push({ id: `backup:${b.id}`, level: 'error', title: `Backup of ${b.connection_name} failed`, detail: b.error || '', at: b.created_at, page: 'backups' });
  }
  const slow = db.prepare(`SELECT COUNT(*) AS n FROM query_history WHERE status = 'slow' AND executed_at > ?`).get(iso(Date.now() - H)).n;
  if (slow > 0) alerts.push({ id: 'slow', level: 'warning', title: `${slow} slow ${slow === 1 ? 'query' : 'queries'} in the last hour`, detail: 'See Monitoring → Slow Queries', at: iso(Date.now()), page: 'monitoring' });
  const errs = db.prepare(`SELECT COUNT(*) AS n FROM query_history WHERE status = 'error' AND executed_at > ?`).get(iso(Date.now() - 24 * H)).n;
  if (errs >= 5) alerts.push({ id: 'errors', level: 'warning', title: `${errs} failed queries in the last 24 h`, detail: 'See Query History', at: iso(Date.now()), page: 'query-history' });
  const d = diskUsage();
  if (d.percent >= 85) alerts.push({ id: 'disk', level: d.percent >= 95 ? 'error' : 'warning', title: `Server disk ${d.percent}% full`, detail: 'Delete old backups or extend the volume', at: iso(Date.now()), page: 'monitoring' });
  return alerts;
}

/* ---------- dashboard top tables (cached: listing every table of every database is not free) ---------- */
let topCache = { at: 0, data: [] };
async function topTables() {
  if (Date.now() - topCache.at < 120_000) return topCache.data;
  const conns = db.prepare(`SELECT * FROM db_connections WHERE status = 'online'`).all();
  const lists = await Promise.allSettled(conns.map(async (c) => (await listTablesFor(c, { exact: false })).map((t) => ({ ...t, connection_id: c.id, connection_name: c.name }))));
  const all = lists.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((t) => t.type === 'BASE TABLE');
  all.sort((a, b) => b.data_bytes + b.index_bytes - (a.data_bytes + a.index_bytes));
  topCache = { at: Date.now(), data: all.slice(0, 6).map((t) => ({ name: t.name, connection_name: t.connection_name, connection_id: t.connection_id, rows: t.rows, bytes: t.data_bytes + t.index_bytes })) };
  return topCache.data;
}

const pctChange = (now, prev) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);

export function registerPlatformRoutes(app) {
  /* ---------- settings ---------- */
  app.get('/api/settings', (_req, res) => {
    res.json({ settings: getSettings(), defaults: DEFAULT_SETTINGS, system: {
      version: VERSION, hostname: os.hostname(), docker: IN_DOCKER, node: process.version,
      startedAt: iso(STARTED_AT), encryption: secretSource === 'env' ? 'DBHUB_SECRET' : 'key file in the data volume',
      timezones: typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [],
    } });
  });

  app.put('/api/settings', (req, res) => {
    const b = req.body || {};
    const p = b.profile;
    if (p?.timezone && !validateTimezone(p.timezone)) return res.status(400).json({ error: `Unknown time zone "${p.timezone}"` });
    const pref = b.preferences;
    if (pref) {
      const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
      const cur = getSettings().preferences;
      if (pref.slowQueryMs !== undefined) pref.slowQueryMs = clamp(pref.slowQueryMs, 1, 3_600_000, cur.slowQueryMs);
      if (pref.queryTimeoutSec !== undefined) pref.queryTimeoutSec = clamp(pref.queryTimeoutSec, 0, 3600, cur.queryTimeoutSec);
      if (pref.historyRetentionDays !== undefined) pref.historyRetentionDays = clamp(pref.historyRetentionDays, 0, 3650, cur.historyRetentionDays);
      if (pref.defaultPageSize !== undefined) pref.defaultPageSize = [25, 50, 100, 200].includes(Number(pref.defaultPageSize)) ? Number(pref.defaultPageSize) : cur.defaultPageSize;
    }
    for (const ch of ['slack', 'webhook']) {
      const u = b.notifications?.[ch]?.url;
      if (u && !/^https?:\/\//i.test(u)) return res.status(400).json({ error: `The ${ch} URL must start with http:// or https://` });
    }
    res.json({ settings: saveSettings(b) });
  });

  app.post('/api/settings/test-notification', route(async (req, res) => {
    await sendTest(req.body.channel, req.body.url);
    res.json({ success: true });
  }));

  /* ---------- status / alerts / search ---------- */
  app.get('/api/status', (_req, res) => {
    const total = db.prepare('SELECT COUNT(*) AS n FROM db_connections').get().n;
    const online = db.prepare(`SELECT COUNT(*) AS n FROM db_connections WHERE status = 'online'`).get().n;
    const alerts = computeAlerts();
    const errors = alerts.filter((a) => a.level === 'error').length;
    res.json({
      version: VERSION, hostname: os.hostname(), total, online,
      health: errors > 0 ? 'degraded' : alerts.length > 0 ? 'warning' : 'operational',
      alerts: alerts.length, uptimeSec: Math.round(process.uptime()),
      profile: getSettings().profile,
    });
  });

  app.get('/api/alerts', (_req, res) => res.json({ alerts: computeAlerts() }));

  app.get('/api/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ databases: [], tables: [] });
    const conns = db.prepare('SELECT id, name, engine, database_name, status FROM db_connections').all();
    const databases = conns.filter((c) => c.name.toLowerCase().includes(q) || c.database_name.toLowerCase().includes(q)).slice(0, 5);
    const tables = [];
    for (const c of conns) {
      for (const t of cachedTables(c.id)?.tables ?? []) {
        if (t.name.toLowerCase().includes(q)) tables.push({ connection_id: c.id, connection_name: c.name, schema: t.schema, name: t.name, type: t.type });
        if (tables.length >= 8) break;
      }
    }
    res.json({ databases, tables });
  });

  /* ---------- dashboard ---------- */
  app.get('/api/dashboard', route(async (_req, res) => {
    const conns = db.prepare('SELECT * FROM db_connections ORDER BY size_bytes DESC').all();
    const online = conns.filter((c) => c.status === 'online');
    const t = Date.now();
    const q24 = db.prepare(`SELECT COUNT(*) AS n, SUM(status='error') AS errors, COALESCE(AVG(duration_ms),0) AS avg_ms FROM query_history WHERE executed_at > ?`).get(iso(t - 24 * H));
    const qPrev = db.prepare(`SELECT COUNT(*) AS n FROM query_history WHERE executed_at > ? AND executed_at <= ?`).get(iso(t - 48 * H), iso(t - 24 * H));
    const activeConnections = online.reduce((s, c) => s + (dbSeriesData(c.id).at(-1)?.connections ?? 0), 0);
    const lastBackup = db.prepare(`SELECT * FROM backups WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1`).get() || null;
    const host = hostNow();

    res.json({
      stats: {
        databases: conns.length, online: online.length,
        tables: online.reduce((s, c) => s + c.tables_count, 0),
        totalBytes: conns.reduce((s, c) => s + c.size_bytes, 0),
        queries24h: q24.n, queriesTrend: pctChange(q24.n, qPrev.n),
        errors24h: q24.errors || 0, avgQueryMs: Math.round(q24.avg_ms),
        activeConnections,
      },
      host: { ...host, series: hostSeriesData().map((s) => ({ t: s.t, cpu: s.cpu, ram: s.ram })) },
      databases: conns.map((c) => ({ id: c.id, name: c.name, engine: c.engine, status: c.status, tables: c.tables_count, size_bytes: c.size_bytes, last_connected_at: c.last_connected_at })),
      topTables: await topTables(),
      recentQueries: db.prepare(`
        SELECT h.id, h.query, h.duration_ms, h.status, h.executed_at, h.connection_id, COALESCE(c.name, '(deleted)') AS connection_name
        FROM query_history h LEFT JOIN db_connections c ON c.id = h.connection_id
        ORDER BY h.executed_at DESC LIMIT 8`).all(),
      lastBackup: lastBackup && { filename: lastBackup.filename, connection_name: lastBackup.connection_name, size_bytes: lastBackup.size_bytes, created_at: lastBackup.created_at },
      backupsFailed48h: db.prepare(`SELECT COUNT(*) AS n FROM backups WHERE status='failed' AND created_at > ?`).get(iso(t - 48 * H)).n,
    });
  }));
}
