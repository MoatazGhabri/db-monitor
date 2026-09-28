import mysql from 'mysql2/promise';
import pg from 'pg';
import { existsSync } from 'fs';
import { decrypt } from './secrets.js';
import { prefs } from './context.js';

export const CONNECT_TIMEOUT_MS = 8000;
export const isPg = (engine) => engine === 'postgresql';

/**
 * Inside a Docker container "localhost" is the container itself, not the machine
 * running the database. Transparently redirect it to the Docker host.
 */
export const IN_DOCKER = existsSync('/.dockerenv');
export const HOST_ALIAS = process.env.DOCKER_HOST_ALIAS ?? 'host.docker.internal';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
export function resolveHost(host) {
  const h = String(host || '').trim();
  if (IN_DOCKER && HOST_ALIAS && LOOPBACK.has(h.toLowerCase())) return HOST_ALIAS;
  return h;
}

/** Stored row -> connection parameters used by the drivers (password decrypted). */
export function paramsFromRow(row) {
  return {
    engine: row.engine,
    host: row.host,
    port: row.port,
    database: row.database_name,
    username: row.username,
    password: decrypt(row.password_encrypted),
    ssl: !!row.ssl_enabled,
  };
}

/** Turn low level driver errors into something an admin can act on. */
export function friendlyError(err, p) {
  const code = err?.code;
  const msg = err?.message || String(err);
  const target = p ? `${p.host}:${p.port}` : 'the server';
  const inDockerLoopback = p && IN_DOCKER && LOOPBACK.has(String(p.host).toLowerCase());
  switch (code) {
    case 'ECONNREFUSED':
      return `Connection refused by ${target}. Check that the database server is running, that the port is correct` +
        ` and that it accepts remote connections (MySQL: bind-address, PostgreSQL: listen_addresses + pg_hba.conf).` +
        (inDockerLoopback ? ` "${p.host}" was mapped to the Docker host (${HOST_ALIAS}).` : '');
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Host "${p?.host}" could not be resolved. Check the host name / IP address.`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Timed out while reaching ${target}. A firewall may be blocking the port, or the host is unreachable.`;
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR':
    case '28P01':
      return `Access denied for user "${p?.username}". Check the username and password.`;
    case 'ER_DBACCESS_DENIED_ERROR':
      return `User "${p?.username}" is not allowed to access database "${p?.database}".`;
    case 'ER_BAD_DB_ERROR':
    case '3D000':
      return `Database "${p?.database}" does not exist on ${target}.`;
    case '28000':
      return `${msg} (the server rejected this client: check pg_hba.conf and the SSL setting).`;
    default:
      if (/timeout/i.test(msg) && /connect/i.test(msg)) {
        return `Timed out while connecting to ${target}. Check the host, the port and any firewall.`;
      }
      if (/SSL|TLS/i.test(msg) && !p?.ssl) {
        return `${msg} (the server may require SSL — enable "Use SSL/TLS").`;
      }
      return msg;
  }
}

/** Open a short-lived connection. `close()` is always safe to call. */
export async function openHandle(p, { timeoutMs } = {}) {
  const host = resolveHost(p.host);
  const port = Number(p.port) || (isPg(p.engine) ? 5432 : 3306);
  const queryTimeout = timeoutMs ?? (Number(prefs().queryTimeoutSec) || 30) * 1000;
  if (isPg(p.engine)) {
    const client = new pg.Client({
      host, port,
      database: p.database,
      user: p.username,
      password: p.password,
      ssl: p.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: queryTimeout || undefined,
    });
    client.on('error', () => {}); // avoid crashing the process on idle socket errors
    await client.connect();
    return { type: 'pg', engine: p.engine, client, timeout: queryTimeout, close: () => client.end().catch(() => {}) };
  }
  const client = await mysql.createConnection({
    host, port,
    database: p.database,
    user: p.username,
    password: p.password,
    ssl: p.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
    dateStrings: true,
    supportBigNumbers: true,
  });
  return { type: 'mysql', engine: p.engine, client, timeout: queryTimeout, close: () => client.end().catch(() => {}) };
}

export async function withDb(p, fn, opts) {
  const handle = await openHandle(p, opts);
  try {
    return await fn(handle);
  } finally {
    await handle.close();
  }
}

/** Run a statement and normalise the result for both drivers. */
export async function run(handle, sql, params = []) {
  if (handle.type === 'pg') {
    let res = await handle.client.query(sql, params);
    if (Array.isArray(res)) res = res[res.length - 1]; // multi-statement: keep the last result
    return {
      columns: res.fields ? res.fields.map((f) => f.name) : [],
      rows: res.rows || [],
      rowCount: res.rowCount ?? 0,
      isResultSet: !!res.fields && res.fields.length > 0,
    };
  }
  const [result, fields] = await handle.client.query({ sql, timeout: handle.timeout || undefined }, params);
  if (Array.isArray(result)) {
    const isRowSet = Array.isArray(fields) && fields.length > 0 && !Array.isArray(fields[0]);
    return {
      columns: isRowSet ? fields.map((f) => f.name) : Object.keys(result[0] || {}),
      rows: result,
      rowCount: result.length,
      isResultSet: true,
    };
  }
  return { columns: [], rows: [], rowCount: result.affectedRows || 0, isResultSet: false };
}

export const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

/** JSON-safe cell values (Buffers, BigInt, Dates…). */
export function cell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (Buffer.isBuffer(v)) {
    const hex = v.subarray(0, 32).toString('hex');
    return `0x${hex}${v.length > 32 ? '…' : ''}`;
  }
  if (v instanceof Date) return v.toISOString();
  return v;
}
export const cleanRows = (rows) => rows.map((r) => {
  const o = {};
  for (const k of Object.keys(r)) o[k] = cell(r[k]);
  return o;
});

export const qMy = (id) => '`' + String(id).replace(/`/g, '``') + '`';
export const qPg = (id) => '"' + String(id).replace(/"/g, '""') + '"';
export const quote = (engine) => (isPg(engine) ? qPg : qMy);
export function tableRef(engine, table, schema) {
  if (isPg(engine)) return `${qPg(schema || 'public')}.${qPg(table)}`;
  return qMy(table);
}

/** Wrap an async route so DB failures become clean JSON errors. */
export const route = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(`[${req.method} ${req.path}]`, err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: friendlyError(err, req.connParams) });
  }
};
