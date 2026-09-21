import {
  Database, Table2, Rows3, Users, Cable, MemoryStick, Cpu, HardDrive,
  ArrowUpRight, ArrowDownRight, MoreHorizontal, Play, Clock, ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, Badge, Button, statusTone, PageHeader } from '@/components/ui';
import { AreaChart, Gauge, DonutChart, BarList } from '@/components/charts';
import {
  dashboardStats, recentDatabases, recentQueries, topTables,
  cpuSeries, ramSeries, cpuLabels, dbSizeBreakdown, diskUsage,
} from '@/data/mockData';
import type { PageKey } from '@/data/mockData';

const iconMap: Record<string, typeof Database> = {
  Database, Table2, Rows3, Users, Cable, MemoryStick, Cpu, HardDrive,
};

const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', ring: 'ring-blue-100' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', ring: 'ring-cyan-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600', ring: 'ring-violet-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', ring: 'ring-amber-100' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-100' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', ring: 'ring-orange-100' },
  slate: { bg: 'bg-ink-100', text: 'text-ink-600', ring: 'ring-ink-200' },
};

export function DashboardPage({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your database infrastructure · Last updated 2 min ago"
        actions={
          <>
            <Button variant="secondary" size="md" icon={<Clock className="w-3.5 h-3.5" />}>Last 24h</Button>
            <Button variant="primary" size="md" icon={<Play className="w-3.5 h-3.5" />} onClick={() => onNavigate('sql-editor')}>New Query</Button>
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
        {dashboardStats.map((stat) => {
          const Icon = iconMap[stat.icon];
          const c = colorMap[stat.color];
          return (
            <Card key={stat.label} hover className="p-4 animate-slide-up">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg ${c.bg} ring-1 ring-inset ${c.ring} flex items-center justify-center`}>
                  <Icon className={`w-4.5 h-4.5 ${c.text}`} strokeWidth={2.2} />
                </div>
                <button className="text-ink-300 hover:text-ink-500 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-ink-900 tracking-tight tabular-nums">{stat.value}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-ink-400">{stat.label}</span>
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${stat.trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {stat.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {stat.trend}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="CPU & RAM Usage"
            subtitle="Last 24 hours"
            action={
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />CPU</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />RAM</span>
              </div>
            }
          />
          <div className="p-4">
            <AreaChart
              data={cpuSeries}
              labels={cpuLabels}
              color="#2563eb"
              height={160}
              unit="42% avg"
            />
            <div className="mt-2 pt-3 border-t border-ink-100">
              <AreaChart
                data={ramSeries}
                color="#059669"
                height={80}
                showGrid={false}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Disk Usage" subtitle="Storage allocation" />
          <div className="p-4 flex flex-col items-center">
            <Gauge value={diskUsage.used} max={diskUsage.total} label={`${diskUsage.percent}%`} sublabel={diskUsage.label} color="#2563eb" size={160} />
            <div className="w-full mt-3 pt-3 border-t border-ink-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-400">Used</span>
                <span className="font-medium text-ink-800">2.4 TB</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-400">Available</span>
                <span className="font-medium text-ink-800">1.6 TB</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-400">Growth rate</span>
                <span className="font-medium text-emerald-600">+38 GB/wk</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent databases + Top tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent Databases"
            action={
              <button onClick={() => onNavigate('databases')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5">
                View all <ChevronRight className="w-3 h-3" />
              </button>
            }
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
                {recentDatabases.map((db) => (
                  <tr key={db.name} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50 transition-colors cursor-pointer" onClick={() => onNavigate('databases')}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Database className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <span className="font-medium text-ink-800 font-mono text-xs">{db.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-500 text-xs">{db.engine}</td>
                    <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{db.tables}</td>
                    <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{db.size}</td>
                    <td className="px-3 py-3"><Badge tone={statusTone(db.status)} dot>{db.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Top Tables" subtitle="By row count" action={<button onClick={() => onNavigate('tables')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View</button>} />
          <div className="p-4">
            <BarList items={topTables.map((t, i) => ({
              label: t.name,
              value: parseFloat(t.size),
              color: ['#2563eb', '#0891b2', '#059669', '#d97706'][i] || '#94a3b8',
            }))} />
          </div>
        </Card>
      </div>

      {/* Recent queries + storage breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent SQL Queries"
            action={
              <button onClick={() => onNavigate('query-history')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5">
                View all <ChevronRight className="w-3 h-3" />
              </button>
            }
          />
          <div className="divide-y divide-ink-50">
            {recentQueries.map((q) => (
              <div key={q.id} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/50 transition-colors cursor-pointer" onClick={() => onNavigate('sql-editor')}>
                <Badge tone={q.status === 'success' ? 'green' : q.status === 'slow' ? 'amber' : 'red'} dot>
                  {q.status === 'success' ? 'OK' : q.status === 'slow' ? 'Slow' : 'Error'}
                </Badge>
                <code className="flex-1 font-mono text-xs text-ink-700 truncate">{q.query}</code>
                <span className="hidden sm:block text-xs text-ink-400 shrink-0">{q.database}</span>
                <span className="text-xs text-ink-400 tabular-nums shrink-0 w-16 text-right">{q.duration}ms</span>
                <span className="text-xs text-ink-400 shrink-0 w-16 text-right hidden sm:block">{q.timestamp}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Storage by Database" subtitle="GB allocated" />
          <div className="p-4">
            <DonutChart data={dbSizeBreakdown} size={130} />
          </div>
        </Card>
      </div>
    </div>
  );
}
