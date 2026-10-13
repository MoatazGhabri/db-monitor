import os from 'os';
import fs from 'fs';
import { db, DATA_DIR, now } from './context.js';
import { paramsFromRow, withDb, run, num, isPg } from './drivers.js';
import { checkAndUpdate } from '../routes/connections.js';
import { notifyEvent } from './notify.js';

const HOST_INTERVAL_MS = 15_000;
const DB_INTERVAL_MS = 30_000;
const HOST_KEEP = 480;   // 2 h at 15 s
const DB_KEEP = 240;     // 2 h at 30 s

/* =====================================================================
 * Host (the machine / container running DBHub)
 * ===================================================================== */
let prevCpu = os.cpus().map((c) => ({ ...c.times }));
const hostSeries = [];

function cpuPercent() {
  const cur = os.cpus().map((c) => ({ ...c.times }));
  let idle = 0;
  let total = 0;
  cur.forEach((t, i) => {
    const p = prevCpu[i] || t;
    for (const k of Object.keys(t)) {
      const d = t[k] - (p[k] || 0);
      total += d;
      if (k === 'idle') idle += d;
    }
  });
  prevCpu = cur;
  return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : 0;
}

export function diskUsage() {
  try {
    const s = fs.statfsSync(DATA_DIR);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, free, used: total - free, percent: total ? Math.round(((total - free) / total) * 100) : 0 };
  } catch {
    return { total: 0, free: 0, used: 0, percent: 0 };
  }
}

export function hostNow() {
  const total = os.totalmem();
  const free = os.freemem();
  const last = hostSeries[hostSeries.length - 1];
  return {
    t: Date.now(),
    cpu: last ? last.cpu : cpuPercent(),
    cpus: os.cpus().length,
    load1: os.loadavg()[0],
    ramTotal: total, ramUsed: total - free, ramPercent: Math.round(((total - free) / total) * 100),
    disk: diskUsage(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    uptimeSec: os.uptime(),
    processUptimeSec: process.uptime(),
    nodeVersion: process.version,
  };
}

export function hostSeriesData() { return hostSeries; }

function sampleHost() {
  const total = os.totalmem();
  const used = total - os.freemem();
  hostSeries.push({ t: Date.now(), cpu: +cpuPercent().toFixed(1), ram: +((used / total) * 100).toFixed(1), load1: +os.loadavg()[0].toFixed(2) });
  if (hostSeries.length > HOST_KEEP) hostSeries.shift();
}

/* =====================================================================
 * Databases
 * ===================================================================== */
const dbSeries = new Map();   // connectionId -> samples
const counters = new Map();   // connectionId -> last raw counters

export const dbSeriesData = (id) => dbSeries.get(id) || [];

async function readStatus(h) {
  if (h.type === 'pg') {
    const r = await run(h, `
      SELECT (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS connections,
             (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active')::int AS running,
             current_setting('max_connections')::int AS max_connections,
             EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::float8 AS uptime,
             (d.xact_commit + d.xact_rollback)::float8 AS queries,
             d.tup_returned::float8 AS rows_read,
             (d.tup_inserted + d.tup_updated + d.tup_deleted)::float8 AS rows_written,
             d.blks_hit::float8 AS hits, d.blks_read::float8 AS reads,
             version() AS version
      FROM pg_stat_database d WHERE d.datname = current_database()`);
    const x = r.rows[0] || {};
    return {
      version: x.version, connections: num(x.connections), running: num(x.running), maxConnections: num(x.max_connections),
      uptime: num(x.uptime), queries: num(x.queries), rowsRead: num(x.rows_read), rowsWritten: num(x.rows_written),
      hits: num(x.hits), reads: num(x.reads), unit: 'transactions',
    };
  }
  const s = await run(h, `SHOW GLOBAL STATUS WHERE Variable_name IN (
    'Threads_connected','Threads_running','Questions','Uptime','Innodb_rows_read','Innodb_rows_inserted',
    'Innodb_rows_updated','Innodb_rows_deleted','Innodb_buffer_pool_read_requests','Innodb_buffer_pool_reads')`);
  const v = Object.fromEntries(s.rows.map((r) => [r.Variable_name, num(r.Value)]));
  const m = await run(h, `SHOW GLOBAL VARIABLES WHERE Variable_name IN ('max_connections','version')`);
  const vars = Object.fromEntries(m.rows.map((r) => [r.Variable_name, r.Value]));
  return {
    version: vars.version, connections: v.Threads_connected || 0, running: v.Threads_running || 0,
    maxConnections: num(vars.max_connections), uptime: v.Uptime || 0, queries: v.Questions || 0,
    rowsRead: v.Innodb_rows_read || 0,
    rowsWritten: (v.Innodb_rows_inserted || 0) + (v.Innodb_rows_updated || 0) + (v.Innodb_rows_deleted || 0),
    hits: v.Innodb_buffer_pool_read_requests || 0, reads: v.Innodb_buffer_pool_reads || 0, unit: 'queries',
  };
}

function toSample(id, st) {
  const t = Date.now();
  const prev = counters.get(id);
  counters.set(id, { t, ...st });
  let qps = 0, rr = 0, rw = 0;
  if (prev && st.queries >= prev.queries) {
    const dt = (t - prev.t) / 1000 || 1;
    qps = (st.queries - prev.queries) / dt;
    rr = Math.max(0, st.rowsRead - prev.rowsRead) / dt;
    rw = Math.max(0, st.rowsWritten - prev.rowsWritten) / dt;
  }
  const cacheTotal = st.hits + st.reads;
  return {
    t, connections: st.connections, running: st.running,
    qps: +qps.toFixed(1), rowsRead: +rr.toFixed(1), rowsWritten: +rw.toFixed(1),
    cacheHit: cacheTotal > 0 ? +((st.hits / cacheTotal) * 100).toFixed(2) : null,
  };
}

async function sampleDb(row) {
  const st = await withDb(paramsFromRow(row), (h) => readStatus(h), { timeoutMs: 10000 });
  const s = toSample(row.id, st);
  const arr = dbSeries.get(row.id) || [];
  arr.push(s);
  if (arr.length > DB_KEEP) arr.shift();
  dbSeries.set(row.id, arr);
  return { sample: s, status: st };
}

/** Live details for the Monitoring page: fresh status + who is connected right now. */
export async function liveDb(row) {
  const p = paramsFromRow(row);
  return withDb(p, async (h) => {
    const st = await readStatus(h);
    let activity = [];
    if (h.type === 'pg') {
      const r = await run(h, `
        SELECT pid AS id, usename AS "user", client_addr::text AS host, datname AS db, state,
               EXTRACT(EPOCH FROM (now() - COALESCE(query_start, backend_start)))::float8 AS seconds,
               left(query, 300) AS info
        FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
        ORDER BY seconds DESC NULLS LAST LIMIT 50`);
      activity = r.rows.map((x) => ({
        id: num(x.id), user: x.user, host: x.host || 'local', database: x.db, state: x.state || 'background',
        idle: !x.state || x.state.startsWith('idle'), query: x.info || '', seconds: num(x.seconds),
      }));
    } else {
      const r = await run(h, `
        SELECT id, user, host, db, command, time, state, LEFT(info, 300) AS info
        FROM information_schema.processlist
        WHERE db = DATABASE() OR db IS NULL
        ORDER BY time DESC LIMIT 50`);
      activity = r.rows.map((x) => ({
        id: num(x.id), user: x.user, host: String(x.host || '').replace(/:\d+$/, ''), database: x.db || '—',
        state: x.command === 'Sleep' ? 'Sleep' : (x.state || x.command), idle: x.command === 'Sleep',
        query: x.info || '', seconds: num(x.time),
      }));
    }
    const sample = toSample(row.id, st);
    return { status: st, activity, sample };
  }, { timeoutMs: 10000 });
}

let cycle = 0;
async function sampleAllDbs() {
  cycle++;
  const conns = db.prepare('SELECT * FROM db_connections').all();
  await Promise.allSettled(conns.map(async (row) => {
    try {
      await sampleDb(row);
      if (row.status !== 'online') {
        db.prepare(`UPDATE db_connections SET status='online', last_connected_at=?, updated_at=? WHERE id=?`).run(now(), now(), row.id);
      }
      if (cycle % 10 === 1) await checkAndUpdate(row.id); // table count / size refresh every ~5 min
    } catch (err) {
      if (row.status === 'online') {
        db.prepare(`UPDATE db_connections SET status='offline', updated_at=? WHERE id=?`).run(now(), row.id);
        notifyEvent('connectionDown', `Database "${row.name}" is unreachable`, err.message);
      }
    }
  }));
}

/** Disk alert (fires once when crossing 90 %). */
let diskAlerted = false;
function checkDisk() {
  const d = diskUsage();
  if (d.percent >= 90 && !diskAlerted) { diskAlerted = true; notifyEvent('diskFull', 'DBHub server disk is almost full', `${d.percent}% used`); }
  if (d.percent < 85) diskAlerted = false;
}

export function startSamplers() {
  sampleHost();
  setInterval(() => { sampleHost(); checkDisk(); }, HOST_INTERVAL_MS).unref();
  const t = setTimeout(() => { sampleAllDbs(); setInterval(sampleAllDbs, DB_INTERVAL_MS).unref(); }, 2000);
  t.unref();
}

export { isPg };
