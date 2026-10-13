import { useState, useEffect, useCallback } from 'react';
import { Shield, Lock, Unlock, Crown, Loader2, AlertCircle, Database } from 'lucide-react';
import { Card, Badge, PageHeader, SearchInput, EmptyState } from '@/components/ui';
import { fetchConnections, fetchDbUsers, type DbConnection, type DbUser } from '@/lib/api';

const levelTone: Record<string, 'blue' | 'green' | 'slate' | 'red'> = {
  Full: 'blue', 'Read/Write': 'green', Read: 'slate', None: 'red',
};
const roleIconClass: Record<string, string> = {
  Full: 'bg-blue-50 text-blue-600 ring-blue-100', 'Read/Write': 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  Read: 'bg-ink-100 text-ink-600 ring-ink-200', None: 'bg-rose-50 text-rose-600 ring-rose-100',
};

export function UsersPage() {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'users' | 'permissions'>('users');
  const [data, setData] = useState<{ engine: string; database: string; users: DbUser[]; tables: string[]; notes: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnections().then((c) => {
      setConnections(c);
      setCurrentId((cur) => cur ?? (c.find((x) => x.status === 'online') ?? c[0])?.id);
      if (c.length === 0) setLoading(false);
    }).catch((err) => { setError(err instanceof Error ? err.message : 'Failed to load connections'); setLoading(false); });
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchDbUsers(id);
      setData(r);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (currentId) load(currentId); }, [currentId, load]);

  const filtered = (data?.users ?? []).filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));

  const roleSummary = ['Full', 'Read/Write', 'Read', 'None'].map((level) => ({
    level, count: (data?.users ?? []).filter((u) => u.level === level).length,
  }));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Users & Permissions" subtitle="Real accounts and privileges on each connected database" />

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <span className="text-xs text-ink-400 shrink-0">Database:</span>
        {connections.map((c) => (
          <button key={c.id} onClick={() => setCurrentId(c.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${c.id === currentId ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {c.name}
          </button>
        ))}
      </div>

      {connections.length === 0 && !loading ? (
        <Card><EmptyState icon={<Database className="w-5 h-5" />} title="No database connected yet" subtitle="Connect a database to see its users and permissions." /></Card>
      ) : error ? (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>
      ) : loading ? (
        <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" /><p className="text-sm text-ink-400">Reading accounts…</p></div>
      ) : (
        <>
          {data?.notes.map((n, i) => <p key={i} className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{n}</p>)}

          <div className="flex items-center gap-1 mb-4 border-b border-ink-100">
            {(['users', 'permissions'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
                {t === 'users' ? 'Accounts' : 'Permissions Matrix'}
              </button>
            ))}
          </div>

          {tab === 'users' && (
            <Card>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-ink-100">
                <SearchInput placeholder="Search accounts…" value={search} onChange={setSearch} />
                <div className="flex-1" />
                <span className="text-xs text-ink-400">{filtered.length} accounts</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                      <th className="text-left font-medium px-5 py-2.5">Account</th>
                      <th className="text-left font-medium px-3 py-2.5">Access Level</th>
                      <th className="text-left font-medium px-3 py-2.5">Login</th>
                      <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={`${u.name}@${u.host}`} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${u.superuser ? 'bg-gradient-to-br from-amber-500 to-rose-600' : 'bg-gradient-to-br from-blue-500 to-violet-600'}`}>
                              {u.superuser ? <Crown className="w-3.5 h-3.5" /> : u.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-ink-800 text-xs font-mono">{u.name}</div>
                              {u.host && <div className="text-ink-400 text-xs font-mono">@{u.host}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><Badge tone={levelTone[u.level]}>{u.superuser ? 'Superuser' : u.level}</Badge></td>
                        <td className="px-3 py-3">
                          {u.locked ? (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-600"><Lock className="w-3 h-3" />Locked</span>
                          ) : u.canLogin ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Unlock className="w-3 h-3" />Enabled</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-400"><Lock className="w-3 h-3" />No login</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-ink-400 text-xs hidden md:table-cell">{u.detail || '—'}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-ink-400">No accounts match your search</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'permissions' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {roleSummary.map((r) => (
                  <Card key={r.level} className="p-4" hover>
                    <div className={`w-9 h-9 rounded-lg ring-1 ring-inset flex items-center justify-center mb-3 ${roleIconClass[r.level]}`}>
                      <Shield className="w-4.5 h-4.5" strokeWidth={2.2} />
                    </div>
                    <p className="text-sm font-semibold text-ink-900">{r.level}</p>
                    <p className="text-lg font-bold text-ink-800 mt-2 tabular-nums">{r.count} <span className="text-xs font-normal text-ink-400">accounts</span></p>
                  </Card>
                ))}
              </div>

              <Card>
                <div className="px-5 py-3 border-b border-ink-100">
                  <h3 className="text-sm font-semibold text-ink-900">Table Access Matrix</h3>
                  <p className="text-xs text-ink-400 mt-0.5">Access level per account, per table ({data?.database})</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                        <th className="text-left font-medium px-5 py-2.5 sticky left-0 bg-ink-50/90">Table</th>
                        {(data?.users ?? []).filter((u) => u.canLogin).map((u) => <th key={u.name} className="text-center font-medium px-3 py-2.5 whitespace-nowrap font-mono">{u.name}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.tables ?? []).map((t) => (
                        <tr key={t} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/30 transition-colors">
                          <td className="px-5 py-3 font-mono text-xs font-medium text-ink-800 sticky left-0 bg-white">{t}</td>
                          {(data?.users ?? []).filter((u) => u.canLogin).map((u) => {
                            const lvl = u.superuser ? 'Full' : u.perTable[t] || 'None';
                            return <td key={u.name} className="px-3 py-3 text-center"><Badge tone={levelTone[lvl]}>{lvl}</Badge></td>;
                          })}
                        </tr>
                      ))}
                      {(!data?.tables || data.tables.length === 0) && (
                        <tr><td colSpan={(data?.users.length ?? 0) + 1} className="px-5 py-8 text-center text-sm text-ink-400">No tables in this database</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
