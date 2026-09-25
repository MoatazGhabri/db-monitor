import { db } from '../lib/context.js';
import { paramsFromRow, withDb, run, num, route } from '../lib/drivers.js';

const ALL_MY = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];
function levelFrom(has) {
  if (has('ALL PRIVILEGES') || ALL_MY.every(has)) return 'Full';
  if (has('SELECT') && (has('INSERT') || has('UPDATE') || has('DELETE'))) return 'Read/Write';
  if (has('SELECT')) return 'Read';
  return 'None';
}
const ORDER = ['None', 'Read', 'Read/Write', 'Full'];
const maxLevel = (a, b) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

const grantee = (u, h) => `'${u}'@'${h}'`;

async function mysqlAccounts(h) {
  const notes = [];
  let accounts = [];
  try {
    const r = await run(h, `SELECT user, host, plugin FROM mysql.user ORDER BY user, host`);
    accounts = r.rows.map((x) => ({ name: x.user, host: x.host, plugin: x.plugin }));
  } catch {
    notes.push('This account cannot read mysql.user, so only the accounts visible through information_schema are listed.');
    const r = await run(h, `SELECT DISTINCT grantee FROM information_schema.user_privileges`);
    accounts = r.rows.map((x) => { const m = /^'(.*)'@'(.*)'$/.exec(x.grantee); return { name: m ? m[1] : x.grantee, host: m ? m[2] : '%', plugin: null }; });
  }
  try { // locked accounts (MySQL 5.7.6+/MariaDB 10.4+)
    const l = await run(h, `SELECT user, host, account_locked FROM mysql.user`);
    const locked = new Set(l.rows.filter((x) => x.account_locked === 'Y').map((x) => grantee(x.user, x.host)));
    accounts.forEach((a) => { a.locked = locked.has(grantee(a.name, a.host)); });
  } catch { /* column not available */ }

  const glob = new Map();
  const schema = new Map();
  const tbl = new Map(); // grantee -> table -> privs
  const add = (m, k, p) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(p); };
  for (const r of (await run(h, `SELECT grantee, privilege_type AS p FROM information_schema.user_privileges`)).rows) add(glob, r.grantee, r.p);
  for (const r of (await run(h, `SELECT grantee, privilege_type AS p FROM information_schema.schema_privileges WHERE table_schema = DATABASE()`)).rows) add(schema, r.grantee, r.p);
  for (const r of (await run(h, `SELECT grantee, table_name AS t, privilege_type AS p FROM information_schema.table_privileges WHERE table_schema = DATABASE()`)).rows) {
    if (!tbl.has(r.grantee)) tbl.set(r.grantee, new Map());
    add(tbl.get(r.grantee), r.t, r.p);
  }
  const tables = (await run(h, `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name`)).rows.map((x) => x.t);

  const users = accounts.map((a) => {
    const g = grantee(a.name, a.host);
    const base = new Set([...(glob.get(g) || []), ...(schema.get(g) || [])]);
    const superuser = base.has('SUPER') || (glob.get(g)?.has('GRANT OPTION') && ALL_MY.every((p) => base.has(p)));
    const perTable = {};
    let overall = levelFrom((p) => base.has(p));
    for (const t of tables) {
      const own = tbl.get(g)?.get(t) || new Set();
      const l = levelFrom((p) => base.has(p) || own.has(p));
      perTable[t] = l;
      overall = maxLevel(overall, l);
    }
    return { name: a.name, host: a.host, superuser: !!superuser, canLogin: !a.locked, locked: !!a.locked, detail: a.plugin || '', level: superuser ? 'Full' : overall, perTable, privileges: [...base].sort() };
  });
  return { users, tables, notes };
}

async function pgAccounts(h) {
  const roles = (await run(h, `
    SELECT r.rolname AS name, r.rolsuper, r.rolcanlogin, r.rolcreatedb, r.rolcreaterole, r.rolconnlimit,
           r.rolvaliduntil::text AS valid_until, has_database_privilege(r.oid, current_database(), 'CONNECT') AS can_connect
    FROM pg_roles r WHERE r.rolname NOT LIKE 'pg\\_%' ORDER BY r.rolcanlogin DESC, r.rolname`)).rows;
  const tables = (await run(h, `
    SELECT n.nspname AS s, c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1, 2 LIMIT 200`)).rows;
  const grants = (await run(h, `
    SELECT r.rolname AS role, c.relname AS t,
      has_table_privilege(r.oid, c.oid, 'SELECT') AS s, has_table_privilege(r.oid, c.oid, 'INSERT') AS i,
      has_table_privilege(r.oid, c.oid, 'UPDATE') AS u, has_table_privilege(r.oid, c.oid, 'DELETE') AS d,
      (has_table_privilege(r.oid, c.oid, 'TRUNCATE') AND has_table_privilege(r.oid, c.oid, 'REFERENCES') AND has_table_privilege(r.oid, c.oid, 'TRIGGER')) AS f
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE r.rolcanlogin AND r.rolname NOT LIKE 'pg\\_%' AND c.relkind IN ('r','p')
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'`)).rows;
  const byRole = new Map();
  for (const g of grants) {
    const l = g.s && g.i && g.u && g.d && g.f ? 'Full' : g.s && (g.i || g.u || g.d) ? 'Read/Write' : g.s ? 'Read' : 'None';
    if (!byRole.has(g.role)) byRole.set(g.role, {});
    byRole.get(g.role)[g.t] = l;
  }
  const users = roles.map((r) => {
    const perTable = byRole.get(r.name) || {};
    let overall = 'None';
    for (const l of Object.values(perTable)) overall = maxLevel(overall, l);
    const flags = [r.rolsuper && 'superuser', r.rolcreatedb && 'createdb', r.rolcreaterole && 'createrole'].filter(Boolean);
    return {
      name: r.name, host: null, superuser: r.rolsuper, canLogin: r.rolcanlogin && r.can_connect,
      locked: false, detail: flags.join(', '), level: r.rolsuper ? 'Full' : overall, perTable,
      privileges: [], validUntil: r.valid_until, connLimit: r.rolconnlimit,
    };
  });
  return { users, tables: [...new Set(tables.map((t) => t.t))], notes: [] };
}

export function registerUserRoutes(app) {
  app.post('/api/db-users', route(async (req, res) => {
    const conn = req.body?.connectionId ? db.prepare('SELECT * FROM db_connections WHERE id = ?').get(req.body.connectionId) : null;
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    const p = paramsFromRow(conn);
    req.connParams = p;
    const data = await withDb(p, (h) => (h.type === 'pg' ? pgAccounts(h) : mysqlAccounts(h)));
    res.json({ engine: conn.engine, database: conn.database_name, ...data, tables: data.tables.slice(0, 200), users: data.users.slice(0, 200), total: num(data.users.length) });
  }));
}
