import { useState, useEffect, useCallback } from 'react';
import {
  HardDrive, Plus, Play, RotateCcw, Download, CheckCircle2, AlertCircle,
  Clock, Cloud, CloudUpload, Trash2, Link2, ChevronRight, X,
  Repeat, Shield, Info, Loader2, Server, Folder, Globe, FolderOpen,
} from 'lucide-react';
import { Card, CardHeader, Badge, Button, PageHeader } from '@/components/ui';
import {
  fetchConnections, fetchDrives, createDrive, updateDrive, deleteDrive,
  fetchBackupSchedules, createBackupSchedule, updateBackupSchedule, deleteBackupSchedule, runBackupSchedule,
  fetchBackups, runBackup, deleteBackup, restoreBackup, backupDownloadUrl,
  type DbConnection, type CloudDrive, type DriveProvider, type BackupSchedule, type ScheduleInput, type BackupRecord,
} from '@/lib/api';
import { formatBytes, formatDate, timeAgo } from '@/lib/format';

const providerIcon: Record<DriveProvider, typeof Server> = { google_drive: FolderOpen, local: Server, webdav: Globe, s3: Cloud };
const providerLabel: Record<DriveProvider, string> = { google_drive: 'Google Drive', local: 'Local folder', webdav: 'WebDAV', s3: 'S3-compatible' };

export function BackupsPage() {
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [drives, setDrives] = useState<CloudDrive[]>([]);
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, running: 0, bytes: 0, scheduled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDriveModal, setShowDriveModal] = useState<CloudDrive | null | false>(false);
  const [showScheduleModal, setShowScheduleModal] = useState<BackupSchedule | null | false>(false);
  const [showRestoreModal, setShowRestoreModal] = useState<BackupRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [c, d, s, b] = await Promise.all([fetchConnections(), fetchDrives(), fetchBackupSchedules(), fetchBackups()]);
      setConnections(c); setDrives(d.drives); setSchedules(s.schedules); setBackups(b.backups); setStats(b.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [load]);

  const statCards = [
    { label: 'Total Backups', value: stats.total, icon: HardDrive, color: 'blue' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'green' },
    { label: 'Scheduled', value: stats.scheduled, icon: Clock, color: 'amber' },
    { label: 'Failed', value: stats.failed, icon: AlertCircle, color: 'red' },
  ];
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100', green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100', red: 'bg-rose-50 text-rose-600 ring-rose-100',
  };

  const runNow = async (connectionId: string, driveId?: string | null) => {
    setBusyId(connectionId);
    try { await runBackup(connectionId, driveId); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to start backup'); }
    finally { setBusyId(null); }
  };

  const runSchedule = async (id: string) => {
    setBusyId(id);
    try { await runBackupSchedule(id); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to start backup'); }
    finally { setBusyId(null); }
  };

  const toggleSchedule = async (s: BackupSchedule) => {
    try { await updateBackupSchedule(s.id, { ...s, enabled: !s.enabled }); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to update schedule'); }
  };

  const removeSchedule = async (s: BackupSchedule) => {
    if (!window.confirm(`Delete the schedule for "${s.connection_name}"? Existing backups are kept.`)) return;
    try { await deleteBackupSchedule(s.id); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete schedule'); }
  };

  const removeBackup = async (b: BackupRecord) => {
    if (!window.confirm(`Delete backup "${b.filename}"? This cannot be undone.`)) return;
    try { await deleteBackup(b.id); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete backup'); }
  };

  const disconnectDrive = async (d: CloudDrive) => {
    if (!window.confirm(`Remove drive "${d.label}"? Backups already stored there are not deleted remotely.`)) return;
    try { await deleteDrive(d.id); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to remove drive'); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Backups"
        subtitle="Real backups of your connected databases, with cloud drive integration"
        actions={
          <>
            <Button variant="secondary" icon={<Cloud className="w-3.5 h-3.5" />} onClick={() => setShowDriveModal(null)}>Connect Drive</Button>
            <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowScheduleModal(null)} disabled={connections.length === 0}>New Schedule</Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4" hover>
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-lg ring-1 ring-inset flex items-center justify-center ${colorMap[s.color]}`}><s.icon className="w-4.5 h-4.5" strokeWidth={2.2} /></div>
              <span className="text-2xl font-bold text-ink-900 tabular-nums">{s.value}</span>
            </div>
            <p className="text-xs text-ink-400">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Manual backup */}
      <Card className="mb-5">
        <CardHeader title="Run a Backup Now" subtitle="Pick a database (and optionally a destination drive)" />
        <div className="p-4 flex flex-wrap gap-2">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center gap-1">
              <Button variant="secondary" size="sm" icon={busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                disabled={busyId === c.id} onClick={() => runNow(c.id)}>{c.name}</Button>
            </div>
          ))}
          {connections.length === 0 && <p className="text-sm text-ink-400">Connect a database first.</p>}
        </div>
      </Card>

      {/* Cloud Drive Integration */}
      <Card className="mb-5">
        <CardHeader title="Backup Destinations" subtitle="Local folder, WebDAV or S3-compatible storage" action={<Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowDriveModal(null)}>Add Destination</Button>} />
        <div className="divide-y divide-ink-50">
          {drives.map((drive) => {
            const Icon = providerIcon[drive.provider];
            const pct = drive.backups_bytes > 0 ? Math.min(100, (drive.backups_bytes / (1024 ** 3)) * 2) : 0;
            return (
              <div key={drive.id} className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50/40 transition-colors group">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${drive.connected ? 'bg-emerald-50' : 'bg-ink-100'}`}>
                  <Icon className={`w-5 h-5 ${drive.connected ? 'text-emerald-600' : 'text-ink-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-800">{drive.label}</span>
                    <Badge tone="slate">{providerLabel[drive.provider]}</Badge>
                    {drive.connected ? <Badge tone="green" dot>Connected</Badge> : <Badge tone="red">Unreachable</Badge>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-400 flex-wrap">
                    {drive.folder && <span className="flex items-center gap-1"><Folder className="w-3 h-3" />{drive.folder}</span>}
                    <span>{drive.backups_count} backup{drive.backups_count === 1 ? '' : 's'} · {formatBytes(drive.backups_bytes)}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last sync: {drive.last_sync_at ? timeAgo(drive.last_sync_at) : '—'}</span>
                  </div>
                  {drive.backups_bytes > 0 && <div className="mt-2 max-w-xs"><div className="h-1.5 bg-ink-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} /></div></div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors" title="Edit" onClick={() => setShowDriveModal(drive)}><CloudUpload className="w-4 h-4" /></button>
                  <button onClick={() => disconnectDrive(drive)} className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Remove"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
          {drives.length === 0 && <div className="py-10 text-center text-sm text-ink-400">No backup destination configured — backups stay on the DBHub server until you add one.</div>}
        </div>
      </Card>

      {/* Backup History */}
      <Card className="mb-5">
        <CardHeader title="Backup History" subtitle="Real dumps of your databases" />
        {loading ? <div className="py-14 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                  <th className="text-left font-medium px-5 py-2.5">Database</th>
                  <th className="text-right font-medium px-3 py-2.5">Size</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Time</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Destination</th>
                  <th className="text-right font-medium px-5 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs font-medium text-ink-800">{b.connection_name}</div>
                      <div className="text-[10px] text-ink-400 font-mono truncate max-w-[220px]">{b.filename}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-ink-600 tabular-nums">{formatBytes(b.size_bytes)}</td>
                    <td className="px-3 py-3">
                      {b.status === 'running' ? (
                        <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 border-2 border-ink-200 border-t-blue-600 rounded-full animate-spin" /><span className="text-xs text-blue-600">Running</span></div>
                      ) : (
                        <Badge tone={b.status === 'completed' ? 'green' : 'red'} dot={b.status === 'completed'}>{b.status}</Badge>
                      )}
                      {b.error && <p className="text-[10px] text-rose-600 mt-0.5 truncate max-w-[180px]" title={b.error}>{b.error}</p>}
                    </td>
                    <td className="px-3 py-3 text-ink-400 text-xs hidden md:table-cell">{formatDate(b.created_at)}</td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {b.drive_label ? (
                        <div className="flex items-center gap-1.5"><Cloud className="w-3.5 h-3.5 text-ink-400" /><span className="text-xs text-ink-500">{b.drive_label}</span></div>
                      ) : <span className="text-xs text-ink-400">Local only</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {b.status === 'completed' && (
                          <>
                            {b.downloadable && <a href={backupDownloadUrl(b.id)} className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Download"><Download className="w-3.5 h-3.5" /></a>}
                            <button className="p-1.5 text-ink-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Restore" onClick={() => setShowRestoreModal(b)}><RotateCcw className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                        {b.status !== 'running' && <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Delete" onClick={() => removeBackup(b)}><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {backups.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-400">No backups yet — run one above or set up a schedule below</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Schedules */}
      <Card>
        <CardHeader title="Backup Schedules" subtitle="Cron frequency and retention per database" action={<Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowScheduleModal(null)} disabled={connections.length === 0}>Add Schedule</Button>} />
        <div className="divide-y divide-ink-50">
          {schedules.map((s) => (
            <div key={s.id} className="px-5 py-4 hover:bg-ink-50/40 transition-colors group">
              <div className="flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full shrink-0 ${s.enabled ? 'bg-emerald-500 animate-pulse-dot' : 'bg-ink-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-medium text-ink-800">{s.connection_name}</span>
                    {s.enabled ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Disabled</Badge>}
                    {s.last_status && <Badge tone={s.last_status === 'completed' ? 'green' : 'red'}>{s.last_status === 'completed' ? 'Last run OK' : 'Last run failed'}</Badge>}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-ink-400 flex-wrap">
                    <span className="flex items-center gap-1" title="Cron expression"><Repeat className="w-3 h-3" /><code className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{s.cron_expression}</code></span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.timezone}</span>
                    {s.drive_label && <span className="flex items-center gap-1"><Cloud className="w-3 h-3" />{s.drive_label}</span>}
                    {s.next_run_at && <span>Next: {formatDate(s.next_run_at)}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Shield className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                    <span className="text-xs text-ink-500">
                      Keep last <span className="font-semibold text-ink-800">{s.retention_count}</span> {s.retention_unit === 'backups' ? 'backups' : 'days'}
                      <span className="text-ink-400"> · {s.backups_kept} kept</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Run now" disabled={busyId === s.id} onClick={() => runSchedule(s.id)}>
                    {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded" title="Edit" onClick={() => setShowScheduleModal(s)}><ChevronRight className="w-3.5 h-3.5" /></button>
                  <button className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded" title={s.enabled ? 'Disable' : 'Enable'} onClick={() => toggleSchedule(s)}>{s.enabled ? <Clock className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}</button>
                  <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Delete" onClick={() => removeSchedule(s)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
          {schedules.length === 0 && <div className="py-10 text-center text-sm text-ink-400">No schedule configured yet</div>}
        </div>
      </Card>

      {showDriveModal !== false && (
        <DriveModal existing={showDriveModal} onClose={() => setShowDriveModal(false)} onSaved={() => { setShowDriveModal(false); load(true); }} />
      )}
      {showScheduleModal !== false && (
        <ScheduleModal existing={showScheduleModal} connections={connections} drives={drives} onClose={() => setShowScheduleModal(false)} onSaved={() => { setShowScheduleModal(false); load(true); }} />
      )}
      {showRestoreModal && (
        <RestoreModal backup={showRestoreModal} connections={connections} onClose={() => setShowRestoreModal(null)} onDone={() => { setShowRestoreModal(null); load(true); }} />
      )}
    </div>
  );
}

/* ---------- Drive Modal ---------- */
function DriveModal({ existing, onClose, onSaved }: { existing: CloudDrive | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!existing;
  const [provider, setProvider] = useState<DriveProvider>(existing?.provider ?? 'local');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [folder, setFolder] = useState(existing?.folder ?? '');
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const c = existing?.config ?? {};
    return Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('has_')).map(([k, v]) => [k, String(v)]));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (k: string) => (v: string) => setConfig((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = existing ? await updateDrive(existing.id, { label, folder, config }) : await createDrive({ provider, label, folder, config });
      setResult(r.test);
      if (r.test.ok) onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2"><Cloud className="w-5 h-5 text-blue-600" /><h3 className="text-sm font-semibold text-ink-900">{editing ? 'Edit Destination' : 'Add Backup Destination'}</h3></div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          {!editing && (
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(['google_drive', 'local', 'webdav', 's3'] as const).map((p) => (
                  <button key={p} onClick={() => setProvider(p)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${provider === p ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}>{providerLabel[p]}</button>
                ))}
              </div>
            </div>
          )}

          <ProviderInstructions provider={provider} />
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Label</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={providerLabel[provider]} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>

          {provider === 'google_drive' && (
            <>
              <div>
                <label className="block text-xs font-medium text-ink-600 mb-1.5">Service account key (.json)</label>
                <textarea
                  value={config.serviceAccountJson ?? ''}
                  onChange={(e) => set('serviceAccountJson')(e.target.value)}
                  placeholder={editing ? 'Leave blank to keep current' : '{ "type": "service_account", "client_email": "…", "private_key": "…", … }'}
                  rows={4}
                  className="w-full text-xs bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-600 mb-1.5">Folder ID</label>
                <input type="text" value={config.folderId ?? ''} onChange={(e) => set('folderId')(e.target.value)} placeholder="1A2b3C4d5E6f7G8h9I0jKlMnOpQrStU" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
            </>
          )}
          {provider === 'local' && (
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Server folder</label>
              <input type="text" value={config.path ?? ''} onChange={(e) => set('path')(e.target.value)} placeholder="/data/backups" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <p className="text-[11px] text-ink-400 mt-1">A path inside the DBHub server / container. Mount it as a Docker volume to reach an external disk or NAS.</p>
            </div>
          )}
          {provider === 'webdav' && (
            <>
              <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Server URL</label><input type="text" value={config.url ?? ''} onChange={(e) => set('url')(e.target.value)} placeholder="https://cloud.example.com/remote.php/dav/files/me" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Username</label><input type="text" value={config.username ?? ''} onChange={(e) => set('username')(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Password</label><input type="password" value={config.password ?? ''} onChange={(e) => set('password')(e.target.value)} placeholder={editing ? 'Leave blank to keep current' : ''} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Folder</label><input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="DBHub/Backups" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
            </>
          )}
          {provider === 's3' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Bucket</label><input type="text" value={config.bucket ?? ''} onChange={(e) => set('bucket')(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Region</label><input type="text" value={config.region ?? 'us-east-1'} onChange={(e) => set('region')(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Endpoint (optional — leave blank for AWS)</label><input type="text" value={config.endpoint ?? ''} onChange={(e) => set('endpoint')(e.target.value)} placeholder="https://s3.us-west-002.backblazeb2.com" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Access Key ID</label><input type="text" value={config.accessKeyId ?? ''} onChange={(e) => set('accessKeyId')(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Secret Access Key</label><input type="password" value={config.secretAccessKey ?? ''} onChange={(e) => set('secretAccessKey')(e.target.value)} placeholder={editing ? 'Leave blank to keep current' : ''} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
              </div>
              <div><label className="block text-xs font-medium text-ink-600 mb-1.5">Prefix / folder (optional)</label><input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="dbhub-backups" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
            </>
          )}

          {result && (
            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${result.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
              {result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}<span>{result.message}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100 sticky bottom-0 bg-white">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} onClick={save}>{saving ? 'Testing…' : 'Save & Test'}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Provider setup instructions (shown inline in the modal) ---------- */
function ProviderInstructions({ provider }: { provider: DriveProvider }) {
  const steps: Record<DriveProvider, { title: string; items: string[] }> = {
    google_drive: {
      title: 'Your Google Drive, via a free Google Cloud service account',
      items: [
        'Go to console.cloud.google.com, create a project (or pick one), then open "APIs & Services → Library" and enable the "Google Drive API".',
        'Go to "APIs & Services → Credentials" → "Create Credentials" → "Service account". Give it any name and finish the wizard — no special roles are needed.',
        'Open the new service account → "Keys" tab → "Add Key" → "Create new key" → JSON. A .json file downloads — open it and paste its full contents below.',
        'In the file, find the "client_email" (looks like name@project.iam.gserviceaccount.com). In your actual Google Drive, create or open the folder for backups, click Share, and share it with that email as Editor.',
        'Folder ID: open that folder in Google Drive in your browser and copy the part of the URL after /folders/ (e.g. drive.google.com/drive/folders/THIS_PART).',
        'DBHub uploads and deletes a small test file in that folder to confirm access before saving.',
      ],
    },
    local: {
      title: 'A folder on the machine running DBHub',
      items: [
        'Enter a path that exists inside the DBHub server container (e.g. /data/backups) — not a path on your own computer.',
        'To keep backups on a real disk (not lost when the container is rebuilt), mount a volume to that path in docker-compose.yml: add "- /your/host/disk:/data/backups" under the dbhub-server service, then use /data/backups here.',
        'DBHub creates the folder automatically and writes a test file to confirm it can write to it.',
      ],
    },
    webdav: {
      title: 'Any WebDAV server — Nextcloud, ownCloud, Synology NAS…',
      items: [
        'Server URL: in Nextcloud/ownCloud, go to your profile → Settings, and copy the "WebDAV" URL shown at the bottom (looks like https://your-cloud.com/remote.php/dav/files/YOUR_USERNAME).',
        'Username / Password: your normal login, or an app password if you have two-factor authentication enabled (Nextcloud: Settings → Security → Create new app password).',
        'Folder: a subfolder to create under that account, e.g. DBHub/Backups — DBHub creates it automatically.',
        'DBHub uploads and immediately deletes a small test file to confirm write access before saving.',
      ],
    },
    s3: {
      title: 'AWS S3 or any S3-compatible storage',
      items: [
        'Works with AWS S3 and compatible services: Backblaze B2, Wasabi, Cloudflare R2, MinIO, DigitalOcean Spaces.',
        'Bucket: the bucket name only, not its URL (e.g. my-company-backups).',
        'Region: the bucket\'s region (AWS: e.g. us-east-1; for most other providers, check their docs — Backblaze B2 uses e.g. us-west-002).',
        'Endpoint: leave empty for AWS S3. For another provider, paste their S3 endpoint URL (e.g. https://s3.us-west-002.backblazeb2.com for B2, or your MinIO server\'s URL).',
        'Access Key ID / Secret Access Key: create these in your provider\'s console (AWS: IAM → Users → Security credentials → Create access key). The key needs permission to PutObject, GetObject and DeleteObject on the bucket.',
        'Prefix / folder: optional — objects are stored under this path inside the bucket.',
      ],
    },
  };
  const info = steps[provider];
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium mb-1">{info.title}</p>
        <ul className="space-y-1 list-disc list-inside marker:text-blue-400">
          {info.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Schedule Modal ---------- */
function ScheduleModal({ existing, connections, drives, onClose, onSaved }: {
  existing: BackupSchedule | null; connections: DbConnection[]; drives: CloudDrive[]; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!existing;
  const [connectionId, setConnectionId] = useState(existing?.connection_id ?? connections[0]?.id ?? '');
  const [driveId, setDriveId] = useState(existing?.drive_id ?? '');
  const [preset, setPreset] = useState<'daily' | 'every-2-days' | 'weekly' | 'custom'>(
    existing?.cron_expression === '0 3 * * *' ? 'daily' : existing?.cron_expression === '0 3 */2 * *' ? 'every-2-days' : existing?.cron_expression === '0 3 * * 0' ? 'weekly' : existing ? 'custom' : 'daily');
  const [cron, setCron] = useState(existing?.cron_expression ?? '0 3 * * *');
  const [timezone, setTimezone] = useState(existing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
  const [retentionCount, setRetentionCount] = useState(existing?.retention_count ?? 7);
  const [retentionUnit, setRetentionUnit] = useState<'backups' | 'days'>(existing?.retention_unit ?? 'backups');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preset === 'daily') setCron('0 3 * * *');
    else if (preset === 'every-2-days') setCron('0 3 */2 * *');
    else if (preset === 'weekly') setCron('0 3 * * 0');
  }, [preset]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const input: ScheduleInput = { connection_id: connectionId, drive_id: driveId || null, cron_expression: cron, timezone, retention_count: retentionCount, retention_unit: retentionUnit, enabled };
    try {
      if (existing) await updateBackupSchedule(existing.id, input); else await createBackupSchedule(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2"><Repeat className="w-5 h-5 text-blue-600" /><h3 className="text-sm font-semibold text-ink-900">{editing ? 'Edit Schedule' : 'New Backup Schedule'}</h3></div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Database</label>
            <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Destination</label>
            <select value={driveId} onChange={(e) => setDriveId(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">Local only (DBHub server)</option>
              {drives.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Frequency</label>
            <div className="grid grid-cols-4 gap-2">
              {(['daily', 'every-2-days', 'weekly', 'custom'] as const).map((p) => (
                <button key={p} onClick={() => setPreset(p)} className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${preset === p ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}>
                  {p === 'daily' ? 'Daily' : p === 'every-2-days' ? '2 days' : p === 'weekly' ? 'Weekly' : 'Custom'}
                </button>
              ))}
            </div>
          </div>
          {preset === 'custom' && (
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Cron expression</label>
              <input type="text" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 3 * * *" className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <p className="text-[11px] text-ink-400 mt-1">minute hour day-of-month month day-of-week</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Time zone</label>
            <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Retention</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500">Keep last</span>
              <input type="number" min={1} value={retentionCount} onChange={(e) => setRetentionCount(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-20 text-sm bg-white border border-ink-200 rounded-lg px-2 py-1.5 text-ink-700 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <select value={retentionUnit} onChange={(e) => setRetentionUnit(e.target.value as 'backups' | 'days')} className="text-sm bg-white border border-ink-200 rounded-lg px-2 py-1.5 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="backups">backups</option><option value="days">days</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-ink-300 text-blue-600 focus:ring-blue-500/20" /><span className="text-sm text-ink-600">Enabled</span></label>
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />DBHub checks schedules every 30 seconds and runs backups in the background, even with this dialog closed.</div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100 sticky bottom-0 bg-white">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !connectionId} icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} onClick={save}>{saving ? 'Saving…' : 'Save Schedule'}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Restore Modal ---------- */
function RestoreModal({ backup, connections, onClose, onDone }: { backup: BackupRecord; connections: DbConnection[]; onClose: () => void; onDone: () => void }) {
  const [targetId, setTargetId] = useState(backup.connection_id);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; executed: number; total: number; failed: number; errors: { statement: string; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = connections.find((c) => c.id === targetId);

  const run = async () => {
    setRunning(true);
    setError(null);
    try { setResult(await restoreBackup(backup.id, targetId)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Restore failed'); }
    finally { setRunning(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2"><RotateCcw className="w-5 h-5 text-emerald-600" /><h3 className="text-sm font-semibold text-ink-900">Restore Backup</h3></div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink-600 font-mono">{backup.filename}</p>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Restore into</label>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.database_name})</option>)}
            </select>
          </div>
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />This runs the dump's statements against <strong className="font-semibold">{target?.name}</strong> ({target?.database_name}). Existing tables with the same name are dropped and recreated.
          </div>
          {error && <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}
          {result && (
            <div className={`px-3 py-2.5 rounded-lg text-sm ${result.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
              {result.executed}/{result.total} statements executed{result.failed ? `, ${result.failed} failed` : ''}.
              {result.errors[0] && <p className="mt-1 text-xs font-mono opacity-80 truncate">{result.errors[0].error}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100">
          <Button variant="ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {!result?.success && (
            <Button variant="primary" disabled={running} icon={running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} onClick={run}>{running ? 'Restoring…' : 'Restore'}</Button>
          )}
          {result?.success && <Button variant="primary" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={onDone}>Done</Button>}
        </div>
      </div>
    </div>
  );
}
