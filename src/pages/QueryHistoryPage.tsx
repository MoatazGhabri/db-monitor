import { useState } from 'react';
import { History, CheckCircle2, AlertCircle, Clock, Play, Download, Filter } from 'lucide-react';
import { Card, Badge, Button, statusTone, PageHeader, SearchInput } from '@/components/ui';
import { queryHistory } from '@/data/mockData';

export function QueryHistoryPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'success' | 'slow' | 'error'>('all');

  const queries = queryHistory.filter((q) =>
    q.query.toLowerCase().includes(search.toLowerCase()) &&
    (filter === 'all' || q.status === filter)
  );

  const stats = [
    { label: 'Total Queries', value: queryHistory.length },
    { label: 'Successful', value: queryHistory.filter(q => q.status === 'success').length },
    { label: 'Slow Queries', value: queryHistory.filter(q => q.status === 'slow').length },
    { label: 'Errors', value: queryHistory.filter(q => q.status === 'error').length },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Query History"
        subtitle="Audit trail of all executed SQL queries"
        actions={<Button variant="secondary" icon={<Download className="w-3.5 h-3.5" />}>Export Log</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {stats.map((s, i) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-ink-400 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-ink-900 tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-5 py-3 border-b border-ink-100">
          <SearchInput placeholder="Search queries…" value={search} onChange={setSearch} />
          <div className="flex items-center gap-2">
            {(['all', 'success', 'slow', 'error'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  filter === f ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-ink-500 hover:bg-ink-50'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-xs text-ink-400">{queries.length} queries</span>
        </div>

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
                    <span className="font-mono text-blue-600">{q.database}</span>
                    <span>by {q.user}</span>
                    <span className="tabular-nums">{q.duration}ms</span>
                    <span className="tabular-nums">{q.rows} rows</span>
                    <span>{q.timestamp}</span>
                  </div>
                </div>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {queries.length === 0 && (
          <div className="py-16 text-center">
            <History className="w-8 h-8 text-ink-300 mx-auto mb-2" />
            <p className="text-sm text-ink-500">No queries found</p>
          </div>
        )}
      </Card>
    </div>
  );
}
