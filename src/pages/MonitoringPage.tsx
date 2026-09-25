import { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, MemoryStick, Activity, Zap, AlertTriangle, Loader2, Database, RefreshCw } from 'lucide-react';
import { Card, CardHeader, Badge, PageHeader, Button } from '@/components/ui';
import { AreaChart, Gauge, BarChart } from '@/components/charts';
import { fetchConnections, fetchMonitoring, type DbConnection, type MonitoringData } from '@/lib/api';
import { formatBytes, formatNumber } from '@/lib/format';

export function MonitoringPage() {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => { fetchConnections().then((c) => { setConnections(c); setCurrentId((cur) => cur ?? (c.find((x) => x.status === 'online') ?? c[0])?.id); }).catch(() => {}); }, []);

  const load = useCallback(async (silent = false) => {
    const my = ++reqId.current;
    if (!silent) setLoading(true);
    try {
      const d = await fetchMonitoring(currentId);
      if (my !== reqId.current) return;
      setData(d);
      setError(null);
    } catch (err) {
      if (my !== reqId.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [currentId]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return <div className="py-24 text-center animate-fade-in"><Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" /><p className="text-sm text-ink-400">Loading monitoring data…</p></div>;
  }

  const host = data?.host;
  const dbLive = data?.db;
  const cpuSeries = host?.series.map((s) => s.cpu) ?? [];
  const ramSeries = host?.series.map((s) => s.ram) ?? [];
  const connSeries = dbLive?.series.map((s) => s.connections) ?? [];
  const qpsSeries = dbLive?.series.map((s) => s.qps) ?? [];
  const rwSeries = dbLive?.series.map((s) => s.rowsRead) ?? [];
  const wwSeries = dbLive?.series.map((s) => s.rowsWritten) ?? [];

  const metrics = [
    { label: 'Host CPU', value: `${(host?.cpu ?? 0).toFixed(0)}%`, icon: Cpu, color: '#2563eb', bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100' },
    { label: 'Host RAM', value: `${host?.ramPercent ?? 0}%`, icon: MemoryStick, color: '#059669', bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100', sub: formatBytes(host?.ramUsed) },
    { label: 'DB Connections', value: dbLive ? formatNumber(dbLive.status.connections) : '—', icon: Activity, color: '#d97706', bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100', sub: dbLive ? `of ${dbLive.status.maxConnections} max` : undefined },
    { label: 'Query rate', value: dbLive ? `${dbLive.sample.qps.toFixed(1)}/s` : '—', icon: Zap, color: '#7c3aed', bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Monitoring"
        subtitle="Real-time infrastructure health and performance metrics"
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => load()}>Refresh</Button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
              <span className="text-xs font-medium text-emerald-700">Live · every 15s</span>
            </div>
          </>
        }
      />

      {/* Database selector */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <span className="text-xs text-ink-400 shrink-0">Database:</span>
        <button
          onClick={() => setCurrentId(undefined)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${!currentId ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}
        >
          Host only
        </button>
        {connections.map((c) => (
          <button key={c.id} onClick={() => setCurrentId(c.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${c.id === currentId ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {c.name}
          </button>
        ))}
      </div>

      {data?.dbError && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />{data.dbError}
        </div>
      )}
      {error && <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4" hover>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg ring-1 ring-inset ${m.bg} ${m.ring} flex items-center justify-center`}><m.icon className={`w-4.5 h-4.5 ${m.text}`} strokeWidth={2.2} /></div>
              {m.sub && <span className="text-[11px] text-ink-400">{m.sub}</span>}
            </div>
            <p className="text-2xl font-bold text-ink-900 tabular-nums">{m.value}</p>
            <p className="text-xs text-ink-400 mt-0.5">{m.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <Card>
          <CardHeader title="Host CPU" subtitle="DBHub server" action={<Badge tone="blue" dot>{(host?.cpu ?? 0).toFixed(0)}%</Badge>} />
          <div className="p-4">{cpuSeries.length > 1 ? <AreaChart data={cpuSeries} color="#2563eb" height={180} unit="" /> : <EmptyChart />}</div>
        </Card>
        <Card>
          <CardHeader title="Host RAM" subtitle="DBHub server" action={<Badge tone="green" dot>{host?.ramPercent ?? 0}%</Badge>} />
          <div className="p-4">{ramSeries.length > 1 ? <AreaChart data={ramSeries} color="#059669" height={180} unit="" /> : <EmptyChart />}</div>
        </Card>
        <Card>
          <CardHeader title="Active Connections" subtitle={dbLive ? 'Selected database' : 'Pick a database above'} action={dbLive && <Badge tone="amber" dot>{dbLive.status.connections} now</Badge>} />
          <div className="p-4">{connSeries.length > 1 ? <BarChart data={connSeries} color="#d97706" height={180} /> : <EmptyChart />}</div>
        </Card>
        <Card>
          <CardHeader title="Query Rate" subtitle={dbLive ? `Queries/sec · ${dbLive.status.unit}` : 'Pick a database above'} action={dbLive && <Badge tone="violet" dot>{dbLive.sample.qps.toFixed(1)}/s</Badge>} />
          <div className="p-4">{qpsSeries.length > 1 ? <AreaChart data={qpsSeries} color="#7c3aed" height={180} unit="" /> : <EmptyChart />}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <Card>
          <CardHeader title="Disk Usage" subtitle={`${formatBytes(host?.disk.used)} of ${formatBytes(host?.disk.total)}`} />
          <div className="p-4 flex justify-center">
            <Gauge value={host?.disk.used ?? 0} max={host?.disk.total ?? 1} label={`${host?.disk.percent ?? 0}%`} sublabel="disk used" color={(host?.disk.percent ?? 0) > 90 ? '#e11d48' : '#2563eb'} size={170} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Rows Read vs Written" subtitle={dbLive ? 'Per second' : 'Pick a database above'} />
          <div className="p-4">
            {rwSeries.length > 1 ? (
              <>
                <AreaChart data={rwSeries} color="#2563eb" height={140} unit="" />
                <AreaChart data={wwSeries} color="#e11d48" height={80} showGrid={false} />
                <div className="flex items-center justify-center gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />Read/s</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />Write/s</span>
                </div>
              </>
            ) : <EmptyChart />}
          </div>
        </Card>

        <Card>
          <CardHeader title="Slow Queries" subtitle="Last 24 hours" action={<AlertTriangle className="w-4 h-4 text-amber-500" />} />
          <div className="p-4 space-y-3">
            {(data?.slow ?? []).filter((q) => q.impact !== 'low').map((q, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <code className="font-mono text-ink-600 truncate flex-1 mr-2">{q.query}</code>
                  <span className="font-medium text-ink-800 tabular-nums shrink-0">{q.avg_ms}ms</span>
                </div>
                <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${q.impact === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (q.avg_ms / Math.max(1, data?.slowThresholdMs ?? 1000) / 3) * 100)}%` }} />
                </div>
                <span className="text-[10px] text-ink-400">{q.calls.toLocaleString()} calls</span>
              </div>
            ))}
            {(!data?.slow || data.slow.filter((q) => q.impact !== 'low').length === 0) && (
              <p className="text-xs text-ink-400 text-center py-4">No slow queries recorded</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Active Connections"
          subtitle={dbLive ? `${dbLive.activity.length} connections · ${dbLive.activity.filter((c) => !c.idle).length} active` : 'Select a database to see its process list'}
        />
        {dbLive ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                  <th className="text-left font-medium px-5 py-2.5">ID</th>
                  <th className="text-left font-medium px-3 py-2.5">User</th>
                  <th className="text-left font-medium px-3 py-2.5">Database</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Host</th>
                  <th className="text-left font-medium px-3 py-2.5">State</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Query</th>
                  <th className="text-right font-medium px-5 py-2.5">Duration</th>
                </tr>
              </thead>
              <tbody>
                {dbLive.activity.map((c) => (
                  <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40 transition-colors">
                    <td className="px-5 py-3 text-ink-400 text-xs tabular-nums">#{c.id}</td>
                    <td className="px-3 py-3 font-mono text-xs text-ink-700">{c.user}</td>
                    <td className="px-3 py-3 font-mono text-xs text-blue-600">{c.database}</td>
                    <td className="px-3 py-3 text-ink-500 text-xs hidden md:table-cell">{c.host}</td>
                    <td className="px-3 py-3"><Badge tone={c.idle ? 'slate' : 'green'} dot={!c.idle}>{c.state}</Badge></td>
                    <td className="px-3 py-3 hidden lg:table-cell"><code className="font-mono text-xs text-ink-400 truncate block max-w-xs">{c.query || '—'}</code></td>
                    <td className="px-5 py-3 text-right text-ink-500 text-xs tabular-nums">{c.seconds < 60 ? `${Math.round(c.seconds)}s` : `${Math.round(c.seconds / 60)}m`}</td>
                  </tr>
                ))}
                {dbLive.activity.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-ink-400">No active connections</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-ink-400 flex flex-col items-center gap-2">
            <Database className="w-6 h-6 text-ink-300" />
            Pick a database above to see its live connections
          </div>
        )}
      </Card>
    </div>
  );
}

function EmptyChart() {
  return <div className="py-14 text-center text-sm text-ink-400">Collecting data…</div>;
}
