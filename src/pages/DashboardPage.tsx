import { useState, useEffect, useCallback } from 'react';
import {
  Database, Table2, Activity, AlertTriangle, ChevronRight, ArrowUpRight, ArrowDownRight,
  Loader2, RefreshCw, HardDrive, Clock,
} from 'lucide-react';
import { Card, CardHeader, Badge, Button, PageHeader, statusTone } from '@/components/ui';
import { AreaChart, Gauge, BarList } from '@/components/charts';
import { fetchDashboard, type DashboardData } from '@/lib/api';
import { formatBytes, formatNumber, timeAgo, formatDate } from '@/lib/format';
import type { PageKey } from '@/lib/types';

export function DashboardPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await fetchDashboard();
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="py-24 text-center animate-fade-in">
        <Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" />
        <p className="text-sm text-ink-400">Loading dashboard…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Dashboard" subtitle="Overview of your infrastructure" />
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { stats, host, databases, topTables, recentQueries, lastBackup, backupsFailed48h } = data;

  const trend = stats.queriesTrend;
  const cards = [
    { label: 'Total Databases', value: formatNumber(stats.databases), icon: Database, color: 'blue', sub: `${stats.online} online` },
    { label: 'Total Tables', value: formatNumber(stats.tables), icon: Table2, color: 'violet', sub: formatBytes(stats.totalBytes) },
    { label: 'Active Connections', value: formatNumber(stats.activeConnections), icon: Activity, color: 'emerald', sub: `${stats.errors24h} errors / 24h` },
    { label: 'Queries (24h)', value: formatNumber(stats.queries24h), icon: Clock, color: 'amber', sub: `${stats.avgQueryMs}ms avg`, trend },
  ];
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100', violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100', amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  };

  const cpuSeries = host.series.map((s) => s.cpu);
  const ramSeries = host.series.map((s) => s.ram);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your infrastructure"
        actions={<Button variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => load()}>Refresh</Button>}
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error} — showing the last known data.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {cards.map((s) => (
          <Card key={s.label} className="p-4" hover>
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-lg ring-1 ring-inset flex items-center justify-center ${colorMap[s.color]}`}>
                <s.icon className="w-4.5 h-4.5" strokeWidth={2.2} />
              </div>
              <span className="text-2xl font-bold text-ink-900 tabular-nums">{s.value}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-ink-400">{s.label}</span>
              {'trend' in s && s.trend !== null && s.trend !== undefined ? (
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${s.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {s.trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(s.trend)}%
                </span>
              ) : (
                <span className="text-[11px] font-medium text-ink-400">{s.sub}</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Server CPU & RAM"
            subtitle="DBHub host — last few minutes"
            action={
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />CPU {host.cpu.toFixed(0)}%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />RAM {host.ramPercent}%</span>
              </div>
            }
          />
          <div className="p-4">
            {cpuSeries.length > 1 ? (
              <>
                <AreaChart data={cpuSeries} color="#2563eb" height={160} unit={`${host.cpu.toFixed(0)}%`} />
                <div className="mt-2 pt-3 border-t border-ink-100">
                  <AreaChart data={ramSeries} color="#059669" height={80} showGrid={false} />
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-ink-400">Collecting metrics…</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Disk Usage" subtitle="DBHub data volume" />
          <div className="p-4 flex flex-col items-center">
            <Gauge value={host.disk.used} max={host.disk.total} label={`${host.disk.percent}%`} sublabel={`${formatBytes(host.disk.used)} used`} color={host.disk.percent > 90 ? '#e11d48' : '#2563eb'} size={160} />
            <div className="w-full mt-3 pt-3 border-t border-ink-100 space-y-2">
              <div className="flex items-center justify-between text-xs"><span className="text-ink-400">Used</span><span className="font-medium text-ink-800">{formatBytes(host.disk.used)}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-ink-400">Total</span><span className="font-medium text-ink-800">{formatBytes(host.disk.total)}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-ink-400">Uptime</span><span className="font-medium text-ink-800">{Math.floor(host.uptimeSec / 3600)}h</span></div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Databases"
            action={<button onClick={() => onNavigate('databases')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5">View all <ChevronRight className="w-3 h-3" /></button>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400">
                  <th className="text-left font-medium px-5 py-2.5">Database</th>
                  <th className="text-left font-medium px-3 py-2.5">Engine</th>
                  <th className="text-right font-medium px-3 py-2.5">Tables</th>
                  <th className="text-right font-medium px-3 py-2.5">Size</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {databases.slice(0, 6).map((d) => (
                  <tr key={d.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50 transition-colors cursor-pointer" onClick={() => onNavigate('databases')}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Database className="w-3.5 h-3.5 text-blue-600" /></div>
                        <span className="font-medium text-ink-800 font-mono text-xs">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-500 text-xs capitalize">{d.engine}</td>
                    <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{d.tables}</td>
                    <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{formatBytes(d.size_bytes)}</td>
                    <td className="px-3 py-3"><Badge tone={statusTone(d.status)} dot>{d.status}</Badge></td>
                  </tr>
                ))}
                {databases.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-ink-400">No databases connected yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Top Tables" subtitle="By size" action={<button onClick={() => onNavigate('tables')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View</button>} />
          <div className="p-4">
            {topTables.length > 0 ? (
              <BarList items={topTables.map((t, i) => ({
                label: `${t.name}`,
                value: t.bytes,
                valueLabel: formatBytes(t.bytes),
                color: ['#2563eb', '#0891b2', '#059669', '#d97706', '#7c3aed', '#e11d48'][i] || '#94a3b8',
              }))} />
            ) : (
              <p className="text-sm text-ink-400 text-center py-6">No tables yet</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent SQL Queries"
            action={<button onClick={() => onNavigate('query-history')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5">View all <ChevronRight className="w-3 h-3" /></button>}
          />
          <div className="divide-y divide-ink-50">
            {recentQueries.map((q) => (
              <div key={q.id} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/50 transition-colors cursor-pointer" onClick={() => onNavigate('query-history')}>
                <Badge tone={q.status === 'success' ? 'green' : q.status === 'slow' ? 'amber' : 'red'} dot>
                  {q.status === 'success' ? 'OK' : q.status === 'slow' ? 'Slow' : 'Error'}
                </Badge>
                <code className="flex-1 font-mono text-xs text-ink-700 truncate">{q.query}</code>
                <span className="hidden sm:block text-xs text-ink-400 shrink-0">{q.connection_name}</span>
                <span className="text-xs text-ink-400 tabular-nums shrink-0 w-16 text-right">{q.duration_ms}ms</span>
                <span className="text-xs text-ink-400 shrink-0 w-20 text-right hidden sm:block">{timeAgo(q.executed_at)}</span>
              </div>
            ))}
            {recentQueries.length === 0 && <div className="py-10 text-center text-sm text-ink-400">No queries run yet</div>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Last Backup" subtitle={backupsFailed48h > 0 ? `${backupsFailed48h} failed in 48h` : undefined} action={<button onClick={() => onNavigate('backups')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View</button>} />
          <div className="p-4">
            {lastBackup ? (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><HardDrive className="w-4 h-4 text-emerald-600" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800 truncate">{lastBackup.connection_name}</p>
                  <p className="text-xs text-ink-400 mt-0.5 font-mono truncate">{lastBackup.filename}</p>
                  <p className="text-xs text-ink-400 mt-1">{formatBytes(lastBackup.size_bytes)} · {formatDate(lastBackup.created_at)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-400 text-center py-6">No backups yet</p>
            )}
            {backupsFailed48h > 0 && (
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-1.5 text-xs text-rose-600">
                <AlertTriangle className="w-3.5 h-3.5" />{backupsFailed48h} backup{backupsFailed48h === 1 ? '' : 's'} failed in the last 48h
              </div>
            )}
          </div>
        </Card>
      </div>

    </div>
  );
}
