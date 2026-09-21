import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data', 'dbhub.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(readFileSync(SCHEMA_PATH, 'utf-8'));

const { Pool: PgPool } = pg;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* ---------- helpers ---------- */
function uuid() { return randomUUID(); }
function now() { return new Date().toISOString(); }

function getConn(id) {
  return db.prepare('SELECT * FROM db_connections WHERE id = ?').get(id);
}

async function connectToDatabase(conn) {
  if (conn.engine === 'postgresql') {
    const client = new pg.Client({
      host: conn.host,
      port: conn.port,
      database: conn.database_name,
      user: conn.username,
      password: conn.password_encrypted,
      ssl: conn.ssl_enabled ? { rejectUnauthorized: false } : false,
    });
    await client.connect();
    return { type: 'pg', client };
  }
  const conn2 = await mysql.createConnection({
    host: conn.host,
    port: conn.port,
    database: conn.database_name,
    user: conn.username,
    password: conn.password_encrypted,
    ssl: conn.ssl_enabled ? {} : undefined,
  });
  return { type: 'mysql', client: conn2 };
}

async function executeOnDb(connHandle, sql) {
  if (connHandle.type === 'pg') {
    const res = await connHandle.client.query(sql);
    return {
      columns: res.fields ? res.fields.map(f => f.name) : [],
      rows: res.rows || [],
      rowsAffected: res.rowCount || 0,
    };
  }
  const [result] = await connHandle.client.query(sql);
  if (Array.isArray(result)) {
    return { columns: Object.keys(result[0] || {}), rows: result, rowsAffected: result.length };
  }
  return {
    columns: [],
    rows: [],
    rowsAffected: result.affectedRows || 0,
  };
}

/* ---------- Connections ---------- */
app.get('/api/connections', (req, res) => {
  const rows = db.prepare('SELECT * FROM db_connections ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/connections', (req, res) => {
  const { name, engine, host, port, database_name, username, password_encrypted, ssl_enabled } = req.body;
  const id = uuid();
  const ts = now();
  db.prepare(`INSERT INTO db_connections (id, name, engine, host, port, database_name, username, password_encrypted, ssl_enabled, status, tables_count, size_bytes, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?, 'offline', 0, 0, ?, ?)`).run(id, name, engine, host, port, database_name, username, password_encrypted, ssl_enabled ? 1 : 0, ts, ts);
  res.json(getConn(id));
});

app.delete('/api/connections/:id', (req, res) => {
  db.prepare('DELETE FROM db_connections WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/test-connection', async (req, res) => {
  const { host, port, database, username, password, engine, ssl } = req.body.connection || req.body;
  try {
    let handle;
    if (engine === 'postgresql') {
      const client = new pg.Client({ host, port, database, user: username, password, ssl: ssl ? { rejectUnauthorized: false } : false });
      const start = Date.now();
      await client.connect();
      const vRes = await client.query('SELECT version()');
      await client.end();
      return res.json({ success: true, engine, version: vRes.rows[0].version, latency_ms: Date.now() - start, message: 'Connection successful' });
    }
    const start = Date.now();
    const conn = await mysql.createConnection({ host, port, database, user: username, password, ssl: ssl ? {} : undefined });
    const [vRes] = await conn.query('SELECT VERSION() as v');
    await conn.end();
    res.json({ success: true, engine, version: vRes[0].v, latency_ms: Date.now() - start, message: 'Connection successful' });
  } catch (err) {
    res.json({ success: false, engine, version: '', latency_ms: 0, message: err.message });
  }
});

/* ---------- Cloud Drives ---------- */
app.get('/api/cloud-drives', (req, res) => {
  res.json(db.prepare('SELECT * FROM cloud_drives ORDER BY created_at DESC').all());
});

app.post('/api/cloud-drives', (req, res) => {
  const { provider, label, email, connected, storage_used_bytes, storage_total_bytes, folder } = req.body;
  const id = uuid();
  const ts = now();
  db.prepare(`INSERT INTO cloud_drives (id, provider, label, email, connected, storage_used_bytes, storage_total_bytes, folder, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, provider, label, email, connected ? 1 : 0, storage_used_bytes || 0, storage_total_bytes || 0, folder || '', ts, ts);
  res.json(db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(id));
});

app.put('/api/cloud-drives/:id', (req, res) => {
  const fields = ['provider', 'label', 'email', 'connected', 'storage_used_bytes', 'storage_total_bytes', 'folder'];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  sets.push('updated_at = ?'); vals.push(now()); vals.push(req.params.id);
  db.prepare(`UPDATE cloud_drives SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM cloud_drives WHERE id = ?').get(req.params.id));
});

app.delete('/api/cloud-drives/:id', (req, res) => {
  db.prepare('DELETE FROM cloud_drives WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/* ---------- Backup Schedules ---------- */
app.get('/api/backup-schedules', (req, res) => {
  res.json(db.prepare('SELECT * FROM backup_schedules ORDER BY created_at DESC').all());
});

app.post('/api/backup-schedules', (req, res) => {
  const { connection_id, drive_id, frequency, cron_expression, time, timezone, retention_count, retention_unit, enabled } = req.body;
  const id = uuid();
  const ts = now();
  db.prepare(`INSERT INTO backup_schedules (id, connection_id, drive_id, frequency, cron_expression, time, timezone, retention_count, retention_unit, enabled, backups_kept, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, 0, ?, ?)`).run(id, connection_id, drive_id, frequency, cron_expression, time, timezone, retention_count, retention_unit, enabled ? 1 : 0, ts, ts);
  res.json(db.prepare('SELECT * FROM backup_schedules WHERE id = ?').get(id));
});

app.put('/api/backup-schedules/:id', (req, res) => {
  const fields = ['frequency', 'cron_expression', 'time', 'timezone', 'retention_count', 'retention_unit', 'enabled'];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  sets.push('updated_at = ?'); vals.push(now()); vals.push(req.params.id);
  db.prepare(`UPDATE backup_schedules SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ success: true });
});

app.delete('/api/backup-schedules/:id', (req, res) => {
  db.prepare('DELETE FROM backup_schedules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/* ---------- Query Execution ---------- */
app.post('/api/query', async (req, res) => {
  const { connectionId, sql, user } = req.body;
  const conn = getConn(connectionId);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });

  const start = Date.now();
  let handle;
  try {
    handle = await connectToDatabase(conn);
    const result = await executeOnDb(handle, sql);
    const durationMs = Date.now() - start;

    db.prepare(`INSERT INTO query_history (id, connection_id, query, duration_ms, rows_affected, status, executed_by, executed_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(uuid(), connectionId, sql, durationMs, result.rowsAffected, durationMs > 1000 ? 'slow' : 'success', user || 'system', now());

    res.json({ success: true, columns: result.columns, rows: result.rows, rowsAffected: result.rowsAffected, durationMs, executedAt: now() });
  } catch (err) {
    const durationMs = Date.now() - start;
    db.prepare(`INSERT INTO query_history (id, connection_id, query, duration_ms, rows_affected, status, executed_by, executed_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(uuid(), connectionId, sql, durationMs, 0, 'error', user || 'system', now());
    res.json({ success: false, error: err.message, columns: [], rows: [], rowsAffected: 0, durationMs, executedAt: now() });
  } finally {
    if (handle) {
      if (handle.type === 'pg') handle.client.end().catch(() => {});
      else handle.client.end().catch(() => {});
    }
  }
});

app.get('/api/query-history', (req, res) => {
  const { connectionId } = req.query;
  let rows;
  if (connectionId) {
    rows = db.prepare('SELECT * FROM query_history WHERE connection_id = ? ORDER BY executed_at DESC LIMIT 100').all(connectionId);
  } else {
    rows = db.prepare('SELECT * FROM query_history ORDER BY executed_at DESC LIMIT 100').all();
  }
  res.json(rows);
});

/* ---------- Table Structure ---------- */
app.post('/api/tables', async (req, res) => {
  const { connectionId } = req.body;
  const conn = getConn(connectionId);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  let handle;
  try {
    handle = await connectToDatabase(conn);
    if (handle.type === 'pg') {
      const r = await handle.client.query(`
        SELECT tablename as name, n_live_tup as rows,
               pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_stat_user_tables ORDER BY tablename`);
      res.json({ tables: r.rows.map(t => ({ ...t, engine: 'PostgreSQL', collation: 'UTF-8' })) });
    } else {
      const [rows] = await handle.client.query(`
        SELECT table_name as name, table_rows as rows,
               CONCAT(ROUND(data_length/1024/1024,2),' MB') as size,
               engine, table_collation as collation
        FROM information_schema.tables WHERE table_schema = ?`, [conn.database_name]);
      res.json({ tables: rows });
    }
  } catch (err) {
    res.json({ tables: [], error: err.message });
  } finally {
    if (handle) {
      if (handle.type === 'pg') handle.client.end().catch(() => {});
      else handle.client.end().catch(() => {});
    }
  }
});

app.post('/api/columns', async (req, res) => {
  const { connectionId, tableName } = req.body;
  const conn = getConn(connectionId);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  let handle;
  try {
    handle = await connectToDatabase(conn);
    if (handle.type === 'pg') {
      const r = await handle.client.query(`
        SELECT column_name as name, data_type as type, is_nullable = 'YES' as nullable,
               column_default as defaultValue, '' as key, '' as extra
        FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [tableName]);
      res.json({ columns: r.rows });
    } else {
      const [rows] = await handle.client.query(`
        SELECT column_name as name, column_type as type, is_nullable = 'YES' as nullable,
               column_default as defaultValue, column_key as key, extra
        FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`, [conn.database_name, tableName]);
      res.json({ columns: rows });
    }
  } catch (err) {
    res.json({ columns: [], error: err.message });
  } finally {
    if (handle) {
      if (handle.type === 'pg') handle.client.end().catch(() => {});
      else handle.client.end().catch(() => {});
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`DBHub local server running on port ${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
