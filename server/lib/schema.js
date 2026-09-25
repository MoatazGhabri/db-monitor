import { withDb, run, num, isPg, tableRef, paramsFromRow } from './drivers.js';

// Above this many (estimated) rows we do not run COUNT(*) when paginating table data.
export const EXACT_COUNT_LIMIT = 2_000_000;
// In the table list, tables estimated below this size get an exact COUNT(*) (engine estimates
// are often very stale for small tables); bigger ones keep the cheap estimate.
const LIST_EXACT_COUNT_LIMIT = 50_000;
const LIST_EXACT_COUNT_MAX_TABLES = 300;

/* ---- cache of table names (used by the quick search) ---- */
const tableCache = new Map(); // connectionId -> { at, tables: [{schema,name,type}] }
export function cacheTables(connectionId, list) {
  tableCache.set(connectionId, { at: Date.now(), tables: list.map((t) => ({ schema: t.schema, name: t.name, type: t.type })) });
}
export const cachedTables = (connectionId) => tableCache.get(connectionId);
export const forgetTables = (connectionId) => tableCache.delete(connectionId);

export async function listTables(h, params) {
  if (h.type === 'pg') {
    const r = await run(h, `
      SELECT n.nspname AS schema,
             c.relname AS name,
             CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                            WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'BASE TABLE' END AS type,
             COALESCE(am.amname, '') AS engine,
             (SELECT datcollate FROM pg_database WHERE datname = current_database()) AS collation,
             GREATEST(COALESCE(s.n_live_tup, 0), c.reltuples::bigint, 0)::float8 AS row_count,
             CASE WHEN c.relkind IN ('r','p','m') THEN pg_table_size(c.oid) ELSE 0 END::float8 AS data_bytes,
             CASE WHEN c.relkind IN ('r','p','m') THEN pg_indexes_size(c.oid) ELSE 0 END::float8 AS index_bytes,
             obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_am am ON am.oid = c.relam
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind IN ('r','p','v','m','f')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
      ORDER BY n.nspname, c.relname`);
    return r.rows.map((t) => ({
      schema: t.schema, name: t.name, type: t.type, engine: t.engine || null, collation: t.collation || null,
      rows: num(t.row_count), rows_estimated: true,
      data_bytes: num(t.data_bytes), index_bytes: num(t.index_bytes),
      auto_increment: null, row_format: null, comment: t.comment || null,
      created_at: null, updated_at: null,
    }));
  }
  const r = await run(h, `
    SELECT table_name AS name, table_type AS type, engine AS engine, table_collation AS collation,
           table_rows AS row_count, data_length AS data_bytes, index_length AS index_bytes,
           auto_increment AS auto_inc, row_format AS row_fmt, table_comment AS comment,
           create_time AS created_at, update_time AS updated_at
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
    ORDER BY table_name`);
  return r.rows.map((t) => ({
    schema: params.database, name: t.name,
    type: t.type === 'VIEW' ? 'VIEW' : t.type === 'SYSTEM VIEW' ? 'VIEW' : 'BASE TABLE',
    engine: t.engine || null, collation: t.collation || null,
    rows: num(t.row_count), rows_estimated: t.type !== 'VIEW',
    data_bytes: num(t.data_bytes), index_bytes: num(t.index_bytes),
    auto_increment: t.auto_inc === null || t.auto_inc === undefined ? null : num(t.auto_inc),
    row_format: t.row_fmt || null, comment: t.comment && t.comment !== 'VIEW' ? t.comment : null,
    created_at: t.created_at || null, updated_at: t.updated_at || null,
  }));
}

/** Replace stale engine estimates with exact counts for small tables; views have no row count. */
export async function refineRowCounts(h, engine, list) {
  let done = 0;
  for (const t of list) {
    if (t.type !== 'BASE TABLE') { t.rows = null; t.rows_estimated = false; continue; }
    if (t.rows >= LIST_EXACT_COUNT_LIMIT || done >= LIST_EXACT_COUNT_MAX_TABLES) continue;
    done++;
    try {
      const c = await run(h, `SELECT COUNT(*) AS total FROM ${tableRef(engine, t.name, t.schema)}`);
      t.rows = num(c.rows[0]?.total);
      t.rows_estimated = false;
    } catch {
      // no SELECT privilege etc. — keep the estimate
    }
  }
}

/** Tables + views of a saved connection, with row counts and sizes. */
export async function listTablesFor(connRow, { exact = true } = {}) {
  const p = paramsFromRow(connRow);
  const list = await withDb(p, async (h) => {
    const l = await listTables(h, p);
    if (exact) await refineRowCounts(h, connRow.engine, l);
    else for (const t of l) if (t.type !== 'BASE TABLE') { t.rows = null; t.rows_estimated = false; }
    return l;
  });
  cacheTables(connRow.id, list);
  return list;
}

/** Really connect: version, table count and total size. */
export async function probe(p) {
  const start = Date.now();
  return withDb(p, async (h) => {
    if (h.type === 'pg') {
      const r = await run(h, `
        SELECT version() AS version,
          (SELECT count(*) FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
              AND table_schema NOT IN ('pg_catalog', 'information_schema'))::int AS tables,
          pg_database_size(current_database())::float8 AS size`);
      const row = r.rows[0];
      return { version: row.version, tables: num(row.tables), size: num(row.size), latency_ms: Date.now() - start };
    }
    const r = await run(h, `
      SELECT VERSION() AS version,
        (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE') AS tables,
        (SELECT COALESCE(SUM(data_length + index_length), 0) FROM information_schema.tables
          WHERE table_schema = DATABASE()) AS size`);
    const row = r.rows[0];
    return { version: row.version, tables: num(row.tables), size: num(row.size), latency_ms: Date.now() - start };
  }, { timeoutMs: 15000 });
}
