import { useState, useEffect, useCallback } from 'react';
import { History, CheckCircle2, AlertCircle, Clock, Play, Download, Trash2, Loader2 } from 'lucide-react';
import { Card, Button, PageHeader, SearchInput } from '@/components/ui';
import { fetchConnections, fetchQueryHistoryFull, clearQueryHistory, type DbConnection, type QueryHistoryEntryFull } from '@/lib/api';
import { formatDate } from '@/lib/format';

export function QueryHistoryPage({ onOpenSql }: { onOpenSql?: (connectionId: string, sql: string) => void }) {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [connFilter, setConnFilter] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'success' | 'slow' | 'error'>('all');
  const [queries, setQueries] = useState<QueryHistoryEntryFull[]>([]);
  const [stats, setStats] = useState({ total: 0, success: 0, slow: 0, error: 0, avg_ms: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchConnections().then(setConnections).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchQueryHistoryFull({ connectionId: connFilter || undefined, status: filter, q: search || undefined, limit: 300 });
      setQueries(r.queries);
      setStats(r.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load query history');
    } finally {
      setLoading(false);
    }
  }, [connFilter, filter, search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const clear = async () => {
    if (!window.confirm(connFilter ? 'Clear the query history for this database?' : 'Clear all query history?')) return;
    try { await clearQueryHistory(connFilter || undefined); load(); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to clear history'); }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = ['time,database,user,status,duration_ms,rows_affected,query', ...queries.map((q) =>
      [q.executed_at, q.connection_name, q.executed_by, q.status, q.duration_ms, q.rows_affected, q.query].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'query_history.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { label: 'Total Queries', value: stats.total },
    { label: 'Successful', value: stats.success },
    { label: 'Slow Queries', value: stats.slow },
    { label: 'Errors', value: stats.error },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Query History"
        subtitle="Audit trail of all executed SQL queries"
        actions={
          <>
            <Button variant="secondary" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={clear} disabled={queries.length === 0}>Clear</Button>
            <Button variant="secondary" icon={<Download className="w-3.5 h-3.5" />} onClick={exportCsv} disabled={queries.length === 0}>Export Log</Button>
          </>
        }
      />

      {error && <div className="mb-4 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-ink-400 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-ink-900 tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-5 py-3 border-b border-ink-100 flex-wrap">
          <SearchInput placeholder="Search queries…" value={search} onChange={setSearch} />
          <select value={connFilter} onChange={(e) => setConnFilter(e.target.value)} className="text-xs bg-white border border-ink-200 rounded-lg px-2.5 py-1.5 text-ink-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
            <option value="">All databases</option>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            {(['all', 'success', 'slow', 'error'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${filter === f ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-ink-500 hover:bg-ink-50'}`}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-xs text-ink-400">{queries.length} shown</span>
        </div>

        {loading ? (
          <div className="py-14 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" /><p className="text-sm text-ink-400">Loading…</p></div>
        ) : (
          <div className="divide-y divide-ink-50">
            {queries.map((q) => (
              <div key={q.id} className="px-5 py-3 hover:bg-ink-50/40 transition-colors group">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {q.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {q.status === 'slow' && <Clock className="w-4 h-4 text-amber-500" />}
                    {q.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-xs font-mono text-ink-700 block truncate group-hover:text-ink-900 transition-colors">{q.query}</code>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-400 flex-wrap">
                      <span className="font-mono text-blue-600">{q.connection_name}</span>
                      <span>by {q.executed_by}</span>
                      <span className="tabular-nums">{q.duration_ms}ms</span>
                      <span className="tabular-nums">{q.rows_affected} rows</span>
                      <span>{formatDate(q.executed_at)}</span>
                    </div>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded shrink-0"
                    title="Open in SQL editor"
                    onClick={() => onOpenSql?.(q.connection_id, q.query)}
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {queries.length === 0 && (
              <div className="py-16 text-center">
                <History className="w-8 h-8 text-ink-300 mx-auto mb-2" />
                <p className="text-sm text-ink-500">No queries found</p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
