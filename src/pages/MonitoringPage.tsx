import { Cpu, MemoryStick, Activity, Zap, Gauge as GaugeIcon, AlertTriangle, TrendingUp } from 'lucide-react';
import { Card, CardHeader, Badge, PageHeader } from '@/components/ui';
import { AreaChart, MultiLineChart, Gauge, BarChart } from '@/components/charts';
import {
  cpuSeries, ramSeries, connectionsSeries, queryPerfSeries,
  cpuLabels, connLabels, diskUsage, activeConnections, queryPerformance,
} from '@/data/mockData';

export function MonitoringPage() {
  const metrics = [
    { label: 'CPU Usage', value: '42%', icon: Cpu, color: '#2563eb', bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100', trend: '+5%' },
    { label: 'RAM Usage', value: '12 GB', icon: MemoryStick, color: '#059669', bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100', trend: '76%' },
    { label: 'Connections', value: '18', icon: Activity, color: '#d97706', bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100', trend: 'peak 24' },
    { label: 'QPS', value: '1,247', icon: Zap, color: '#7c3aed', bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100', trend: '+12%' },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Monitoring"
        subtitle="Real-time infrastructure health and performance metrics"
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
            <span className="text-xs font-medium text-emerald-700">Live · refreshed 5s ago</span>
          </div>
        }
      />

      {/* Top metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4" hover>
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg ring-1 ring-inset ${m.bg} ${m.ring} flex items-center justify-center`}>
                <m.icon className={`w-4.5 h-4.5 ${m.text}`} strokeWidth={2.2} />
              </div>
              <span className="text-[11px] text-ink-400 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{m.trend}</span>
            </div>
            <p className="text-2xl font-bold text-ink-900 tabular-nums">{m.value}</p>
            <p className="text-xs text-ink-400 mt-0.5">{m.label}</p>
          </Card>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <Card>
          <CardHeader title="CPU Usage" subtitle="Last 24 hours · avg 44%" action={<Badge tone="blue" dot>42%</Badge>} />
          <div className="p-4">
            <AreaChart data={cpuSeries} labels={cpuLabels} color="#2563eb" height={180} unit="" />
          </div>
        </Card>

        <Card>
          <CardHeader title="RAM Usage" subtitle="Last 24 hours · avg 75%" action={<Badge tone="green" dot>76%</Badge>} />
          <div className="p-4">
            <AreaChart data={ramSeries} labels={cpuLabels} color="#059669" height={180} unit="" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Active Connections" subtitle="Last 7 days" action={<Badge tone="amber" dot>18 now</Badge>} />
          <div className="p-4">
            <BarChart data={connectionsSeries} labels={connLabels} color="#d97706" height={180} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Query Performance" subtitle="Avg query latency (ms)" action={<Badge tone="violet" dot>27ms avg</Badge>} />
          <div className="p-4">
            <AreaChart data={queryPerfSeries} labels={connLabels} color="#7c3aed" height={180} unit="" />
          </div>
        </Card>
      </div>

      {/* Gauges + slow queries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <Card>
          <CardHeader title="Disk Usage" subtitle="2.4TB of 4TB" />
          <div className="p-4 flex justify-center">
            <Gauge value={diskUsage.used} max={diskUsage.total} label="60%" sublabel="2.4TB / 4TB" color="#2563eb" size={170} />
          </div>
        </Card>

        <Card>
          <CardHeader title="I/O Throughput" subtitle="Read vs Write" />
          <div className="p-4">
            <MultiLineChart
              series={[
                { data: [45, 52, 48, 61, 55, 67, 72, 58, 64, 71, 69, 63], color: '#2563eb', label: 'Read' },
                { data: [28, 31, 35, 29, 42, 38, 45, 41, 36, 48, 44, 39], color: '#e11d48', label: 'Write' },
              ]}
              labels={cpuLabels}
              height={170}
            />
            <div className="flex items-center justify-center gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />Read MB/s</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />Write MB/s</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Slow Queries" subtitle="Top by avg duration" action={<AlertTriangle className="w-4 h-4 text-amber-500" />} />
          <div className="p-4 space-y-3">
            {queryPerformance.filter(q => q.impact !== 'low').map((q, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <code className="font-mono text-ink-600 truncate flex-1 mr-2">{q.query}</code>
                  <span className="font-medium text-ink-800 tabular-nums shrink-0">{q.avgMs}ms</span>
                </div>
                <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${q.impact === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${(q.avgMs / 5600) * 100}%` }} />
                </div>
                <span className="text-[10px] text-ink-400">{q.calls.toLocaleString()} calls</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Active connections table */}
      <Card>
        <CardHeader title="Active Connections" subtitle={`${activeConnections.length} connections · ${activeConnections.filter(c => !c.idle).length} active`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                <th className="text-left font-medium px-5 py-2.5">ID</th>
                <th className="text-left font-medium px-3 py-2.5">User</th>
                <th className="text-left font-medium px-3 py-2.5">Database</th>
                <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Client</th>
                <th className="text-left font-medium px-3 py-2.5">State</th>
                <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Query</th>
                <th className="text-right font-medium px-5 py-2.5">Duration</th>
              </tr>
            </thead>
            <tbody>
              {activeConnections.map((c) => (
                <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40 transition-colors">
                  <td className="px-5 py-3 text-ink-400 text-xs tabular-nums">#{c.id}</td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-700">{c.user}</td>
                  <td className="px-3 py-3 font-mono text-xs text-blue-600">{c.database}</td>
                  <td className="px-3 py-3 text-ink-500 text-xs hidden md:table-cell">{c.client}</td>
                  <td className="px-3 py-3"><Badge tone={c.idle ? 'slate' : 'green'} dot={!c.idle}>{c.state}</Badge></td>
                  <td className="px-3 py-3 hidden lg:table-cell"><code className="font-mono text-xs text-ink-400 truncate block max-w-xs">{c.query}</code></td>
                  <td className="px-5 py-3 text-right text-ink-500 text-xs tabular-nums">{c.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
