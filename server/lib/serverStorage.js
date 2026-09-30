import fs from 'fs';
import path from 'path';
import { db, uuid, now } from './context.js';
import { paramsFromRow, withDb, run, num } from './drivers.js';
import { diskUsage } from './metrics.js';
import * as docker from './dockerClient.js';

/* =====================================================================
 * Disk level classification (used by the recommendation engine)
 * ===================================================================== */
export function diskLevel(percent) {
  if (percent >= 95) return 'critical';
  if (percent >= 85) return 'low';
  if (percent >= 70) return 'warning';
  return 'ok';
}
const LEVEL_LABEL = { ok: 'Tout va bien', warning: 'Attention', low: 'Espace faible', critical: 'Critique' };

/* =====================================================================
 * Logs — only rotated / compressed log files are ever candidates for cleanup.
 * The active *.log file currently being written to is never touched: this
 * mirrors what logrotate itself would eventually do, not an arbitrary delete.
 * ===================================================================== */
const LOG_DIR = process.env.HOST_LOG_DIR || '';
const ROTATED_LOG_RE = /(\.\d+)(\.gz)?$|\.gz$|\.old$/i;
const WALK_LIMITS = { maxFiles: 40000, maxMs: 4000 };

function walkLogs(dir) {
  const files = [];
  let total = 0;
  const start = Date.now();
  const stack = [dir];
  let scanned = 0;
  let truncated = false;
  while (stack.length) {
    if (scanned > WALK_LIMITS.maxFiles || Date.now() - start > WALK_LIMITS.maxMs) { truncated = true; break; }
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      scanned++;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) { if (!e.isSymbolicLink()) stack.push(full); continue; }
      if (!e.isFile()) continue;
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      total += size;
      if (ROTATED_LOG_RE.test(e.name)) files.push({ path: full, name: e.name, size });
    }
  }
  files.sort((a, b) => b.size - a.size);
  return { total, rotated: files, truncated };
}

export function logsSummary() {
  if (!LOG_DIR) return { available: false, reason: "No host log directory is mounted. Mount your host's /var/log (read-write) to /hostlogs in docker-compose.yml to enable this." };
  if (!fs.existsSync(LOG_DIR)) return { available: false, reason: `Configured log directory "${LOG_DIR}" was not found.` };
  const { total, rotated, truncated } = walkLogs(LOG_DIR);
  const reclaimable = rotated.reduce((s, f) => s + f.size, 0);
  return {
    available: true,
    totalBytes: total,
    reclaimableBytes: reclaimable,
    rotatedFileCount: rotated.length,
    topFiles: rotated.slice(0, 15).map((f) => ({ name: f.name, path: f.path, size: f.size })),
    truncated,
    level: total > 5 * 1024 ** 3 ? 'warning' : 'ok',
  };
}

export function cleanupLogs() {
  const summary = logsSummary();
  if (!summary.available) throw new Error(summary.reason);
  let freed = 0;
  let deleted = 0;
  const errors = [];
  for (const f of summary.topFiles.length === summary.rotatedFileCount ? summary.topFiles : walkLogs(LOG_DIR).rotated) {
    try { fs.unlinkSync(f.path); freed += f.size; deleted++; }
    catch (err) { errors.push(`${f.name}: ${err.message}`); }
  }
  return { freedBytes: freed, deletedCount: deleted, errors };
}

/* =====================================================================
 * Docker
 * ===================================================================== */
const DANGLING_TAGS = new Set(['', '<none>:<none>']);
const isDangling = (img) => !img.RepoTags || img.RepoTags.length === 0 || img.RepoTags.every((t) => DANGLING_TAGS.has(t));

async function classifyImages() {
  const [images, containers] = await Promise.all([docker.listImages(), docker.listContainers(true)]);
  const usedIds = new Set(containers.map((c) => c.ImageID));
  const used = [];
  const danglingList = [];
  const unusedTagged = [];
  for (const img of images) {
    if (usedIds.has(img.Id)) { used.push(img); continue; }
    if (isDangling(img)) danglingList.push(img); else unusedTagged.push(img);
  }
  return { images, containers, used, dangling: danglingList, unusedTagged };
}

export async function dockerSummary() {
  const avail = await docker.dockerAvailable();
  if (!avail.ok) return { available: false, reason: avail.reason };
  const { images, containers, used, dangling, unusedTagged } = await classifyImages();
  const stopped = containers.filter((c) => c.State === 'exited' || c.State === 'created');
  const volumesRes = await docker.listVolumes();
  const volumes = volumesRes.Volumes || [];
  const unusedVolumes = volumes.filter((v) => !(v.UsageData?.RefCount > 0));
  const df = await docker.systemDf();
  const buildCache = (df.BuildCache || []).filter((c) => !c.InUse);

  const reclaimableImages = [...dangling, ...unusedTagged].reduce((s, i) => s + (i.Size || 0), 0);
  const withSizes = await docker.listContainers(true, true).catch(() => null);
  const stoppedWithSize = withSizes ? withSizes.filter((c) => c.State === 'exited' || c.State === 'created') : stopped;
  const reclaimableContainers = stoppedWithSize.reduce((s, c) => s + (c.SizeRw || 0), 0);
  const reclaimableBuildCache = buildCache.reduce((s, c) => s + (c.Size || 0), 0);

  return {
    available: true,
    images: { total: images.length, used: used.length, dangling: dangling.length, unusedTagged: unusedTagged.length, totalBytes: images.reduce((s, i) => s + i.Size, 0), reclaimableBytes: reclaimableImages },
    containers: { total: containers.length, running: containers.length - stopped.length, stopped: stopped.length, reclaimableBytes: reclaimableContainers },
    volumes: { total: volumes.length, unused: unusedVolumes.length, totalBytes: volumes.reduce((s, v) => s + (v.UsageData?.Size || 0), 0) },
    buildCache: { count: buildCache.length, reclaimableBytes: reclaimableBuildCache },
    reclaimableTotal: reclaimableImages + reclaimableContainers + reclaimableBuildCache,
  };
}

export async function dockerImages() {
  const { images, containers } = await classifyImages();
  const containerNamesByImage = new Map();
  for (const c of containers) {
    if (!containerNamesByImage.has(c.ImageID)) containerNamesByImage.set(c.ImageID, []);
    containerNamesByImage.get(c.ImageID).push((c.Names?.[0] || c.Id).replace(/^\//, ''));
  }
  return images.map((img) => ({
    id: img.Id, tags: img.RepoTags || [], size: img.Size, created: new Date(img.Created * 1000).toISOString(),
    status: containerNamesByImage.has(img.Id) ? 'used' : isDangling(img) ? 'dangling' : 'unused',
    containers: containerNamesByImage.get(img.Id) || [],
  })).sort((a, b) => b.size - a.size);
}

export async function dockerContainers() {
  const list = await docker.listContainers(true, true);
  return Promise.all(list.map(async (c) => {
    let health = null;
    try { const d = await docker.inspectContainer(c.Id); health = d.State?.Health?.Status ?? null; } catch { /* ignore */ }
    return {
      id: c.Id, name: (c.Names?.[0] || c.Id).replace(/^\//, ''), image: c.Image, state: c.State, status: c.Status,
      created: new Date(c.Created * 1000).toISOString(), sizeRw: c.SizeRw ?? null, health,
      volumes: (c.Mounts || []).filter((m) => m.Type === 'volume').map((m) => m.Name),
    };
  }));
}

export async function dockerVolumesList() {
  const [{ Volumes: volumes }, containers] = await Promise.all([docker.listVolumes(), docker.listContainers(true)]);
  const usersByVolume = new Map();
  for (const c of containers) {
    for (const m of c.Mounts || []) {
      if (m.Type !== 'volume') continue;
      if (!usersByVolume.has(m.Name)) usersByVolume.set(m.Name, []);
      usersByVolume.get(m.Name).push((c.Names?.[0] || c.Id).replace(/^\//, ''));
    }
  }
  return (volumes || []).map((v) => ({
    name: v.Name, size: v.UsageData?.Size ?? null, createdAt: v.CreatedAt,
    usedBy: usersByVolume.get(v.Name) || [], status: (usersByVolume.get(v.Name) || []).length > 0 ? 'used' : 'unused',
  })).sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
}

/** Full Docker deep-dive: everything dockerSummary has, plus the per-item lists, in one call. */
export async function dockerAnalyze() {
  const avail = await docker.dockerAvailable();
  if (!avail.ok) return { available: false, reason: avail.reason };
  const [summary, images, containers, volumes] = await Promise.all([dockerSummary(), dockerImages(), dockerContainers(), dockerVolumesList()]);
  return { available: true, summary, images, containers, volumes };
}

/* =====================================================================
 * MySQL / MariaDB — reuses DBHub's own connected databases (real, live).
 * ===================================================================== */
function mysqlConnections() {
  const rows = db.prepare(`SELECT * FROM db_connections WHERE engine IN ('mysql','mariadb') AND status = 'online'`).all();
  // Several DBHub connections can point at the same physical server (same host:port, different
  // credentials or default database). Query each physical server only once to avoid double-counting.
  const seen = new Set();
  return rows.filter((r) => {
    const key = `${r.host}:${r.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function mysqlSummary() {
  const conns = mysqlConnections();
  if (conns.length === 0) return { available: false, reason: 'No connected MySQL/MariaDB database. Connect one from Databases first.' };
  const perConn = await Promise.allSettled(conns.map(async (row) => {
    const p = paramsFromRow(row);
    return withDb(p, async (h) => {
      const r = await run(h, `
        SELECT table_schema AS name, SUM(data_length + index_length) AS bytes, COUNT(*) AS tables
        FROM information_schema.tables WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')
        GROUP BY table_schema ORDER BY bytes DESC`);
      return { connection: row.name, databases: r.rows.map((x) => ({ name: x.name, bytes: num(x.bytes), tables: num(x.tables) })) };
    }, { timeoutMs: 10000 });
  }));
  const databases = [];
  const errors = [];
  for (let i = 0; i < perConn.length; i++) {
    const r = perConn[i];
    if (r.status === 'fulfilled') databases.push(...r.value.databases.map((d) => ({ ...d, connection: r.value.connection })));
    else errors.push(`${conns[i].name}: ${r.reason.message}`);
  }
  const totalBytes = databases.reduce((s, d) => s + d.bytes, 0);
  return { available: true, totalBytes, databases: databases.sort((a, b) => b.bytes - a.bytes), errors };
}

export async function mysqlTopTables(limit = 10) {
  const conns = mysqlConnections();
  if (conns.length === 0) return { available: false, reason: 'No connected MySQL/MariaDB database.' };
  const all = [];
  const errors = [];
  for (const row of conns) {
    try {
      const p = paramsFromRow(row);
      await withDb(p, async (h) => {
        const r = await run(h, `
          SELECT table_schema AS db, table_name AS name, (data_length + index_length) AS bytes, table_rows AS rows_
          FROM information_schema.tables WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')
          ORDER BY bytes DESC LIMIT ?`, [limit]);
        for (const x of r.rows) all.push({ connection: row.name, database: x.db, table: x.name, bytes: num(x.bytes), rows: num(x.rows_) });
      }, { timeoutMs: 10000 });
    } catch (err) {
      errors.push(`${row.name}: ${err.message}`);
    }
  }
  all.sort((a, b) => b.bytes - a.bytes);
  return { available: true, tables: all.slice(0, limit), errors };
}

/* =====================================================================
 * Recommendations
 * ===================================================================== */
export async function buildRecommendations() {
  const disk = diskUsage();
  const level = diskLevel(disk.percent);
  const dockerSum = await dockerSummary().catch((err) => ({ available: false, reason: err.message }));
  const logs = logsSummary();
  const items = [];
  if (dockerSum.available) {
    if (dockerSum.images.reclaimableBytes > 0) items.push({ key: 'docker_images', label: 'Anciennes images Docker inutilisées', bytes: dockerSum.images.reclaimableBytes, safe: true });
    if (dockerSum.containers.reclaimableBytes > 0) items.push({ key: 'docker_containers', label: 'Conteneurs arrêtés', bytes: dockerSum.containers.reclaimableBytes, safe: true });
    if (dockerSum.buildCache.reclaimableBytes > 0) items.push({ key: 'docker_buildcache', label: 'Cache de compilation Docker inutilisé', bytes: dockerSum.buildCache.reclaimableBytes, safe: true });
  }
  if (logs.available && logs.reclaimableBytes > 0) items.push({ key: 'logs', label: 'Anciens fichiers de logs déjà archivés', bytes: logs.reclaimableBytes, safe: true });
  const totalReclaimable = items.reduce((s, i) => s + i.bytes, 0);
  return {
    disk, level, levelLabel: LEVEL_LABEL[level],
    dockerAvailable: dockerSum.available, logsAvailable: logs.available,
    items, totalReclaimable,
  };
}

/* =====================================================================
 * Operations history
 * ===================================================================== */
export function startOperation(operation, label, beforeBytes) {
  const id = uuid();
  db.prepare(`INSERT INTO server_operations (id, operation, label, status, before_bytes, created_at) VALUES (?,?,?, 'running', ?, ?)`)
    .run(id, operation, label, beforeBytes ?? null, now());
  return id;
}
export function finishOperation(id, { status, afterBytes, beforeBytes, detail, error }) {
  const freed = (beforeBytes !== undefined && afterBytes !== undefined && beforeBytes !== null && afterBytes !== null) ? Math.max(0, beforeBytes - afterBytes) : null;
  db.prepare(`UPDATE server_operations SET status=?, after_bytes=?, freed_bytes=?, detail=?, error=?, finished_at=? WHERE id=?`)
    .run(status, afterBytes ?? null, freed, detail ?? null, error ?? null, now(), id);
}
export function listOperations(limit = 100) {
  return db.prepare('SELECT * FROM server_operations ORDER BY created_at DESC LIMIT ?').all(limit);
}
