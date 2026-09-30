import { db, uuid, now, prefs } from '../lib/context.js';
import { encrypt, decrypt } from '../lib/secrets.js';
import {
  isPg, paramsFromRow, friendlyError, withDb, run, num, cleanRows, qPg, qMy, tableRef, route,
} from '../lib/drivers.js';
import { probe, listTablesFor, refineRowCounts, listTables, cacheTables, forgetTables, EXACT_COUNT_LIMIT } from '../lib/schema.js';
import { notifyEvent } from '../lib/notify.js';

export const getConnRow = (id) => db.prepare('SELECT * FROM db_connections WHERE id = ?').get(id);

/** Never send the stored password back to the browser. */
export function publicConn(row) {
  if (!row) return row;
  return { ...row, password_encrypted: '', ssl_enabled: !!row.ssl_enabled };
}

/** Load the stored connection referenced by `connectionId` and attach its parameters. */
function needConn(req, res) {
  const id = req.body?.connectionId;
  const row = id ? getConnRow(id) : null;
  if (!row) { res.status(404).json({ error: 'Connection not found' }); return null; }
  req.connParams = paramsFromRow(row);
  return row;
}

/** Really connect to the stored database and persist the outcome (status, tables, size). */
export async function checkAndUpdate(id) {
  const row = getConnRow(id);
  let p;
  try {
    p = paramsFromRow(row);
    const info = await probe(p);
    const ts = now();
    db.prepare(`UPDATE db_connections
      SET status='online', tables_count=?, size_bytes=?, last_connected_at=?, updated_at=? WHERE id=?`)
      .run(info.tables, Math.round(info.size), ts, ts, id);
    return { ok: true, version: info.version, latency_ms: info.latency_ms, connection: publicConn(getConnRow(id)) };
  } catch (err) {
    const error = friendlyError(err, p);
    if (row.status === 'online') notifyEvent('connectionDown', `Database "${row.name}" is unreachable`, error);
    db.prepare(`UPDATE db_connections SET status='offline', updated_at=? WHERE id=?`).run(now(), id);
    return { ok: false, error, connection: publicConn(getConnRow(id)) };
  }
}

function readConnBody(body) {
  const engine = ['mysql', 'postgresql', 'mariadb'].includes(body.engine) ? body.engine : 'mysql';
  return {
    name: String(body.name || body.database_name || '').trim(),
    engine,
    host: String(body.host || '').trim(),
    port: Number(body.port) || (isPg(engine) ? 5432 : 3306),
    database_name: String(body.database_name || '').trim(),
    username: String(body.username || '').trim(),
    password: body.password_encrypted ?? '',
    ssl_enabled: body.ssl_enabled ? 1 : 0,
  };
}

export function registerConnectionRoutes(app) {
  /* ---------- Connections ---------- */
  app.get('/api/connections', (_req, res) => {
    const rows = db.prepare('SELECT * FROM db_connections ORDER BY created_at DESC').all();
    res.json(rows.map(publicConn));
  });

  app.post('/api/connections', route(async (req, res) => {
    const c = readConnBody(req.body);
    if (!c.host || !c.database_name || !c.username) {
      return res.status(400).json({ error: 'Host, database name and username are required' });
    }
    const id = uuid();
    const ts = now();
    db.prepare(`INSERT INTO db_connections
      (id, name, engine, host, port, database_name, username, password_encrypted, ssl_enabled, status, tables_count, size_bytes, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?, 'offline', 0, 0, ?, ?)`)
      .run(id, c.name, c.engine, c.host, c.port, c.database_name, c.username, encrypt(c.password), c.ssl_enabled, ts, ts);

    // Actually connect right away so the list shows the real status.
    const result = await checkAndUpdate(id);
    res.json({ ...result.connection, connection_error: result.ok ? undefined : result.error });
  }));

  app.put('/api/connections/:id', route(async (req, res) => {
    const existing = getConnRow(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Connection not found' });
    const c = readConnBody({ ...existing, ...req.body, password_encrypted: req.body.password_encrypted });
    if (!c.host || !c.database_name || !c.username) {
      return res.status(400).json({ error: 'Host, database name and username are required' });
    }
    // An empty password field means "keep the stored one".
    const password = c.password === '' ? existing.password_encrypted : encrypt(c.password);
    db.prepare(`UPDATE db_connections
      SET name=?, engine=?, host=?, port=?, database_name=?, username=?, password_encrypted=?, ssl_enabled=?, updated_at=? WHERE id=?`)
      .run(c.name || existing.name, c.engine, c.host, c.port, c.database_name, c.username, password, c.ssl_enabled, now(), req.params.id);
    forgetTables(req.params.id);
    const result = await checkAndUpdate(req.params.id);
    res.json({ ...result.connection, connection_error: result.ok ? undefined : result.error });
  }));

  app.delete('/api/connections/:id', (req, res) => {
    db.prepare('DELETE FROM db_connections WHERE id = ?').run(req.params.id);
    forgetTables(req.params.id);
    res.json({ success: true });
  });

  /** (Re)connect to a saved database and refresh its status / table count / size. */
  app.post('/api/connections/:id/check', route(async (req, res) => {
    if (!getConnRow(req.params.id)) return res.status(404).json({ error: 'Connection not found' });
    res.json(await checkAndUpdate(req.params.id));
  }));

  app.post('/api/test-connection', async (req, res) => {
    const b = req.body.connection || req.body;
    let password = b.password ?? '';
    // Editing a saved connection: blank password = reuse the stored one.
    if (!password && b.connectionId) {
      const stored = getConnRow(b.connectionId);
      if (stored) { try { password = decrypt(stored.password_encrypted); } catch { /* reported below */ } }
    }
    const p = { engine: b.engine, host: b.host, port: b.port, database: b.database, username: b.username, password, ssl: !!b.ssl };
    if (!p.host || !p.database || !p.username) {
      return res.json({ success: false, engine: p.engine, version: '', latency_ms: 0, message: 'Host, database name and username are required' });
    }
    try {
      const info = await probe(p);
      res.json({
        success: true, engine: p.engine, version: info.version, latency_ms: info.latency_ms,
        tables: info.tables, size_bytes: info.size, message: 'Connection successful',
      });
    } catch (err) {
      res.json({ success: false, engine: p.engine, version: '', latency_ms: 0, message: friendlyError(err, p) });
    }
  });

  /* ---------- Query execution ---------- */
  app.post('/api/query', async (req, res) => {
    const { connectionId, sql, user } = req.body;
    const conn = connectionId ? getConnRow(connectionId) : null;
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    if (!sql || !String(sql).trim()) return res.json({ success: false, error: 'Empty query', columns: [], rows: [], rowsAffected: 0, durationMs: 0, executedAt: now() });

    let p;
    const start = Date.now();
    const log = (status, rows, ms) => db.prepare(`INSERT INTO query_history (id, connection_id, query, duration_ms, rows_affected, status, executed_by, executed_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(uuid(), connectionId, sql, ms, rows, status, user || 'system', now());

    try {
      p = paramsFromRow(conn);
      const result = await withDb(p, (h) => run(h, sql));
      const durationMs = Date.now() - start;
      log(durationMs > (Number(prefs().slowQueryMs) || 1000) ? 'slow' : 'success', result.rowCount, durationMs);
      res.json({
        success: true, columns: result.columns, rows: cleanRows(result.rows),
        rowsAffected: result.rowCount, durationMs, executedAt: now(),
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      log('error', 0, durationMs);
      res.json({ success: false, error: friendlyError(err, p), columns: [], rows: [], rowsAffected: 0, durationMs, executedAt: now() });
    }
  });

  app.get('/api/query-history', (req, res) => {
    const { connectionId, status, q } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 2000);
    const where = [];
    const args = [];
    if (connectionId) { where.push('h.connection_id = ?'); args.push(connectionId); }
    if (status && status !== 'all') { where.push('h.status = ?'); args.push(status); }
    if (q) { where.push('h.query LIKE ?'); args.push(`%${q}%`); }
    const rows = db.prepare(`
      SELECT h.*, COALESCE(c.name, '(deleted)') AS connection_name
      FROM query_history h LEFT JOIN db_connections c ON c.id = h.connection_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY h.executed_at DESC LIMIT ?`).all(...args, limit);
    const stats = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(status='success') AS success, SUM(status='slow') AS slow, SUM(status='error') AS error,
             COALESCE(AVG(duration_ms),0) AS avg_ms
      FROM query_history ${connectionId ? 'WHERE connection_id = ?' : ''}`).get(...(connectionId ? [connectionId] : []));
    res.json({ queries: rows, stats: { ...stats, success: stats.success || 0, slow: stats.slow || 0, error: stats.error || 0 } });
  });

  app.delete('/api/query-history', (req, res) => {
    const { connectionId } = req.query;
    const r = connectionId
      ? db.prepare('DELETE FROM query_history WHERE connection_id = ?').run(connectionId)
      : db.prepare('DELETE FROM query_history').run();
    res.json({ deleted: r.changes });
  });

  /* ---------- Schema browsing (live data straight from the connected database) ---------- */
  /** GET tables + views with size / row estimates. */
  app.post('/api/tables', route(async (req, res) => {
    const conn = needConn(req, res); if (!conn) return;
    const tables = await listTablesFor(conn);
    res.json({ tables });
  }));

  /** GET the columns of a table. */
  app.post('/api/columns', route(async (req, res) => {
    const conn = needConn(req, res); if (!conn) return;
    const { tableName, schema } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Missing tableName' });
    const columns = await withDb(req.connParams, async (h) => {
      if (h.type === 'pg') {
        const r = await run(h, `
          SELECT a.attname AS name,
                 format_type(a.atttypid, a.atttypmod) AS type,
                 NOT a.attnotnull AS nullable,
                 pg_get_expr(d.adbin, d.adrelid) AS default_value,
                 CASE
                   WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY(i.indkey)) THEN 'PRI'
                   WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisunique AND i.indnatts = 1 AND a.attnum = ANY(i.indkey)) THEN 'UNI'
                   WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey)) THEN 'MUL'
                   ELSE '' END AS col_key,
                 CASE
                   WHEN a.attidentity <> '' THEN 'IDENTITY'
                   WHEN a.attgenerated <> '' THEN 'GENERATED'
                   WHEN pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%' THEN 'AUTO_INCREMENT'
                   ELSE '' END AS extra,
                 col_description(a.attrelid, a.attnum) AS comment
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum`, [schema || 'public', tableName]);
        return r.rows;
      }
      const r = await run(h, `
        SELECT column_name AS name, column_type AS type, (is_nullable = 'YES') AS nullable,
               column_default AS default_value, column_key AS col_key, extra AS extra, column_comment AS comment
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ordinal_position`, [tableName]);
      return r.rows;
    });
    res.json({
      columns: columns.map((c) => ({
        name: c.name, type: c.type, nullable: !!c.nullable, key: c.col_key || '',
        defaultValue: c.default_value ?? null, extra: c.extra || '', comment: c.comment || '',
      })),
    });
  }));

  /** GET the indexes of a table. */
  app.post('/api/indexes', route(async (req, res) => {
    const conn = needConn(req, res); if (!conn) return;
    const { tableName, schema } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Missing tableName' });
    const indexes = await withDb(req.connParams, async (h) => {
      if (h.type === 'pg') {
        const r = await run(h, `
          SELECT i.relname AS name, am.amname AS type, ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
                 array_agg(COALESCE(a.attname, '(expression)')::text ORDER BY k.ord) AS columns
          FROM pg_index ix
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_am am ON am.oid = i.relam
          JOIN pg_namespace n ON n.oid = t.relnamespace
          CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
          LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
          WHERE n.nspname = $1 AND t.relname = $2
          GROUP BY i.relname, am.amname, ix.indisunique, ix.indisprimary
          ORDER BY ix.indisprimary DESC, i.relname`, [schema || 'public', tableName]);
        return r.rows.map((x) => ({
          name: x.name, columns: x.columns, type: String(x.type).toUpperCase(),
          unique: !!x.is_unique, primary: !!x.is_primary,
        }));
      }
      const r = await run(h, `
        SELECT index_name AS name, non_unique AS non_uniq, index_type AS type, column_name AS col, seq_in_index AS seq
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY index_name, seq_in_index`, [tableName]);
      const map = new Map();
      for (const x of r.rows) {
        if (!map.has(x.name)) {
          map.set(x.name, { name: x.name, columns: [], type: String(x.type || 'BTREE').toUpperCase(), unique: num(x.non_uniq) === 0, primary: x.name === 'PRIMARY' });
        }
        map.get(x.name).columns.push(x.col ?? '(expression)');
      }
      return [...map.values()].sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
    });
    res.json({ indexes });
  }));

  /** GET one page of rows from a table (with an exact or estimated total). */
  app.post('/api/table-data', route(async (req, res) => {
    const conn = needConn(req, res); if (!conn) return;
    const { tableName, schema, orderBy, orderDir } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Missing tableName' });
    const pageSize = Math.min(Math.max(parseInt(req.body.pageSize, 10) || 25, 1), 500);
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const offset = (page - 1) * pageSize;
    const engine = conn.engine;
    const ref = tableRef(engine, tableName, schema);
    const q = isPg(engine) ? qPg : qMy;
    const order = orderBy ? ` ORDER BY ${q(orderBy)} ${String(orderDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}` : '';

    const out = await withDb(req.connParams, async (h) => {
      const data = await run(h, `SELECT * FROM ${ref}${order} LIMIT ${pageSize} OFFSET ${offset}`);

      // Cheap estimate first; only COUNT(*) when the table is small enough to be fast.
      let estimate = 0;
      if (h.type === 'pg') {
        const e = await run(h, `SELECT GREATEST(c.reltuples::bigint, 0)::float8 AS n FROM pg_class c WHERE c.oid = $1::regclass`, [ref]);
        estimate = num(e.rows[0]?.n);
      } else {
        const e = await run(h, `SELECT table_rows AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [tableName]);
        estimate = num(e.rows[0]?.n);
      }
      let total = estimate;
      let totalExact = false;
      if (estimate <= EXACT_COUNT_LIMIT) {
        const c = await run(h, `SELECT COUNT(*) AS total FROM ${ref}`);
        total = num(c.rows[0]?.total);
        totalExact = true;
      }
      return { ...data, total, totalExact };
    });

    res.json({
      columns: out.columns, rows: cleanRows(out.rows),
      total: out.total, totalExact: out.totalExact, page, pageSize,
    });
  }));
}
