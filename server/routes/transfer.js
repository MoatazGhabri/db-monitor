import zlib from 'zlib';
import { db, uuid, now } from '../lib/context.js';
import { paramsFromRow, withDb, run, num, route, isPg, quote, tableRef, friendlyError } from '../lib/drivers.js';
import { listTables } from '../lib/schema.js';
import { dumpSql, dumpCsv, dumpJson, executeScript, parseCsv, insertRows } from '../lib/dump.js';

const slug = (s) => String(s || 'db').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'db';
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const getConn = (id) => db.prepare('SELECT * FROM db_connections WHERE id = ?').get(id);

function newJob(type, conn, fields) {
  const id = uuid();
  db.prepare(`INSERT INTO io_jobs (id, type, connection_id, connection_name, target, format, filename, status, created_at)
    VALUES (?,?,?,?,?,?,?, 'running', ?)`).run(id, type, conn.id, conn.name, fields.target || '', fields.format || '', fields.filename || '', now());
  return id;
}
function finishJob(id, status, f = {}) {
  db.prepare(`UPDATE io_jobs SET status=?, size_bytes=COALESCE(?, size_bytes), rows_count=COALESCE(?, rows_count),
    statements_count=COALESCE(?, statements_count), error=?, finished_at=? WHERE id=?`)
    .run(status, f.size ?? null, f.rows ?? null, f.statements ?? null, f.error ?? null, now(), id);
}

async function columnsOf(h, table, schema) {
  if (h.type === 'pg') {
    return (await run(h, `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [schema || 'public', table])).rows.map((x) => x.name);
  }
  return (await run(h, `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`, [table])).rows.map((x) => x.name);
}

const sanitizeColumn = (s, i) => (String(s).trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || `column_${i + 1}`);

async function importTable(h, engine, { table, schema, columnsIn, rows, createTable, truncate }) {
  const q = quote(engine);
  let cols = await columnsOf(h, table, schema);
  let created = false;
  if (cols.length === 0) {
    if (!createTable) throw new Error(`Table "${table}" does not exist. Tick "Create the table if it does not exist" or create it first.`);
    const names = columnsIn.map(sanitizeColumn);
    await run(h, `CREATE TABLE ${tableRef(engine, table, schema)} (${names.map((n) => `${q(n)} TEXT`).join(', ')})`);
    cols = names;
    columnsIn = names;
    created = true;
  }
  const lower = new Map(cols.map((c) => [c.toLowerCase(), c]));
  const target = columnsIn.map((c) => lower.get(String(c).trim().toLowerCase()));
  const unknown = columnsIn.filter((_, i) => !target[i]);
  if (unknown.length) throw new Error(`Column${unknown.length > 1 ? 's' : ''} not found in "${table}": ${unknown.join(', ')}`);
  if (truncate && !created) await run(h, `DELETE FROM ${tableRef(engine, table, schema)}`);
  const inserted = await insertRows(h, engine, table, schema, target, rows);
  return { inserted, created };
}

export function registerTransferRoutes(app) {
  /* ---------- Export (streams a file) ---------- */
  app.post('/api/export', async (req, res) => {
    const b = req.body || {};
    const conn = getConn(b.connectionId);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    const format = ['sql', 'csv', 'json'].includes(b.format) ? b.format : 'sql';
    const gzip = !!b.gzip;
    let p;
    let jobId;
    try {
      p = paramsFromRow(conn);
      // resolve the requested table names against the live schema
      const all = await withDb(p, (h) => listTables(h, p));
      const wanted = Array.isArray(b.tables) ? b.tables.map((t) => String(t).trim()).filter(Boolean) : [];
      const chosen = wanted.length ? all.filter((t) => wanted.includes(t.name) || wanted.includes(`${t.schema}.${t.name}`)) : all;
      const missing = wanted.filter((w) => !all.some((t) => t.name === w || `${t.schema}.${t.name}` === w));
      if (missing.length) return res.status(400).json({ error: `Unknown table${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` });
      if (chosen.length === 0) return res.status(400).json({ error: 'This database has no tables to export' });
      if (format === 'csv' && chosen.length !== 1) return res.status(400).json({ error: 'CSV export handles one table at a time — select a single table (or use SQL / JSON).' });

      const base = format === 'csv' ? `${slug(conn.database_name)}_${chosen[0].name}` : `${slug(conn.name)}`;
      const filename = `${base}_${stamp()}.${format}${gzip ? '.gz' : ''}`;
      jobId = newJob('Export', conn, { target: chosen.length === all.length ? 'All tables' : chosen.map((t) => t.name).join(', '), format: format.toUpperCase(), filename });

      res.setHeader('Content-Type', gzip ? 'application/gzip' : format === 'sql' ? 'application/sql; charset=utf-8' : format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Job-Id', jobId);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Job-Id');

      const sink = gzip ? zlib.createGzip() : res;
      let bytes = 0;
      if (gzip) { sink.on('data', (c) => { bytes += c.length; }); sink.pipe(res); }
      const write = (chunk) => new Promise((resolve, reject) => {
        if (res.destroyed) return reject(new Error('The download was cancelled'));
        if (!gzip) bytes += Buffer.byteLength(chunk);
        if (sink.write(chunk)) resolve(); else sink.once('drain', resolve);
      });

      const stats = await withDb(p, (h) => {
        if (format === 'sql') return dumpSql(h, conn.engine, chosen, { includeSchema: b.includeSchema !== false, includeData: b.includeData !== false, dropExisting: !!b.dropExisting, dbName: conn.database_name, write });
        if (format === 'csv') return dumpCsv(h, conn.engine, chosen[0], { write });
        return dumpJson(h, conn.engine, chosen, { write });
      }, { timeoutMs: 0 });
      await new Promise((resolve) => { sink.end(); (gzip ? res : sink).once('finish', resolve); });
      finishJob(jobId, 'Completed', { size: bytes, rows: stats.rows });
    } catch (err) {
      const message = friendlyError(err, p);
      if (jobId) finishJob(jobId, 'Failed', { error: message });
      if (!res.headersSent) res.status(500).json({ error: message });
      else res.destroy(err);
    }
  });

  /* ---------- Import ---------- */
  app.post('/api/import', async (req, res) => {
    const b = req.body || {};
    const conn = getConn(b.connectionId);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    const format = ['sql', 'csv', 'json'].includes(b.format) ? b.format : null;
    if (!format) return res.status(400).json({ error: 'Unsupported format — use SQL, CSV or JSON' });
    if (typeof b.content !== 'string' || !b.content.trim()) return res.status(400).json({ error: 'The file is empty' });
    const filename = String(b.filename || `import.${format}`);
    let p;
    const jobId = newJob('Import', conn, { target: b.tableName || (format === 'sql' ? 'SQL script' : ''), format: format.toUpperCase(), filename });
    const size = Buffer.byteLength(b.content);
    try {
      p = paramsFromRow(conn);
      let result;
      if (format === 'sql') {
        const r = await withDb(p, (h) => executeScript(h, conn.engine, b.content, { stopOnError: b.stopOnError !== false }), { timeoutMs: 0 });
        result = { statements: r.executed, total: r.total, failed: r.failed, errors: r.errors, rolledBack: r.rolledBack, rows: 0 };
      } else {
        const table = String(b.tableName || '').trim();
        if (!table) return (finishJob(jobId, 'Failed', { error: 'Choose the destination table', size }), res.status(400).json({ error: 'Choose the destination table' }));
        const datasets = []; // { table, columns, rows }
        if (format === 'csv') {
          const { headers, rows } = parseCsv(b.content);
          if (!headers.length || headers.every((h) => !h)) throw new Error('The CSV has no header row');
          const emptyNull = b.emptyAsNull !== false;
          datasets.push({ table, columns: headers, rows: rows.map((r) => headers.map((_, i) => (r[i] === undefined || (emptyNull && r[i] === '') ? null : r[i]))) });
        } else {
          let data;
          try { data = JSON.parse(b.content); } catch (e) { throw new Error(`Invalid JSON: ${e.message}`); }
          const entries = Array.isArray(data) ? [[table, data]] : Object.entries(data);
          for (const [name, list] of entries) {
            if (!Array.isArray(list)) throw new Error(`"${name}" must be an array of objects`);
            const columns = [...new Set(list.flatMap((o) => Object.keys(o || {})))];
            datasets.push({ table: name, columns, rows: list.map((o) => columns.map((c) => { const v = o?.[c]; return v !== null && typeof v === 'object' ? JSON.stringify(v) : v ?? null; })) });
          }
        }
        let total = 0;
        const notes = [];
        await withDb(p, async (h) => {
          if (h.type === 'pg') await h.client.query('BEGIN');
          try {
            for (const d of datasets) {
              const r = await importTable(h, conn.engine, { table: d.table, schema: b.schema, columnsIn: d.columns, rows: d.rows, createTable: !!b.createTable, truncate: !!b.truncate });
              total += r.inserted;
              notes.push(`${r.inserted} row${r.inserted === 1 ? '' : 's'} into ${d.table}${r.created ? ' (table created)' : ''}`);
            }
            if (h.type === 'pg') await h.client.query('COMMIT');
          } catch (e) {
            if (h.type === 'pg') await h.client.query('ROLLBACK').catch(() => {});
            throw e;
          }
        }, { timeoutMs: 0 });
        result = { statements: 0, failed: 0, errors: [], rows: total, notes };
      }
      const failed = result.failed > 0;
      finishJob(jobId, failed ? 'Failed' : 'Completed', { size, rows: result.rows, statements: result.statements, error: failed ? `${result.errors[0]?.error}` : null });
      res.json({ success: !failed, jobId, ...result });
    } catch (err) {
      const message = friendlyError(err, p);
      finishJob(jobId, 'Failed', { size, error: message });
      res.status(400).json({ error: message, jobId });
    }
  });

  /* ---------- Jobs ---------- */
  app.get('/api/io-jobs', (_req, res) => {
    res.json({ jobs: db.prepare('SELECT * FROM io_jobs ORDER BY created_at DESC LIMIT 100').all() });
  });
  app.delete('/api/io-jobs', (_req, res) => {
    res.json({ deleted: db.prepare(`DELETE FROM io_jobs WHERE status != 'running'`).run().changes });
  });

  // Unused import guards for tree-shakers / linters
  void num; void isPg;
}
