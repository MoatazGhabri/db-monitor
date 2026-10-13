import { run, num, isPg, quote, tableRef } from './drivers.js';

const PAGE = 2000;      // rows fetched per round trip while exporting
const INSERT_BATCH = 200; // rows per generated INSERT statement

/* =====================================================================
 * Helpers
 * ===================================================================== */
async function primaryKey(h, table, schema) {
  if (h.type === 'pg') {
    const r = await run(h, `
      SELECT a.attname AS col
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE i.indisprimary AND n.nspname = $1 AND t.relname = $2
      ORDER BY k.ord`, [schema || 'public', table]);
    return r.rows.map((x) => x.col);
  }
  const r = await run(h, `
    SELECT column_name AS col FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = 'PRIMARY'
    ORDER BY ordinal_position`, [table]);
  return r.rows.map((x) => x.col);
}

async function columnNames(h, table, schema) {
  if (h.type === 'pg') {
    const r = await run(h, `
      SELECT a.attname AS name FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      ORDER BY a.attnum`, [schema || 'public', table]);
    return r.rows.map((x) => x.name);
  }
  const r = await run(h, `
    SELECT column_name AS name FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ? AND extra NOT LIKE '%GENERATED%'
    ORDER BY ordinal_position`, [table]);
  return r.rows.map((x) => x.name);
}

/**
 * Iterate over every row of a table, PAGE rows at a time.
 * PostgreSQL values are fetched as text (`col::text`) so any type round-trips through an INSERT literal.
 */
export async function* iterateRows(h, engine, table, schema) {
  const q = quote(engine);
  const cols = await columnNames(h, table, schema);
  const list = h.type === 'pg' ? cols.map((c) => `${q(c)}::text AS ${q(c)}`).join(', ') : cols.map(q).join(', ');
  const pk = await primaryKey(h, table, schema);
  const order = pk.length ? ` ORDER BY ${pk.map(q).join(', ')}` : '';
  const ref = tableRef(engine, table, schema);
  for (let offset = 0; ; offset += PAGE) {
    const r = await run(h, `SELECT ${list} FROM ${ref}${order} LIMIT ${PAGE} OFFSET ${offset}`);
    if (r.rows.length === 0) return;
    yield { columns: cols, rows: r.rows };
    if (r.rows.length < PAGE) return;
  }
}

/* ---- SQL literals ---- */
export function sqlLiteral(v, type) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return type === 'pg' ? (v ? 'TRUE' : 'FALSE') : (v ? '1' : '0');
  if (Buffer.isBuffer(v)) return type === 'pg' ? `'\\x${v.toString('hex')}'` : `X'${v.toString('hex')}'`;
  if (v instanceof Date) return `'${v.toISOString().replace('T', ' ').replace('Z', '')}'`;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (type === 'pg') return `'${s.replace(/'/g, "''")}'`;
  return `'${s
    .replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\x1a/g, '\\Z')}'`;
}

/* ---- DDL ---- */
async function createStatementMy(h, t) {
  const r = await run(h, `SHOW CREATE ${t.type === 'VIEW' ? 'VIEW' : 'TABLE'} ${quote('mysql')(t.name)}`);
  const row = r.rows[0] || {};
  const ddl = row['Create Table'] || row['Create View'];
  if (!ddl) throw new Error(`Cannot read the definition of ${t.name}`);
  // mysqldump-style: drop the DEFINER so a restore works with another user
  return ddl.replace(/\bDEFINER=`[^`]*`@`[^`]*`\s*/i, '');
}

async function createStatementPg(h, t) {
  const q = quote('postgresql');
  const ref = tableRef('postgresql', t.name, t.schema);
  if (t.type === 'VIEW' || t.type === 'MATERIALIZED VIEW') {
    const r = await run(h, `SELECT pg_get_viewdef($1::regclass, true) AS def`, [ref]);
    const kw = t.type === 'VIEW' ? 'CREATE OR REPLACE VIEW' : 'CREATE MATERIALIZED VIEW';
    return `${kw} ${ref} AS\n${String(r.rows[0].def).replace(/;\s*$/, '')};`;
  }
  const cols = await run(h, `
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
           pg_get_expr(d.adbin, d.adrelid) AS def, a.attidentity AS identity, a.attgenerated AS generated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum`, [t.schema || 'public', t.name]);
  const defs = cols.rows.map((c) => {
    let type = c.type;
    let def = c.def;
    if (def && /^nextval\(/i.test(def)) { // serial column: use the SERIAL pseudo types so no sequence is needed
      type = { integer: 'SERIAL', bigint: 'BIGSERIAL', smallint: 'SMALLSERIAL' }[type] || type;
      def = null;
    }
    let line = `  ${q(c.name)} ${type}`;
    if (c.identity === 'a') line += ' GENERATED ALWAYS AS IDENTITY';
    else if (c.identity === 'd') line += ' GENERATED BY DEFAULT AS IDENTITY';
    else if (c.generated === 's') line += ` GENERATED ALWAYS AS (${def}) STORED`;
    else if (def) line += ` DEFAULT ${def}`;
    if (c.notnull && !/SERIAL/.test(type)) line += ' NOT NULL';
    return line;
  });
  const pk = await primaryKey(h, t.name, t.schema);
  if (pk.length) defs.push(`  PRIMARY KEY (${pk.map(q).join(', ')})`);
  return `CREATE TABLE ${ref} (\n${defs.join(',\n')}\n);`;
}

async function extraStatementsPg(h, t) {
  const out = [];
  const idx = await run(h, `
    SELECT pg_get_indexdef(i.indexrelid) AS def
    FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relname = $2 AND NOT i.indisprimary ORDER BY 1`, [t.schema || 'public', t.name]);
  for (const r of idx.rows) out.push(`${r.def};`);
  return out;
}

async function foreignKeysPg(h, t) {
  const ref = tableRef('postgresql', t.name, t.schema);
  const r = await run(h, `
    SELECT con.conname AS name, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f' AND n.nspname = $1 AND c.relname = $2`, [t.schema || 'public', t.name]);
  return r.rows.map((x) => `ALTER TABLE ${ref} ADD CONSTRAINT ${quote('postgresql')(x.name)} ${x.def};`);
}

/* =====================================================================
 * SQL dump
 * ===================================================================== */
/**
 * Write a SQL dump of `tables` through `write(chunk)`.
 * Returns { tables, rows }.  Views are emitted after the tables, foreign keys last.
 */
export async function dumpSql(h, engine, tables, { includeSchema = true, includeData = true, dropExisting = false, dbName = '', write }) {
  const pg = isPg(engine);
  const q = quote(engine);
  const base = tables.filter((t) => t.type !== 'VIEW' && t.type !== 'MATERIALIZED VIEW');
  const views = tables.filter((t) => t.type === 'VIEW' || t.type === 'MATERIALIZED VIEW');
  let rows = 0;

  await write(`-- DBHub SQL dump\n-- Engine: ${engine}${dbName ? `\n-- Database: ${dbName}` : ''}\n-- Generated: ${new Date().toISOString()}\n\n`);
  if (!pg) await write('SET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\nSET SQL_MODE=\'NO_AUTO_VALUE_ON_ZERO\';\n\n');
  else await write('SET client_encoding = \'UTF8\';\n\n');

  const fks = [];
  for (const t of base) {
    const ref = tableRef(engine, t.name, t.schema);
    await write(`-- ----------------------------\n-- Table: ${t.name}\n-- ----------------------------\n`);
    if (includeSchema) {
      if (dropExisting) await write(`DROP TABLE IF EXISTS ${ref}${pg ? ' CASCADE' : ''};\n`);
      const ddl = pg ? await createStatementPg(h, t) : await createStatementMy(h, t);
      await write(`${ddl.replace(/;?\s*$/, '')};\n`);
    }
    if (includeData) {
      for await (const page of iterateRows(h, engine, t.name, t.schema)) {
        const cols = page.columns.map(q).join(', ');
        for (let i = 0; i < page.rows.length; i += INSERT_BATCH) {
          const chunk = page.rows.slice(i, i + INSERT_BATCH);
          const values = chunk.map((r) => `(${page.columns.map((c) => sqlLiteral(r[c], pg ? 'pg' : 'my')).join(', ')})`);
          await write(`INSERT INTO ${ref} (${cols}) VALUES\n${values.join(',\n')};\n`);
        }
        rows += page.rows.length;
      }
      if (pg && includeSchema) {
        // keep serial sequences in step with the restored ids
        const ser = await run(h, `SELECT a.attname AS col, pg_get_serial_sequence($1, a.attname) AS seq
          FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`, [ref]);
        for (const s of ser.rows) if (s.seq) await write(`SELECT setval('${s.seq}', COALESCE((SELECT MAX(${q(s.col)}) FROM ${ref}), 0) + 1, false);\n`);
      }
    }
    if (includeSchema && pg) {
      for (const stmt of await extraStatementsPg(h, t)) await write(`${stmt}\n`);
      fks.push(...await foreignKeysPg(h, t));
    }
    await write('\n');
  }

  if (includeSchema) {
    for (const t of views) {
      const ref = tableRef(engine, t.name, t.schema);
      await write(`-- View: ${t.name}\n`);
      if (dropExisting) await write(`DROP ${t.type === 'MATERIALIZED VIEW' ? 'MATERIALIZED VIEW' : 'VIEW'} IF EXISTS ${ref};\n`);
      const ddl = pg ? await createStatementPg(h, t) : await createStatementMy(h, t);
      await write(`${ddl.replace(/;?\s*$/, '')};\n\n`);
    }
    for (const f of fks) await write(`${f}\n`);
  }
  if (!pg) await write('\nSET FOREIGN_KEY_CHECKS=1;\n');
  return { tables: tables.length, rows };
}

/* =====================================================================
 * CSV / JSON export
 * ===================================================================== */
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) ? JSON.stringify(v)
    : Buffer.isBuffer(v) ? `0x${v.toString('hex')}` : v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function dumpCsv(h, engine, table, { write }) {
  let rows = 0;
  let headerDone = false;
  for await (const page of iterateRows(h, engine, table.name, table.schema)) {
    if (!headerDone) { await write('\ufeff' + page.columns.map(csvCell).join(',') + '\r\n'); headerDone = true; }
    await write(page.rows.map((r) => page.columns.map((c) => csvCell(r[c])).join(',')).join('\r\n') + '\r\n');
    rows += page.rows.length;
  }
  if (!headerDone) {
    const cols = await columnNames(h, table.name, table.schema);
    await write('\ufeff' + cols.map(csvCell).join(',') + '\r\n');
  }
  return { tables: 1, rows };
}

export async function dumpJson(h, engine, tables, { write }) {
  let rows = 0;
  await write('{\n');
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    await write(`${i ? ',\n' : ''}  ${JSON.stringify(t.name)}: [`);
    let first = true;
    for await (const page of iterateRows(h, engine, t.name, t.schema)) {
      for (const r of page.rows) {
        const o = {};
        for (const c of page.columns) o[c] = r[c] instanceof Date ? r[c].toISOString() : Buffer.isBuffer(r[c]) ? `0x${r[c].toString('hex')}` : r[c];
        await write(`${first ? '\n' : ',\n'}    ${JSON.stringify(o)}`);
        first = false;
        rows++;
      }
    }
    await write(first ? ']' : '\n  ]');
  }
  await write('\n}\n');
  return { tables: tables.length, rows };
}

/* =====================================================================
 * Import helpers
 * ===================================================================== */
/** Split an SQL script into statements (aware of quotes, comments and $$ blocks). */
export function splitSql(text, engine) {
  const pg = isPg(engine);
  const out = [];
  let cur = '';
  let i = 0;
  const n = text.length;
  const push = () => { const s = cur.trim(); if (s) out.push(s); cur = ''; };
  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '-' && next === '-') { const e = text.indexOf('\n', i); i = e === -1 ? n : e + 1; cur += '\n'; continue; }
    if (!pg && ch === '#') { const e = text.indexOf('\n', i); i = e === -1 ? n : e + 1; cur += '\n'; continue; }
    if (ch === '/' && next === '*') {
      const e = text.indexOf('*/', i + 2);
      const body = text.slice(i, e === -1 ? n : e + 2);
      // keep MySQL executable comments (/*!40101 ... */), drop ordinary comments
      if (!pg && body.startsWith('/*!')) cur += body.replace(/^\/\*!\d*\s?/, '').replace(/\*\/$/, '');
      i = e === -1 ? n : e + 2; continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quoteCh = ch;
      let j = i + 1;
      while (j < n) {
        if (!pg && quoteCh !== '`' && text[j] === '\\') { j += 2; continue; }
        if (text[j] === quoteCh) { if (text[j + 1] === quoteCh) { j += 2; continue; } break; }
        j++;
      }
      cur += text.slice(i, j + 1); i = j + 1; continue;
    }
    if (pg && ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i, i + 40));
      if (m) {
        const e = text.indexOf(m[0], i + m[0].length);
        const stop = e === -1 ? n : e + m[0].length;
        cur += text.slice(i, stop); i = stop; continue;
      }
    }
    if (ch === ';') { push(); i++; continue; }
    cur += ch; i++;
  }
  push();
  return out;
}

/** RFC-4180 CSV parser (BOM, CRLF, quoted fields, auto-detected delimiter). */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t', '|'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"' && field === '') inQ = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  const headers = (rows.shift() || []).map((h) => h.trim());
  return { headers, rows, delimiter: delim };
}

/** Insert rows (arrays aligned with `columns`) in batches. */
export async function insertRows(h, engine, table, schema, columns, rows, onBatch) {
  const q = quote(engine);
  const ref = tableRef(engine, table, schema);
  const colList = columns.map(q).join(', ');
  if (h.type === 'pg') {
    const per = Math.max(1, Math.floor(60000 / columns.length));
    const size = Math.min(500, per);
    for (let i = 0; i < rows.length; i += size) {
      const chunk = rows.slice(i, i + size);
      const params = [];
      const tuples = chunk.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`);
      await h.client.query(`INSERT INTO ${ref} (${colList}) VALUES ${tuples.join(', ')}`, params);
      onBatch?.(chunk.length);
    }
  } else {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await h.client.query(`INSERT INTO ${ref} (${colList}) VALUES ?`, [chunk]);
      onBatch?.(chunk.length);
    }
  }
  return rows.length;
}

export { num };

/** Execute an SQL script statement by statement. PostgreSQL runs it in one transaction when stopOnError is set. */
export async function executeScript(h, engine, text, { stopOnError = true } = {}) {
  const statements = splitSql(text, engine);
  const pg = h.type === 'pg';
  const errors = [];
  let executed = 0;
  let rolledBack = false;
  if (pg && stopOnError) await h.client.query('BEGIN');
  for (const stmt of statements) {
    try {
      await run(h, stmt);
      executed++;
    } catch (err) {
      errors.push({ statement: stmt.slice(0, 200), error: err.message });
      if (stopOnError) {
        if (pg) { await h.client.query('ROLLBACK').catch(() => {}); rolledBack = true; }
        break;
      }
    }
  }
  if (pg && stopOnError && !rolledBack) await h.client.query('COMMIT');
  return { total: statements.length, executed, failed: errors.length, errors: errors.slice(0, 20), rolledBack };
}
