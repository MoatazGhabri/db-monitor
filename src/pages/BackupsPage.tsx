import { useState } from 'react';
import {
  HardDrive, Plus, Play, RotateCcw, Download, Calendar, CheckCircle2, AlertCircle,
  Clock, Cloud, CloudUpload, Trash2, Settings2, Link2, Unlink, ChevronRight, X,
  Repeat, Shield, Info,
} from 'lucide-react';
import { Card, CardHeader, Badge, Button, statusTone, PageHeader, Progress } from '@/components/ui';
import { AreaChart } from '@/components/charts';
import {
  backups, backupSchedules, connectedDrives, cloudProviders,
  type CloudProvider, type BackupFrequency, type RetentionUnit, type BackupScheduleConfig,
} from '@/data/mockData';

const backupSizeSeries = [12, 18, 24, 32, 45, 52, 67, 78, 95, 112, 134, 156];

const frequencyLabels: Record<BackupFrequency, string> = {
  'daily': 'Every day',
  'every-2-days': 'Every 2 days',
  'weekly': 'Every week',
  'custom': 'Custom cron',
};

const frequencyToCron: Record<BackupFrequency, string> = {
  'daily': '0 3 * * *',
  'every-2-days': '0 3 */2 * *',
  'weekly': '0 3 * * 0',
  'custom': '0 3 * * *',
};

export function BackupsPage() {
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BackupScheduleConfig | null>(null);
  const [schedules, setSchedules] = useState<BackupScheduleConfig[]>(backupSchedules);
  const [drives, setDrives] = useState(connectedDrives);

  const stats = [
    { label: 'Total Backups', value: backups.length, icon: HardDrive, color: 'blue' },
    { label: 'Completed', value: backups.filter(b => b.status === 'Completed').length, icon: CheckCircle2, color: 'green' },
    { label: 'Scheduled', value: backups.filter(b => b.status === 'Scheduled').length, icon: Calendar, color: 'amber' },
    { label: 'Failed', value: backups.filter(b => b.status === 'Failed').length, icon: AlertCircle, color: 'red' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100', green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100', red: 'bg-rose-50 text-rose-600 ring-rose-100',
  };

  const getDriveLabel = (driveId: string) => drives.find(d => d.id === driveId)?.label ?? '—';
  const getDriveProvider = (driveId: string) => {
    const drive = drives.find(d => d.id === driveId);
    if (!drive) return null;
    return cloudProviders.find(p => p.id === drive.provider);
  };

  const toggleSchedule = (id: string) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const disconnectDrive = (id: string) => {
    setDrives(prev => prev.map(d => d.id === id ? { ...d, connected: false, storageUsed: 0, lastSync: '—' } : d));
  };

  const connectDrive = (provider: CloudProvider) => {
    const providerInfo = cloudProviders.find(p => p.id === provider)!;
    const newId = `cd${Date.now()}`;
    setDrives(prev => [...prev, {
      id: newId,
      provider,
      label: `${providerInfo.name} — New`,
      email: 'user@dbhub.io',
      connected: true,
      storageUsed: 0,
      storageTotal: 2000,
      folder: '/DBHub/Backups',
      lastSync: 'Just now',
    }]);
    setShowDriveModal(false);
  };

  const openEditSchedule = (schedule: BackupScheduleConfig | null) => {
    setEditingSchedule(schedule);
    setShowScheduleModal(true);
  };

  const saveSchedule = (config: BackupScheduleConfig) => {
    if (editingSchedule) {
      setSchedules(prev => prev.map(s => s.id === config.id ? config : s));
    } else {
      setSchedules(prev => [...prev, config]);
    }
    setShowScheduleModal(false);
    setEditingSchedule(null);
  };

  const deleteSchedule = (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Backups"
        subtitle="Automated and manual database backups with cloud drive integration"
        actions={
          <>
            <Button variant="secondary" icon={<Cloud className="w-3.5 h-3.5" />} onClick={() => setShowDriveModal(true)}>Connect Drive</Button>
            <Button variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" />}>Restore</Button>
            <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => openEditSchedule(null)}>New Backup</Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4" hover>
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-lg ring-1 ring-inset flex items-center justify-center ${colorMap[s.color]}`}>
                <s.icon className="w-4.5 h-4.5" strokeWidth={2.2} />
              </div>
              <span className="text-2xl font-bold text-ink-900 tabular-nums">{s.value}</span>
            </div>
            <p className="text-xs text-ink-400">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Cloud Drive Integration */}
      <Card className="mb-5">
        <CardHeader
          title="Cloud Drive Integration"
          subtitle="Connect external storage to receive automated backups"
          action={<Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowDriveModal(true)}>Add Drive</Button>}
        />
        <div className="divide-y divide-ink-50">
          {drives.map((drive) => {
            const provider = cloudProviders.find(p => p.id === drive.provider)!;
            const pct = (drive.storageUsed / drive.storageTotal) * 100;
            return (
              <div key={drive.id} className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50/40 transition-colors group">
                <div className={`w-10 h-10 rounded-lg ${provider.bg} flex items-center justify-center shrink-0`}>
                  <Cloud className="w-5 h-5" style={{ color: provider.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-800">{drive.label}</span>
                    {drive.connected ? (
                      <Badge tone="green" dot>Connected</Badge>
                    ) : (
                      <Badge tone="slate">Disconnected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-400 flex-wrap">
                    <span className="font-mono">{drive.email}</span>
                    <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{drive.folder}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last sync: {drive.lastSync}</span>
                  </div>
                  {drive.connected && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 max-w-xs">
                        <Progress value={pct} tone={pct > 80 ? 'amber' : 'blue'} />
                      </div>
                      <span className="text-[11px] text-ink-400 tabular-nums shrink-0">
                        {drive.storageUsed} GB / {drive.storageTotal} GB
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {drive.connected ? (
                    <>
                      <button className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors" title="Settings">
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => disconnectDrive(drive.id)} className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Disconnect">
                        <Unlink className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <Button variant="secondary" size="sm" icon={<Link2 className="w-3.5 h-3.5" />}>Reconnect</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        {/* Backup size trend */}
        <Card className="lg:col-span-2">
          <CardHeader title="Backup Storage Trend" subtitle="Cumulative backup size over 12 weeks" />
          <div className="p-4">
            <AreaChart data={backupSizeSeries} color="#2563eb" height={140} labels={['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12']} unit="156 GB" />
          </div>
        </Card>

        {/* Storage usage */}
        <Card>
          <CardHeader title="Backup Storage" subtitle="Total: 156 GB" />
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-500">Cloud Storage</span>
              <span className="font-medium text-ink-800">142 GB</span>
            </div>
            <Progress value={91} tone="blue" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-500">Local Cache</span>
              <span className="font-medium text-ink-800">14 GB</span>
            </div>
            <Progress value={9} tone="green" />
          </div>
        </Card>
      </div>

      {/* Backup history */}
      <Card className="mb-5">
        <CardHeader title="Backup History" subtitle="Recent backup operations" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                <th className="text-left font-medium px-5 py-2.5">Database</th>
                <th className="text-left font-medium px-3 py-2.5">Type</th>
                <th className="text-right font-medium px-3 py-2.5">Size</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Time</th>
                <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Destination</th>
                <th className="text-right font-medium px-5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => {
                const provider = b.driveId ? getDriveProvider(b.driveId) : null;
                return (
                  <tr key={b.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40 transition-colors group">
                    <td className="px-5 py-3 font-mono text-xs font-medium text-ink-800">{b.database}</td>
                    <td className="px-3 py-3"><Badge tone={b.type === 'Full' ? 'blue' : b.type === 'Incremental' ? 'cyan' : 'violet'}>{b.type}</Badge></td>
                    <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{b.size}</td>
                    <td className="px-3 py-3">
                      {b.status === 'In Progress' ? (
                        <div className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 border-2 border-ink-200 border-t-blue-600 rounded-full animate-spin" />
                          <span className="text-xs text-blue-600">In Progress</span>
                        </div>
                      ) : (
                        <Badge tone={statusTone(b.status)} dot={b.status === 'Completed'}>{b.status}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-400 text-xs hidden md:table-cell">{b.timestamp}</td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {provider ? (
                        <div className="flex items-center gap-1.5">
                          <Cloud className="w-3.5 h-3.5" style={{ color: provider.color }} />
                          <span className="text-xs text-ink-500">{provider.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-400">Local</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {b.status === 'Completed' && (
                          <>
                            <button className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Download"><Download className="w-3.5 h-3.5" /></button>
                            <button className="p-1.5 text-ink-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Restore"><RotateCcw className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                        {b.status === 'Failed' && (
                          <button className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Retry"><Play className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Backup Schedule with Cron + Retention */}
      <Card>
        <CardHeader
          title="Backup Schedule & Retention"
          subtitle="Configure cron frequency and how many backups to keep per database"
          action={<Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => openEditSchedule(null)}>Add Schedule</Button>}
        />
        <div className="divide-y divide-ink-50">
          {schedules.map((s) => {
            const provider = getDriveProvider(s.driveId);
            return (
              <div key={s.id} className="px-5 py-4 hover:bg-ink-50/40 transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${s.enabled ? 'bg-emerald-500 animate-pulse-dot' : 'bg-ink-300'}`} />
                  <div className="flex-1 min-w-0">
                    {/* Database + destination */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-medium text-ink-800">{s.database}</span>
                      <Badge tone="slate">{frequencyLabels[s.frequency]}</Badge>
                      {s.enabled ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Disabled</Badge>}
                    </div>

                    {/* Details row */}
                    <div className="flex items-center gap-4 mt-1.5 text-[11px] text-ink-400 flex-wrap">
                      {/* Cron */}
                      <span className="flex items-center gap-1" title="Cron expression">
                        <Repeat className="w-3 h-3" />
                        <code className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{s.cronExpression}</code>
                      </span>
                      {/* Time */}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{s.time} {s.timezone}
                      </span>
                      {/* Destination */}
                      {provider && (
                        <span className="flex items-center gap-1">
                          <Cloud className="w-3 h-3" style={{ color: provider.color }} />
                          {getDriveLabel(s.driveId)}
                        </span>
                      )}
                    </div>

                    {/* Retention policy */}
                    <div className="flex items-center gap-2 mt-2">
                      <Shield className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                      <span className="text-xs text-ink-500">
                        Keep last <span className="font-semibold text-ink-800">{s.retentionCount}</span> {s.retentionUnit === 'backups' ? 'backups' : 'days'}
                        {s.retentionUnit === 'backups' && s.enabled && (
                          <span className="text-ink-400"> · currently {s.backupsKept} stored</span>
                        )}
                      </span>
                      {s.enabled && s.retentionUnit === 'backups' && (
                        <div className="flex items-center gap-1">
                          {Array.from({ length: s.retentionCount }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${i < s.backupsKept ? 'bg-emerald-400' : 'bg-ink-200'}`}
                              title={i < s.backupsKept ? 'Backup stored' : 'Slot available'}
                            />
                          ))}
                        </div>
                      )}
                      {/* Auto-cleanup indicator */}
                      {s.enabled && s.retentionUnit === 'backups' && s.backupsKept >= s.retentionCount && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          <Trash2 className="w-2.5 h-2.5" />
                          Oldest will be deleted on next backup
                        </span>
                      )}
                    </div>

                    {/* Next/last run */}
                    <div className="flex items-center gap-4 mt-1.5 text-[11px] text-ink-400">
                      <span>Last: {s.lastRun}</span>
                      <span>Next: {s.nextRun}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEditSchedule(s)} className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100" title="Edit">
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteSchedule(s.id)} className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input type="checkbox" checked={s.enabled} onChange={() => toggleSchedule(s.id)} className="sr-only peer" />
                      <div className="w-9 h-5 bg-ink-200 peer-checked:bg-blue-600 rounded-full transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Modals */}
      {showDriveModal && (
        <ConnectDriveModal onClose={() => setShowDriveModal(false)} onConnect={connectDrive} connectedProviders={drives.filter(d => d.connected).map(d => d.provider)} />
      )}
      {showScheduleModal && (
        <ScheduleModal
          schedule={editingSchedule}
          drives={drives.filter(d => d.connected)}
          onSave={saveSchedule}
          onClose={() => { setShowScheduleModal(false); setEditingSchedule(null); }}
        />
      )}
    </div>
  );
}

/* ---------- Connect Drive Modal ---------- */
function ConnectDriveModal({
  onClose,
  onConnect,
  connectedProviders,
}: {
  onClose: () => void;
  onConnect: (provider: CloudProvider) => void;
  connectedProviders: CloudProvider[];
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-ink-900">Connect Cloud Drive</h3>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="w-4.5 h-4.5" /></button>
        </div>
        <div className="p-5">
          <p className="text-xs text-ink-400 mb-4">Choose a cloud storage provider to receive your automated backups. You'll be redirected to authorize access.</p>
          <div className="space-y-2">
            {cloudProviders.map((provider) => {
              const isConnected = connectedProviders.includes(provider.id);
              return (
                <button
                  key={provider.id}
                  onClick={() => !isConnected && onConnect(provider.id)}
                  disabled={isConnected}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    isConnected
                      ? 'border-ink-100 bg-ink-50/50 cursor-not-allowed opacity-60'
                      : 'border-ink-200 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg ${provider.bg} flex items-center justify-center shrink-0`}>
                    <Cloud className="w-5 h-5" style={{ color: provider.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-800">{provider.name}</p>
                    <p className="text-[11px] text-ink-400">
                      {isConnected ? 'Already connected' : 'Click to authorize and connect'}
                    </p>
                  </div>
                  {isConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-ink-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Schedule Modal (Cron + Retention config) ---------- */
function ScheduleModal({
  schedule,
  drives,
  onSave,
  onClose,
}: {
  schedule: BackupScheduleConfig | null;
  drives: { id: string; label: string; provider: CloudProvider }[];
  onSave: (config: BackupScheduleConfig) => void;
  onClose: () => void;
}) {
  const [database, setDatabase] = useState(schedule?.database ?? 'ecommerce_prod');
  const [driveId, setDriveId] = useState(schedule?.driveId ?? drives[0]?.id ?? '');
  const [frequency, setFrequency] = useState<BackupFrequency>(schedule?.frequency ?? 'daily');
  const [time, setTime] = useState(schedule?.time ?? '03:00');
  const [timezone, setTimezone] = useState(schedule?.timezone ?? 'UTC');
  const [cronExpression, setCronExpression] = useState(schedule?.cronExpression ?? '0 3 * * *');
  const [retentionCount, setRetentionCount] = useState(schedule?.retentionCount ?? 2);
  const [retentionUnit, setRetentionUnit] = useState<RetentionUnit>(schedule?.retentionUnit ?? 'backups');

  const handleFrequencyChange = (freq: BackupFrequency) => {
    setFrequency(freq);
    if (freq !== 'custom') {
      setCronExpression(frequencyToCron[freq]);
    }
  };

  const handleSave = () => {
    const config: BackupScheduleConfig = {
      id: schedule?.id ?? `bs${Date.now()}`,
      database,
      driveId,
      frequency,
      cronExpression,
      time,
      timezone,
      retentionCount,
      retentionUnit,
      enabled: schedule?.enabled ?? true,
      lastRun: schedule?.lastRun ?? '—',
      nextRun: schedule?.nextRun ?? '—',
      backupsKept: schedule?.backupsKept ?? 0,
    };
    onSave(config);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-ink-900">{schedule ? 'Edit Backup Schedule' : 'New Backup Schedule'}</h3>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="w-4.5 h-4.5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Database */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Database</label>
            <select value={database} onChange={(e) => setDatabase(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              {['ecommerce_prod', 'analytics', 'immobilier_tn', 'crm_system', 'data_warehouse', 'logging_db', 'staging_ecom'].map((db) => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
          </div>

          {/* Destination drive */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Destination Drive</label>
            <select value={driveId} onChange={(e) => setDriveId(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              {drives.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            {drives.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" /> No drives connected. Connect a cloud drive first.
              </p>
            )}
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Frequency</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { key: 'daily', label: 'Every day' },
                { key: 'every-2-days', label: 'Every 2 days' },
                { key: 'weekly', label: 'Every week' },
                { key: 'custom', label: 'Custom cron' },
              ] as { key: BackupFrequency; label: string }[]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => handleFrequencyChange(f.key)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    frequency === f.key
                      ? 'bg-blue-600 text-white shadow-soft'
                      : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time + Timezone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  if (frequency !== 'custom') {
                    const parts = cronExpression.split(' ');
                    parts[1] = e.target.value.split(':')[0];
                    parts[0] = e.target.value.split(':')[1];
                    setCronExpression(parts.join(' '));
                  }
                }}
                className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="UTC">UTC</option>
                <option value="UTC+01:00">UTC+01:00 (Tunis)</option>
                <option value="UTC+00:00">UTC+00:00 (London)</option>
                <option value="UTC-05:00">UTC-05:00 (New York)</option>
                <option value="UTC-08:00">UTC-08:00 (Los Angeles)</option>
              </select>
            </div>
          </div>

          {/* Cron expression */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">
              Cron Expression {frequency === 'custom' && <span className="text-blue-600">(editable)</span>}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1 bg-ink-900 rounded-lg px-3 py-2">
                <Repeat className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <input
                  type="text"
                  value={cronExpression}
                  onChange={(e) => setFrequency('custom')}
                  readOnly={frequency !== 'custom'}
                  className={`flex-1 bg-transparent font-mono text-sm text-emerald-400 focus:outline-none ${frequency !== 'custom' ? 'cursor-not-allowed' : ''}`}
                />
              </div>
            </div>
            <p className="text-[11px] text-ink-400 mt-1">
              Format: <span className="font-mono">minute hour day-of-month month day-of-week</span>
            </p>
          </div>

          {/* Retention policy */}
          <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-100">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-blue-600" />
              <label className="text-xs font-semibold text-ink-800">Retention Policy</label>
            </div>
            <p className="text-[11px] text-ink-500 mb-3">
              When a new backup completes, older backups beyond the limit are automatically deleted. For example, keeping 2 backups means only today's and yesterday's remain.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-600 shrink-0">Keep the last</span>
              <input
                type="number"
                min={1}
                max={100}
                value={retentionCount}
                onChange={(e) => setRetentionCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-sm bg-white border border-ink-200 rounded-lg px-2 py-1.5 text-center text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <select
                value={retentionUnit}
                onChange={(e) => setRetentionUnit(e.target.value as RetentionUnit)}
                className="text-sm bg-white border border-ink-200 rounded-lg px-3 py-1.5 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="backups">backups</option>
                <option value="days">days</option>
              </select>
            </div>

            {/* Visual retention preview */}
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-[10px] text-ink-400 shrink-0">Slots:</span>
              {Array.from({ length: Math.min(retentionCount, 10) }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded ${i === 0 ? 'bg-emerald-400' : i === 1 && retentionCount > 1 ? 'bg-emerald-300' : 'bg-ink-200'}`}
                  title={`Backup slot ${i + 1}`}
                />
              ))}
              {retentionCount > 10 && <span className="text-[10px] text-ink-400">+{retentionCount - 10} more</span>}
              <span className="text-[10px] text-ink-400 ml-2">
                {retentionCount === 2 ? 'Today + Yesterday' : `${retentionCount} backups kept`}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100 sticky bottom-0 bg-white">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={handleSave}>
            {schedule ? 'Save Changes' : 'Create Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}
