import { db, prefs } from '../lib/context.js';
import { route } from '../lib/drivers.js';
import { hostNow, hostSeriesData, dbSeriesData, liveDb } from '../lib/metrics.js';

export function registerMonitoringRoutes(app) {
  app.post('/api/monitoring', route(async (req, res) => {
    const { connectionId } = req.body || {};
    const conn = connectionId ? db.prepare('SELECT * FROM db_connections WHERE id = ?').get(connectionId) : null;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const slowMs = Number(prefs().slowQueryMs) || 1000;

    const where = conn ? 'AND connection_id = ?' : '';
    const args = conn ? [conn.id] : [];
    const slow = db.prepare(`
      SELECT query, COUNT(*) AS calls, AVG(duration_ms) AS avg_ms, MAX(duration_ms) AS max_ms
      FROM query_history WHERE executed_at > ? AND status != 'error' ${where}
      GROUP BY query ORDER BY avg_ms DESC LIMIT 5`).all(since, ...args)
      .map((q) => ({ ...q, avg_ms: Math.round(q.avg_ms), impact: q.avg_ms >= slowMs ? 'high' : q.avg_ms >= slowMs / 2 ? 'medium' : 'low' }));

    const latency = db.prepare(`
      SELECT substr(executed_at, 1, 13) AS hour, AVG(duration_ms) AS avg_ms, COUNT(*) AS n
      FROM query_history WHERE executed_at > ? ${where} GROUP BY hour ORDER BY hour`).all(since, ...args)
      .map((r) => ({ hour: r.hour, avg_ms: Math.round(r.avg_ms), count: r.n }));

    let dbLive = null;
    let dbError = null;
    if (conn) {
      try {
        const live = await liveDb(conn);
        dbLive = { ...live, series: dbSeriesData(conn.id) };
      } catch (err) {
        dbError = err.message;
      }
    }
    res.json({ host: { ...hostNow(), series: hostSeriesData() }, db: dbLive, dbError, slow, latency, slowThresholdMs: slowMs });
  }));
}
