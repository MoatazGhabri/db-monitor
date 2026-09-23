import express from 'express';
import cors from 'cors';
import { DB_PATH, DATA_DIR, VERSION, db, prefs, now } from './lib/context.js';
import { IN_DOCKER } from './lib/drivers.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { registerPlatformRoutes } from './routes/platform.js';
import { registerMonitoringRoutes } from './routes/monitoring.js';
import { registerUserRoutes } from './routes/users.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { registerBackupRoutes } from './routes/backups.js';
import { startSamplers } from './lib/metrics.js';
import { startScheduler } from './lib/backup.js';

const app = express();
app.use(cors());
// Imports upload whole files as JSON, so allow large bodies.
app.use(express.json({ limit: '250mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, version: VERSION, docker: IN_DOCKER }));

registerConnectionRoutes(app);
registerPlatformRoutes(app);
registerMonitoringRoutes(app);
registerUserRoutes(app);
registerTransferRoutes(app);
registerBackupRoutes(app);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

/** Query history retention (Settings → Preferences). */
function purgeHistory() {
  const days = Number(prefs().historyRetentionDays);
  if (!days) return;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const r = db.prepare('DELETE FROM query_history WHERE executed_at < ?').run(cutoff);
  if (r.changes) console.log(`[history] purged ${r.changes} entries older than ${days} days`);
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`DBHub server v${VERSION} running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR} (${DB_PATH})${IN_DOCKER ? ' [docker]' : ''}`);
  startSamplers();
  startScheduler();
  purgeHistory();
  setInterval(purgeHistory, 6 * 3600_000).unref();
  void now;
});
