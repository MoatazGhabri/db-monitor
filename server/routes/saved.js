import { db, uuid, now } from '../lib/context.js';

const row = (r) => ({ ...r });

export function registerSavedQueryRoutes(app) {
  app.get('/api/saved-queries', (_req, res) => {
    const rows = db.prepare(`
      SELECT sq.*, c.name AS connection_name
      FROM saved_queries sq
      LEFT JOIN db_connections c ON c.id = sq.connection_id
      ORDER BY sq.created_at DESC`).all();
    res.json({ queries: rows.map(row) });
  });

  app.post('/api/saved-queries', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const sql = String(req.body?.sql || '').trim();
    const connectionId = req.body?.connectionId || null;
    if (!name) return res.status(400).json({ error: 'Give the query a name' });
    if (!sql) return res.status(400).json({ error: 'The query is empty' });
    const id = uuid();
    const ts = now();
    db.prepare(`INSERT INTO saved_queries (id, name, sql, connection_id, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
      .run(id, name, sql, connectionId, ts, ts);
    const saved = db.prepare(`
      SELECT sq.*, c.name AS connection_name FROM saved_queries sq
      LEFT JOIN db_connections c ON c.id = sq.connection_id WHERE sq.id = ?`).get(id);
    res.json({ query: row(saved) });
  });

  app.delete('/api/saved-queries/:id', (req, res) => {
    db.prepare('DELETE FROM saved_queries WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });
}
