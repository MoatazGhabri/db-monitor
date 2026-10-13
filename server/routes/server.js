import { route } from '../lib/drivers.js';
import { diskUsage } from '../lib/metrics.js';
import * as docker from '../lib/dockerClient.js';
import {
  diskLevel, logsSummary, cleanupLogs, dockerSummary, dockerImages, dockerContainers,
  dockerVolumesList, dockerAnalyze, mysqlSummary, mysqlTopTables, buildRecommendations,
  startOperation, finishOperation, listOperations,
} from '../lib/serverStorage.js';

const bytesOf = () => diskUsage().used;

export function registerServerRoutes(app) {
  /* ---------- Storage overview + full analysis ---------- */
  app.get('/api/server/storage', route(async (_req, res) => {
    const disk = diskUsage();
    const [dockerSum, mysqlSum, logs] = await Promise.all([
      dockerSummary().catch((err) => ({ available: false, reason: err.message })),
      mysqlSummary().catch((err) => ({ available: false, reason: err.message })),
      Promise.resolve(logsSummary()),
    ]);
    res.json({
      disk: { ...disk, level: diskLevel(disk.percent) },
      breakdown: {
        docker: dockerSum.available ? dockerSum.images.totalBytes + dockerSum.volumes.totalBytes : null,
        mysql: mysqlSum.available ? mysqlSum.totalBytes : null,
        logs: logs.available ? logs.totalBytes : null,
      },
      dockerAvailable: dockerSum.available, mysqlAvailable: mysqlSum.available, logsAvailable: logs.available,
    });
  }));

  app.get('/api/server/storage/analyze', route(async (_req, res) => {
    const recommendations = await buildRecommendations();
    const [dockerA, mysqlSum, topTables, logs] = await Promise.all([
      dockerAnalyze().catch((err) => ({ available: false, reason: err.message })),
      mysqlSummary().catch((err) => ({ available: false, reason: err.message })),
      mysqlTopTables(10).catch((err) => ({ available: false, reason: err.message })),
      Promise.resolve(logsSummary()),
    ]);
    res.json({ recommendations, docker: dockerA, mysql: mysqlSum, mysqlTopTables: topTables, logs });
  }));

  app.get('/api/server/health', route(async (_req, res) => {
    const avail = await docker.dockerAvailable();
    if (!avail.ok) return res.json({ available: false, reason: avail.reason, services: [] });
    const containers = await docker.listContainers(true);
    const services = await Promise.all(containers.map(async (c) => {
      let health = null;
      try { const d = await docker.inspectContainer(c.Id); health = d.State?.Health?.Status ?? null; } catch { /* ignore */ }
      const name = (c.Names?.[0] || c.Id).replace(/^\//, '');
      const level = c.State !== 'running' ? 'down' : health === 'unhealthy' ? 'warning' : health === 'starting' ? 'warning' : 'ok';
      return { id: c.Id, name, image: c.Image, state: c.State, status: c.Status, health, level };
    }));
    res.json({ available: true, services: services.sort((a, b) => a.name.localeCompare(b.name)) });
  }));

  app.get('/api/server/operations', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    res.json({ operations: listOperations(limit) });
  });

  /* ---------- Docker ---------- */
  app.get('/api/docker/summary', route(async (_req, res) => res.json(await dockerSummary())));
  app.get('/api/docker/images', route(async (_req, res) => res.json({ images: await dockerImages() })));
  app.get('/api/docker/containers', route(async (_req, res) => res.json({ containers: await dockerContainers() })));
  app.get('/api/docker/volumes', route(async (_req, res) => res.json({ volumes: await dockerVolumesList() })));
  app.get('/api/docker/analyze', route(async (_req, res) => res.json(await dockerAnalyze())));

  app.post('/api/docker/cleanup/images', route(async (req, res) => {
    const before = bytesOf();
    const opId = startOperation('cleanup_unused_images', 'Nettoyage des images Docker inutilisées', before);
    try {
      const result = await docker.pruneImages(!!req.body?.danglingOnly);
      const after = bytesOf();
      const freed = result.SpaceReclaimed ?? 0;
      finishOperation(opId, { status: 'completed', beforeBytes: before, afterBytes: after, detail: `${result.ImagesDeleted?.length ?? 0} image(s) removed` });
      res.json({ success: true, imagesDeleted: result.ImagesDeleted?.length ?? 0, freedBytes: freed });
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err.message });
      res.status(500).json({ error: err.message });
    }
  }));

  app.post('/api/docker/cleanup/containers', route(async (req, res) => {
    const before = bytesOf();
    const opId = startOperation('cleanup_stopped_containers', 'Nettoyage des conteneurs arrêtés', before);
    try {
      const result = await docker.pruneContainers();
      const after = bytesOf();
      finishOperation(opId, { status: 'completed', beforeBytes: before, afterBytes: after, detail: `${result.ContainersDeleted?.length ?? 0} container(s) removed` });
      res.json({ success: true, containersDeleted: result.ContainersDeleted?.length ?? 0, freedBytes: result.SpaceReclaimed ?? 0 });
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err.message });
      res.status(500).json({ error: err.message });
    }
  }));

  app.post('/api/docker/cleanup/buildcache', route(async (_req, res) => {
    const before = bytesOf();
    const opId = startOperation('cleanup_build_cache', 'Nettoyage du cache de compilation Docker', before);
    try {
      const result = await docker.pruneBuildCache();
      const after = bytesOf();
      finishOperation(opId, { status: 'completed', beforeBytes: before, afterBytes: after, detail: `${result.CachesDeleted?.length ?? 0} cache entrie(s) removed` });
      res.json({ success: true, freedBytes: result.SpaceReclaimed ?? 0 });
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err.message });
      res.status(500).json({ error: err.message });
    }
  }));

  /** Removes ONE named volume — never a bulk prune. Docker itself refuses if a container still uses it. */
  app.post('/api/docker/cleanup/volumes', route(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing volume name' });
    const before = bytesOf();
    const opId = startOperation('cleanup_volume', `Suppression du volume "${name}"`, before);
    try {
      await docker.removeVolume(name);
      const after = bytesOf();
      finishOperation(opId, { status: 'completed', beforeBytes: before, afterBytes: after, detail: name });
      res.json({ success: true });
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err.message });
      const status = err.status === 409 ? 409 : 500;
      res.status(status).json({ error: err.status === 409 ? `Volume "${name}" is still used by a container and was not removed.` : err.message });
    }
  }));

  /** Safe combo: unused images + stopped containers + build cache. Never touches volumes or MySQL data. */
  app.post('/api/server/cleanup/recommended', route(async (_req, res) => {
    const before = bytesOf();
    const opId = startOperation('cleanup_recommended', 'Nettoyage recommandé', before);
    const results = { images: null, containers: null, buildCache: null, errors: [] };
    try { results.images = await docker.pruneImages(false); } catch (err) { results.errors.push(`images: ${err.message}`); }
    try { results.containers = await docker.pruneContainers(); } catch (err) { results.errors.push(`containers: ${err.message}`); }
    try { results.buildCache = await docker.pruneBuildCache(); } catch (err) { results.errors.push(`build cache: ${err.message}`); }
    const after = bytesOf();
    const freed = (results.images?.SpaceReclaimed ?? 0) + (results.containers?.SpaceReclaimed ?? 0) + (results.buildCache?.SpaceReclaimed ?? 0);
    const status = results.errors.length === 0 ? 'completed' : (results.images || results.containers || results.buildCache) ? 'partial' : 'failed';
    finishOperation(opId, { status, beforeBytes: before, afterBytes: after, detail: JSON.stringify(results.errors), error: results.errors.join('; ') || null });
    res.json({ success: status !== 'failed', status, freedBytes: freed, errors: results.errors });
  }));

  /* ---------- MySQL ---------- */
  app.get('/api/mysql/summary', route(async (_req, res) => res.json(await mysqlSummary())));
  app.get('/api/mysql/databases', route(async (_req, res) => res.json(await mysqlSummary())));
  app.get('/api/mysql/tables', route(async (req, res) => res.json(await mysqlTopTables(Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50)))));

  /* ---------- Logs ---------- */
  app.get('/api/logs/summary', (_req, res) => res.json(logsSummary()));
  app.post('/api/logs/cleanup', route(async (_req, res) => {
    const before = bytesOf();
    const opId = startOperation('cleanup_logs', 'Nettoyage des anciens logs', before);
    try {
      const result = cleanupLogs();
      const after = bytesOf();
      finishOperation(opId, { status: 'completed', beforeBytes: before, afterBytes: after, detail: `${result.deletedCount} file(s) removed`, error: result.errors.join('; ') || null });
      res.json({ success: true, ...result });
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err.message });
      res.status(400).json({ error: err.message });
    }
  }));
}
