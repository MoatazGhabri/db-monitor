import { quoteIdent, tableRef } from '@/lib/format';
import type { ColumnInfo, DbConnection, IndexInfo, TableSummary } from '@/lib/api';

/** A statement handed to the SQL editor (pre-filled, never executed automatically). */
export interface SqlDraft {
  connectionId: string;
  sql: string;
  /** changes on every hand-off so the editor re-applies an identical draft */
  nonce: number;
}

type Conn = Pick<DbConnection, 'id' | 'engine'>;
type Tbl = Pick<TableSummary, 'name' | 'schema' | 'type'>;

const isPg = (c: Conn) => c.engine === 'postgresql';
const ref = (c: Conn, t: Tbl) => tableRef(c.engine, t.name, t.schema);

export const selectAll = (c: Conn, t: Tbl) => `SELECT *\nFROM ${ref(c, t)}\nLIMIT 100;`;

export function newTable(c: Conn, schema?: string): string {
  if (isPg(c)) {
    return `CREATE TABLE ${quoteIdent(c.engine, schema || 'public')}.new_table (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;
  }
  return `CREATE TABLE new_table (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
}

export const addColumn = (c: Conn, t: Tbl) =>
  `ALTER TABLE ${ref(c, t)}\n  ADD COLUMN new_column VARCHAR(255) NULL;`;

export function editColumn(c: Conn, t: Tbl, col: ColumnInfo): string {
  const q = quoteIdent(c.engine, col.name);
  if (isPg(c)) {
    return `ALTER TABLE ${ref(c, t)}\n  ALTER COLUMN ${q} TYPE ${col.type},\n  ALTER COLUMN ${q} ${col.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`;
  }
  return `ALTER TABLE ${ref(c, t)}\n  MODIFY COLUMN ${q} ${col.type} ${col.nullable ? 'NULL' : 'NOT NULL'};`;
}

export const dropColumn = (c: Conn, t: Tbl, col: ColumnInfo) =>
  `-- ⚠ This permanently deletes the column and its data.\nALTER TABLE ${ref(c, t)}\n  DROP COLUMN ${quoteIdent(c.engine, col.name)};`;

export function addIndex(c: Conn, t: Tbl, columns: ColumnInfo[]): string {
  const target = columns.find((x) => x.key !== 'PRI')?.name ?? 'column_name';
  const name = quoteIdent(c.engine, `idx_${t.name}_${target}`);
  return `CREATE INDEX ${name}\n  ON ${ref(c, t)} (${quoteIdent(c.engine, target)});`;
}

export function dropIndex(c: Conn, t: Tbl, idx: IndexInfo): string {
  const warn = '-- ⚠ Dropping an index can slow down queries that rely on it.\n';
  if (isPg(c)) {
    if (idx.primary || idx.unique) {
      // unique/primary indexes usually back a constraint of the same name
      return `${warn}ALTER TABLE ${ref(c, t)}\n  DROP CONSTRAINT ${quoteIdent(c.engine, idx.name)};`;
    }
    return `${warn}DROP INDEX ${quoteIdent(c.engine, t.schema || 'public')}.${quoteIdent(c.engine, idx.name)};`;
  }
  if (idx.primary) return `${warn}ALTER TABLE ${ref(c, t)}\n  DROP PRIMARY KEY;`;
  return `${warn}DROP INDEX ${quoteIdent(c.engine, idx.name)} ON ${ref(c, t)};`;
}

export function dropTables(c: Conn, tables: Tbl[]): string {
  const stmts = tables.map((t) => `DROP ${t.type === 'VIEW' ? 'VIEW' : 'TABLE'} ${ref(c, t)};`);
  return `-- ⚠ This permanently deletes ${tables.length === 1 ? 'this object' : 'these objects'} and all of the data.\n-- Review carefully, then press Run.\n${stmts.join('\n')}`;
}

export const optimizeTable = (c: Conn, t: Tbl) =>
  isPg(c) ? `VACUUM (ANALYZE) ${ref(c, t)};` : `OPTIMIZE TABLE ${ref(c, t)};`;
