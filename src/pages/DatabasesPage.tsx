import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database, Plus, ChevronDown, Trash2, Table2, Pencil, Plug,
  Server, Lock, Wifi, X, CheckCircle2, AlertCircle, Loader2, RefreshCw,
} from 'lucide-react';
import { Card, Badge, Button, PageHeader, SearchInput } from '@/components/ui';
import {
  fetchConnections, createConnection, updateConnection, deleteConnection, testConnection, checkConnection,
  type DbConnection, type SavedConnection,
} from '@/lib/api';
import { formatBytes, timeAgo } from '@/lib/format';

interface Props {
  /** Open the Tables page on a given connection. */
  onBrowseTables?: (connectionId: string) => void;
}

export function DatabasesPage({ onBrowseTables }: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'tables' | 'size'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ existing?: DbConnection } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** connection id -> true while a real connection attempt is running */
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  /** connection id -> why the last attempt failed */
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({});
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  /** Actually connect to one database and merge the fresh status into the list. */
  const runCheck = useCallback(async (id: string) => {
    setChecking((c) => ({ ...c, [id]: true }));
    try {
      const res = await checkConnection(id);
      if (!mounted.current) return;
      setConnections((prev) => prev.map((c) => (c.id === id ? res.connection : c)));
      setCheckErrors((e) => {
        const next = { ...e };
        if (res.ok) delete next[id]; else next[id] = res.error || 'Connection failed';
        return next;
      });
    } catch (err) {
      if (!mounted.current) return;
      setCheckErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : 'Connection failed' }));
    } finally {
      if (mounted.current) setChecking((c) => ({ ...c, [id]: false }));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConnections();
      setConnections(data);
      setLoading(false);
      // Statuses stored in the platform DB can be stale: verify each one for real.
      await Promise.allSettled(data.map((c) => runCheck(c.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
      setLoading(false);
    }
  }, [runCheck]);

  useEffect(() => { load(); }, [load]);

  let dbs = connections.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) &&
    (filter === 'all' || d.status === filter)
  );

  dbs = [...dbs].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'tables') cmp = a.tables_count - b.tables_count;
    else cmp = a.size_bytes - b.size_bytes;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleDelete = async (db: DbConnection) => {
    if (!window.confirm(`Remove the connection "${db.name}"?\n\nThe database itself is not touched, but its query history and backup schedules in DBHub will be deleted.`)) return;
    try {
      await deleteConnection(db.id);
      setConnections((prev) => prev.filter((c) => c.id !== db.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleSaved = (saved: SavedConnection) => {
    setModal(null);
    setConnections((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
    });
    if (saved.connection_error) {
      setNotice(null);
      setCheckErrors((e) => ({ ...e, [saved.id]: saved.connection_error! }));
      setError(`"${saved.name}" was saved but could not connect: ${saved.connection_error}`);
    } else {
      setError(null);
      setCheckErrors((e) => { const n = { ...e }; delete n[saved.id]; return n; });
      setNotice(`Connected to "${saved.name}" — ${saved.tables_count} table${saved.tables_count === 1 ? '' : 's'}, ${formatBytes(saved.size_bytes)}.`);
    }
  };

  const summary = [
    { label: 'Total Databases', value: connections.length },
    { label: 'Online', value: connections.filter(d => d.status === 'online').length },
    { label: 'Offline', value: connections.filter(d => d.status === 'offline').length },
    { label: 'Total Size', value: formatBytes(connections.reduce((s, d) => s + d.size_bytes, 0)) },
  ];

  const anyChecking = Object.values(checking).some(Boolean);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Databases"
        subtitle="Manage connections to your real database servers"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${anyChecking ? 'animate-spin' : ''}`} />}
              onClick={load}
              disabled={loading || anyChecking}
            >
              Refresh
            </Button>
            <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModal({})}>Connect Database</Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {summary.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-ink-400 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-ink-900 tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-5 py-3 border-b border-ink-100">
          <SearchInput placeholder="Search databases…" value={search} onChange={setSearch} />
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'online', 'offline'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                  filter === f ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-ink-500 hover:bg-ink-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-xs text-ink-400">{dbs.length} of {connections.length}</span>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-ink-400">Loading connections…</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                  <th className="text-left font-medium px-5 py-2.5 cursor-pointer hover:text-ink-700" onClick={() => toggleSort('name')}>
                    <span className="inline-flex items-center gap-1">Name <ChevronDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Engine</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Host</th>
                  <th className="text-right font-medium px-3 py-2.5 cursor-pointer hover:text-ink-700" onClick={() => toggleSort('tables')}>
                    <span className="inline-flex items-center gap-1">Tables <ChevronDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-right font-medium px-3 py-2.5 cursor-pointer hover:text-ink-700" onClick={() => toggleSort('size')}>
                    <span className="inline-flex items-center gap-1">Size <ChevronDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-right font-medium px-5 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dbs.map((db) => {
                  const busy = !!checking[db.id];
                  const online = db.status === 'online';
                  const reason = checkErrors[db.id];
                  return (
                    <tr key={db.id} className="border-b border-ink-50 last:border-0 hover:bg-blue-50/30 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center shrink-0">
                            <Database className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div>
                              <span className="font-mono text-xs font-medium text-ink-800">{db.name}</span>
                              <span className="text-[10px] text-ink-400 ml-1.5">{db.database_name}</span>
                            </div>
                            {!busy && !online && reason && (
                              <p className="text-[11px] text-rose-600 mt-0.5 max-w-md truncate" title={reason}>{reason}</p>
                            )}
                            {online && db.last_connected_at && (
                              <p className="text-[11px] text-ink-400 mt-0.5">Connected {timeAgo(db.last_connected_at)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-500 text-xs capitalize">{db.engine}</td>
                      <td className="px-3 py-3 text-ink-500 text-xs hidden md:table-cell font-mono">{db.host}:{db.port}</td>
                      <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{online ? db.tables_count : '—'}</td>
                      <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{online ? formatBytes(db.size_bytes) : '—'}</td>
                      <td className="px-3 py-3">
                        {busy ? (
                          <Badge tone="amber"><Loader2 className="w-3 h-3 animate-spin" />connecting</Badge>
                        ) : (
                          <Badge tone={online ? 'green' : 'red'} dot={online}>{db.status}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40 disabled:pointer-events-none"
                            title={online ? 'Browse tables' : 'Connect first to browse tables'}
                            disabled={!online}
                            onClick={() => onBrowseTables?.(db.id)}
                          >
                            <Table2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 text-ink-400 hover:text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-40 disabled:pointer-events-none"
                            title={online ? 'Re-check connection' : 'Connect'}
                            disabled={busy}
                            onClick={() => runCheck(db.id)}
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                          </button>
                          <button className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded" title="Edit connection" onClick={() => setModal({ existing: db })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Remove" onClick={() => handleDelete(db)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {dbs.length === 0 && (
              <div className="py-16 text-center">
                <Database className="w-8 h-8 text-ink-300 mx-auto mb-2" />
                <p className="text-sm text-ink-500 mb-3">
                  {connections.length === 0 ? 'No databases connected yet' : 'No database matches your filters'}
                </p>
                {connections.length === 0 && (
                  <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setModal({})}>Connect your first database</Button>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {modal && (
        <ConnectDatabaseModal
          existing={modal.existing}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

/* ---------- Connect / Edit Database Modal ---------- */
function ConnectDatabaseModal({ existing, onClose, onSaved }: {
  existing?: DbConnection;
  onClose: () => void;
  onSaved: (saved: SavedConnection) => void;
}) {
  const editing = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [engine, setEngine] = useState(existing?.engine ?? 'mysql');
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(existing?.port ?? 3306);
  const [databaseName, setDatabaseName] = useState(existing?.database_name ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [password, setPassword] = useState('');
  const [ssl, setSsl] = useState(!!existing?.ssl_enabled);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string; latency?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await testConnection({ host, port, database: databaseName, username, password, engine, ssl, connectionId: existing?.id });
      setTestResult({ success: result.success, message: result.message, version: result.version, latency: result.latency_ms });
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name || databaseName,
        engine,
        host: host.trim(),
        port,
        database_name: databaseName.trim(),
        username: username.trim(),
        password_encrypted: password,
        ssl_enabled: ssl,
      };
      // The server saves the connection and immediately connects to it.
      const saved = existing ? await updateConnection(existing.id, payload) : await createConnection(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save connection');
      setSaving(false);
    }
  };

  const canSave = !!host.trim() && !!databaseName.trim() && !!username.trim();
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(host.trim().toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-ink-900">{editing ? 'Edit Connection' : 'Connect Database'}</h3>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Display Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ecommerce_prod"
              className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Engine</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'mysql', label: 'MySQL' },
                { key: 'postgresql', label: 'PostgreSQL' },
                { key: 'mariadb', label: 'MariaDB' },
              ].map((e) => (
                <button key={e.key} onClick={() => {
                  // only swap the default port if the user did not customise it
                  if (port === 3306 || port === 5432) setPort(e.key === 'postgresql' ? 5432 : 3306);
                  setEngine(e.key);
                }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    engine === e.key ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
                  }`}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Host</label>
              <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.100 or db.example.com"
                className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Port</label>
              <input type="number" value={port} onChange={(e) => setPort(parseInt(e.target.value) || (engine === 'postgresql' ? 5432 : 3306))}
                className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>
          {isLoopback && (
            <p className="text-[11px] text-ink-400 -mt-2">
              DBHub runs on the server, so <span className="font-mono">{host.trim()}</span> means the machine running DBHub
              (inside Docker it is redirected to the Docker host).
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Database Name</label>
            <input type="text" value={databaseName} onChange={(e) => setDatabaseName(e.target.value)} placeholder="my_database"
              className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root"
                className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? 'Leave blank to keep current' : '••••••••'}
                className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)}
              className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" />
            <span className="text-sm text-ink-600 flex items-center gap-1"><Lock className="w-3.5 h-3.5" />Use SSL/TLS encryption</span>
          </label>

          {testResult && (
            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${
              testResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{testResult.message}</span>
              {testResult.version && <span className="text-xs opacity-70">· {testResult.version.split(' ').slice(0, 2).join(' ')} · {testResult.latency}ms</span>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-ink-100 sticky bottom-0 bg-white">
          <Button variant="secondary" disabled={!canSave || testing} icon={testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />} onClick={handleTest}>
            {testing ? 'Testing…' : 'Test Connection'}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canSave || saving} icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} onClick={handleSave}>
              {saving ? 'Connecting…' : editing ? 'Save & Connect' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
