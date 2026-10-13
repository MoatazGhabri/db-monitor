import { useState, useEffect, useCallback } from 'react';
import {
  HardDrive, Search, RefreshCw, Loader2, AlertCircle, AlertTriangle, CheckCircle2, XCircle,
  Sparkles, Trash2, Package, Box, Database as DatabaseIcon, FileText, History as HistoryIcon,
  ChevronRight, X, ShieldCheck, Eye, EyeOff, Info, HeartPulse, Layers,
} from 'lucide-react';
import { Card, CardHeader, Badge, Button, PageHeader } from '@/components/ui';
import { Gauge, DonutChart } from '@/components/charts';
import { formatBytes, formatDate, timeAgo } from '@/lib/format';
import {
  fetchServerStorage, analyzeServerStorage, fetchServerHealth, fetchServerOperations,
  fetchDockerSummary, fetchDockerImages, fetchDockerContainers, fetchDockerVolumes,
  cleanupDockerImages, cleanupDockerContainers, cleanupDockerBuildCache, cleanupDockerVolume, cleanupRecommended,
  fetchMysqlTopTables, fetchLogsSummary, cleanupLogs,
  type StorageOverview, type Recommendations, type DockerAnalyze, type DockerSummary, type MysqlSummary, type LogsSummary,
  type DockerImageInfo, type DockerContainerInfo, type DockerVolumeInfo, type MysqlTableInfo,
  type ServiceHealth, type ServerOperation,
} from '@/lib/api';

type Tab = 'overview' | 'docker' | 'mysql' | 'logs' | 'history';
const LEVEL_TONE: Record<string, 'green' | 'amber' | 'red'> = { ok: 'green', warning: 'amber', low: 'red', critical: 'red' };
const LEVEL_DOT = { ok: '🟢', warning: '🟡', low: '🔴', critical: '🚨' } as const;

export function ServerStoragePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [advanced, setAdvanced] = useState(false);
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<{ recommendations: Recommendations; docker: DockerAnalyze; mysql: MysqlSummary; mysqlTopTables: { available: boolean; tables?: MysqlTableInfo[] }; logs: LogsSummary } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<null | {
    title: string; bytes: number; keep?: string; danger?: boolean; run: () => Promise<{ freedBytes?: number; success?: boolean } | void>;
  }>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchServerStorage();
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load server storage');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const data = await analyzeServerStorage();
      setAnalysis(data);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "L'analyse a échoué");
    } finally {
      setAnalyzing(false);
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusyAction(confirm.title);
    try {
      const res = await confirm.run();
      setLastResult({ ok: true, message: res?.freedBytes !== undefined ? `Terminé — ${formatBytes(res.freedBytes)} libéré(s)` : 'Terminé' });
      setConfirm(null);
      await load();
      if (analysis) runAnalysis();
    } catch (err) {
      setLastResult({ ok: false, message: err instanceof Error ? err.message : "L'opération a échoué" });
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !overview) {
    return <div className="py-24 text-center animate-fade-in"><Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" /><p className="text-sm text-ink-400">Chargement…</p></div>;
  }

  const disk = overview?.disk;
  const level = disk?.level ?? 'ok';

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Serveur & Stockage"
        subtitle="Diagnostiquer l'espace disque et nettoyer en toute sécurité — sans commande"
        actions={
          <>
            <button
              onClick={() => setAdvanced((a) => !a)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${advanced ? 'bg-ink-800 text-white border-ink-800' : 'bg-white border-ink-200 text-ink-600 hover:bg-ink-50'}`}
              title="Affiche les identifiants techniques, chemins et détails bruts"
            >
              {advanced ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Mode avancé
            </button>
            <Button variant="secondary" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>Actualiser</Button>
          </>
        }
      />

      {error && <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
      {lastResult && (
        <div className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${lastResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
          {lastResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{lastResult.message}</span>
          <button onClick={() => setLastResult(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-ink-100 overflow-x-auto">
        {([
          { key: 'overview', label: 'Vue d\u2019ensemble', icon: HardDrive },
          { key: 'docker', label: 'Docker', icon: Package },
          { key: 'mysql', label: 'Base de données', icon: DatabaseIcon },
          { key: 'logs', label: 'Logs', icon: FileText },
          { key: 'history', label: 'Historique', icon: HistoryIcon },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-ink-400 hover:text-ink-700'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          overview={overview} level={level}
          analysis={analysis} analyzing={analyzing} analyzeError={analyzeError} onAnalyze={runAnalysis}
          onOpenConfirm={setConfirm} busyAction={busyAction} advanced={advanced}
        />
      )}
      {tab === 'docker' && <DockerTab advanced={advanced} onOpenConfirm={setConfirm} busyAction={busyAction} refreshKey={overview} />}
      {tab === 'mysql' && <MysqlTab advanced={advanced} />}
      {tab === 'logs' && <LogsTab advanced={advanced} onOpenConfirm={setConfirm} busyAction={busyAction} />}
      {tab === 'history' && <HistoryTab advanced={advanced} />}

      {confirm && (
        <ConfirmModal
          title={confirm.title} bytes={confirm.bytes} keep={confirm.keep} danger={confirm.danger}
          busy={busyAction === confirm.title}
          onCancel={() => setConfirm(null)} onConfirm={runConfirmed}
        />
      )}
    </div>
  );
}

/* ==================================================================================
 * Overview
 * ================================================================================== */
function OverviewTab({ overview, level, analysis, analyzing, analyzeError, onAnalyze, onOpenConfirm, busyAction, advanced }: {
  overview: StorageOverview | null; level: string;
  analysis: { recommendations: Recommendations; docker: DockerAnalyze; mysql: MysqlSummary; mysqlTopTables: { available: boolean; tables?: MysqlTableInfo[] }; logs: LogsSummary } | null;
  analyzing: boolean; analyzeError: string | null; onAnalyze: () => void;
  onOpenConfirm: (c: { title: string; bytes: number; keep?: string; danger?: boolean; run: () => Promise<{ freedBytes?: number } | void> }) => void;
  busyAction: string | null; advanced: boolean;
}) {
  const [health, setHealth] = useState<{ available: boolean; reason?: string; services: ServiceHealth[] } | null>(null);
  useEffect(() => { fetchServerHealth().then(setHealth).catch(() => {}); }, []);

  if (!overview) return null;
  const disk = overview.disk;
  const donutData = [
    overview.breakdown.docker !== null && { label: 'Docker', value: overview.breakdown.docker, color: '#2563eb' },
    overview.breakdown.mysql !== null && { label: 'Base de données', value: overview.breakdown.mysql, color: '#059669' },
    overview.breakdown.logs !== null && { label: 'Logs', value: overview.breakdown.logs, color: '#d97706' },
  ].filter(Boolean) as { label: string; value: number; color: string }[];
  const known = donutData.reduce((s, d) => s + d.value, 0);
  const other = Math.max(0, disk.used - known);
  if (other > 0) donutData.push({ label: 'Autres fichiers', value: other, color: '#94a3b8' });

  const rec = analysis?.recommendations;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Stockage serveur" subtitle={`${formatBytes(disk.total)} au total`} action={<Badge tone={LEVEL_TONE[level]} dot>{LEVEL_DOT[level as keyof typeof LEVEL_DOT]} {level === 'ok' ? 'Tout va bien' : level === 'warning' ? 'Attention' : level === 'low' ? 'Espace faible' : 'Critique'}</Badge>} />
        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <div className="flex justify-center">
            <Gauge value={disk.used} max={disk.total} label={`${disk.percent}%`} sublabel={`${formatBytes(disk.used)} utilisés`} color={disk.percent > 90 ? '#e11d48' : disk.percent > 70 ? '#d97706' : '#2563eb'} size={190} />
          </div>
          <div>
            {donutData.length > 0 ? (
              <DonutChart data={donutData} formatValue={(v) => formatBytes(v)} centerLabel={formatBytes(disk.used)} />
            ) : (
              <p className="text-sm text-ink-400">Répartition non disponible pour le moment.</p>
            )}
            <div className="mt-4 pt-4 border-t border-ink-100 grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-ink-400">Disponible</span><p className="font-semibold text-ink-800 text-sm">{formatBytes(disk.free)}</p></div>
              <div><span className="text-ink-400">Utilisé</span><p className="font-semibold text-ink-800 text-sm">{formatBytes(disk.used)}</p></div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col items-center gap-3 py-2">
        <Button variant="primary" size="md" icon={analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} onClick={onAnalyze} disabled={analyzing}>
          {analyzing ? 'Analyse en cours…' : '🔍 Analyser mon serveur'}
        </Button>
        {!overview.dockerAvailable && <p className="text-xs text-ink-400 text-center max-w-md">Docker n'est pas accessible depuis DBHub — certaines analyses seront limitées. Voir le mode avancé pour les détails de configuration.</p>}
      </div>

      {analyzeError && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700"><AlertCircle className="w-4 h-4 shrink-0" />{analyzeError}</div>}

      {rec && (
        <Card className="overflow-hidden">
          <div className={`px-5 py-4 ${level === 'ok' ? 'bg-emerald-50' : level === 'warning' ? 'bg-amber-50' : 'bg-rose-50'}`}>
            <p className="text-sm font-semibold text-ink-900">{LEVEL_DOT[level as keyof typeof LEVEL_DOT]} {rec.levelLabel}</p>
            <p className="text-sm text-ink-600 mt-1">
              Votre serveur utilise <strong>{disk.percent}%</strong> de son stockage ({formatBytes(disk.free)} disponibles).
              {rec.totalReclaimable > 0 && <> Nous avons identifié <strong>{formatBytes(rec.totalReclaimable)}</strong> pouvant être nettoyés sans toucher à vos données.</>}
            </p>
          </div>
          <div className="p-5">
            {rec.items.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-4">Rien à nettoyer pour le moment — tout est déjà propre.</p>
            ) : (
              <div className="space-y-3">
                {rec.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-ink-50">
                    <div className="flex items-center gap-2">
                      <span>🧹</span>
                      <span className="text-sm text-ink-700">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-ink-800 tabular-nums">~{formatBytes(item.bytes)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-medium text-ink-600">Total récupérable</span>
                  <span className="text-lg font-bold text-emerald-600">~{formatBytes(rec.totalReclaimable)}</span>
                </div>
                <Button
                  variant="primary" className="w-full justify-center mt-2" icon={<Sparkles className="w-4 h-4" />}
                  disabled={rec.totalReclaimable === 0 || busyAction !== null}
                  onClick={() => onOpenConfirm({
                    title: '✨ Nettoyage recommandé', bytes: rec.totalReclaimable,
                    keep: 'Les conteneurs actifs, leurs volumes de données, et vos bases MySQL sont conservés intégralement.',
                    run: () => cleanupRecommended(),
                  })}
                >
                  Nettoyer maintenant
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Santé des services" action={<HeartPulse className="w-4 h-4 text-rose-400" />} />
        <div className="p-2">
          {!health ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 text-ink-300 mx-auto animate-spin" /></div>
          ) : !health.available ? (
            <p className="px-3 py-6 text-center text-sm text-ink-400">{health.reason}</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {health.services.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span>{s.level === 'ok' ? '🟢' : s.level === 'warning' ? '🟡' : '🔴'}</span>
                  <span className="text-sm text-ink-700 flex-1">{s.name}</span>
                  <span className="text-xs text-ink-400">{s.level === 'ok' ? 'Fonctionnel' : s.level === 'warning' ? 'Attention' : 'Arrêté'}</span>
                  {advanced && <span className="text-[10px] font-mono text-ink-300 ml-2">{s.image}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ==================================================================================
 * Docker
 * ================================================================================== */
function DockerTab({ advanced, onOpenConfirm, busyAction }: {
  advanced: boolean;
  onOpenConfirm: (c: { title: string; bytes: number; keep?: string; danger?: boolean; run: () => Promise<{ freedBytes?: number; success?: boolean } | void> }) => void;
  busyAction: string | null; refreshKey: unknown;
}) {
  const [subTab, setSubTab] = useState<'images' | 'containers' | 'volumes'>('images');
  const [summary, setSummary] = useState<DockerSummary | null>(null);
  const [images, setImages] = useState<DockerImageInfo[] | null>(null);
  const [containers, setContainers] = useState<DockerContainerInfo[] | null>(null);
  const [volumes, setVolumes] = useState<DockerVolumeInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchDockerSummary(), fetchDockerImages(), fetchDockerContainers(), fetchDockerVolumes()])
      .then(([s, i, c, v]) => { setSummary(s); setImages(i.images); setContainers(c.containers); setVolumes(v.volumes); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Docker indisponible'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto animate-spin" /></div>;
  if (error) return (
    <Card><div className="p-8 text-center text-sm text-ink-500 flex flex-col items-center gap-2"><Box className="w-6 h-6 text-ink-300" />{error}</div></Card>
  );

  const unusedImages = (images ?? []).filter((i) => i.status !== 'used');
  const reclaimableImages = unusedImages.reduce((s, i) => s + i.size, 0);
  const stoppedContainers = (containers ?? []).filter((c) => c.state !== 'running');
  const reclaimableContainers = stoppedContainers.reduce((s, c) => s + (c.sizeRw ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {([['images', 'Images', Package], ['containers', 'Conteneurs', Box], ['volumes', 'Volumes', Layers]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setSubTab(key)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${subTab === key ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>Actualiser</Button>
      </div>

      {summary?.available && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4"><p className="text-xs text-ink-400 mb-1">Images</p><p className="text-lg font-bold text-ink-800">{formatBytes(summary.images?.totalBytes ?? 0)}</p><p className="text-[11px] text-ink-400 mt-0.5">{summary.images?.used} utilisées · {(summary.images?.dangling ?? 0) + (summary.images?.unusedTagged ?? 0)} inutilisées</p></Card>
          <Card className="p-4"><p className="text-xs text-ink-400 mb-1">Conteneurs</p><p className="text-lg font-bold text-ink-800">{summary.containers?.running} actifs</p><p className="text-[11px] text-ink-400 mt-0.5">{summary.containers?.stopped} arrêté(s)</p></Card>
          <Card className="p-4"><p className="text-xs text-ink-400 mb-1">Volumes</p><p className="text-lg font-bold text-ink-800">{formatBytes(summary.volumes?.totalBytes ?? 0)}</p><p className="text-[11px] text-ink-400 mt-0.5">{summary.volumes?.unused} non utilisé(s)</p></Card>
          <Card className="p-4">
            <p className="text-xs text-ink-400 mb-1">Cache de compilation</p>
            <p className="text-lg font-bold text-ink-800">{formatBytes(summary.buildCache?.reclaimableBytes ?? 0)}</p>
            <button
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium mt-0.5 disabled:opacity-40 disabled:pointer-events-none"
              disabled={!summary.buildCache?.reclaimableBytes || busyAction !== null}
              onClick={() => onOpenConfirm({
                title: 'Nettoyer le cache de compilation Docker', bytes: summary.buildCache?.reclaimableBytes ?? 0,
                keep: 'Le cache encore utilisé par une construction en cours n\u2019est pas supprimé.',
                run: () => cleanupDockerBuildCache(),
              })}
            >
              🧹 Nettoyer
            </button>
          </Card>
        </div>
      )}

      {subTab === 'images' && (
        <Card>
          <CardHeader
            title="Images Docker" subtitle={`${images?.length ?? 0} images · ${unusedImages.length} inutilisées`}
            action={
              <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} disabled={reclaimableImages === 0}
                onClick={() => onOpenConfirm({
                  title: 'Nettoyer les images inutilisées', bytes: reclaimableImages,
                  keep: 'Les images utilisées par un conteneur (actif ou arrêté) ne seront pas supprimées.',
                  run: () => cleanupDockerImages(false),
                })}
              >
                🧹 Nettoyer les images inutilisées
              </Button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                <th className="text-left font-medium px-5 py-2.5">Image</th>
                <th className="text-left font-medium px-3 py-2.5">Statut</th>
                <th className="text-right font-medium px-3 py-2.5">Taille</th>
                <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Créée</th>
                <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">Utilisée par</th>
              </tr></thead>
              <tbody>
                {(images ?? []).map((img) => (
                  <tr key={img.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-ink-800">{img.tags.length ? img.tags.join(', ') : '(sans étiquette)'}</span>
                      {advanced && <div className="text-[10px] font-mono text-ink-300">{img.id}</div>}
                    </td>
                    <td className="px-3 py-3"><Badge tone={img.status === 'used' ? 'green' : img.status === 'dangling' ? 'slate' : 'amber'}>{img.status === 'used' ? 'Utilisée' : img.status === 'dangling' ? 'Orpheline' : 'Inutilisée'}</Badge></td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-600">{formatBytes(img.size)}</td>
                    <td className="px-3 py-3 text-ink-400 text-xs hidden md:table-cell">{formatDate(img.created)}</td>
                    <td className="px-3 py-3 text-ink-500 text-xs hidden lg:table-cell">{img.containers.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'containers' && (
        <Card>
          <CardHeader
            title="Conteneurs arrêtés" subtitle={`${stoppedContainers.length} conteneur(s) arrêté(s) · ~${formatBytes(reclaimableContainers)} récupérables`}
            action={
              <Button variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} disabled={stoppedContainers.length === 0}
                onClick={() => onOpenConfirm({
                  title: 'Nettoyer les conteneurs arrêtés', bytes: reclaimableContainers,
                  keep: 'Les conteneurs en cours d\u2019exécution ne sont jamais touchés.',
                  run: () => cleanupDockerContainers(),
                })}
              >
                🧹 Nettoyer
              </Button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                <th className="text-left font-medium px-5 py-2.5">Nom</th>
                <th className="text-left font-medium px-3 py-2.5">État</th>
                <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Statut</th>
                <th className="text-right font-medium px-3 py-2.5">Taille</th>
              </tr></thead>
              <tbody>
                {(containers ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                    <td className="px-5 py-3">
                      <span className="text-ink-800 font-medium text-xs">{c.name}</span>
                      {advanced && <div className="text-[10px] font-mono text-ink-300">{c.id.slice(0, 12)} · {c.image}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {c.state === 'running' ? <Badge tone="green" dot>{c.health === 'unhealthy' ? 'Attention' : 'Actif'}</Badge> : <Badge tone="slate">Arrêté</Badge>}
                    </td>
                    <td className="px-3 py-3 text-ink-400 text-xs hidden md:table-cell">{c.status}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-600">{c.sizeRw !== null ? formatBytes(c.sizeRw) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'volumes' && (
        <div className="space-y-3">
          {(volumes ?? []).map((v) => (
            <Card key={v.name} className="p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${v.status === 'used' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <Layers className={`w-5 h-5 ${v.status === 'used' ? 'text-emerald-600' : 'text-amber-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-medium text-ink-800">{v.name}</p>
                <p className="text-xs text-ink-400 mt-0.5">
                  {v.size !== null ? formatBytes(v.size) : 'taille inconnue'} · {v.usedBy.length > 0 ? `Utilisé par : ${v.usedBy.join(', ')}` : 'Utilisé par : aucun conteneur'}
                </p>
              </div>
              {v.status === 'used' ? (
                <Badge tone="green" dot>Utilisé</Badge>
              ) : (
                <>
                  <Badge tone="amber">Non utilisé</Badge>
                  <Button
                    variant="danger" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => onOpenConfirm({
                      title: `Supprimer le volume "${v.name}"`, bytes: v.size ?? 0, danger: true,
                      keep: 'Ce volume ne contient les données d\u2019aucun conteneur actif — vérifiez que vous n\u2019en avez plus besoin avant de continuer.',
                      run: () => cleanupDockerVolume(v.name),
                    })}
                  >
                    Supprimer
                  </Button>
                </>
              )}
            </Card>
          ))}
          {(volumes ?? []).length === 0 && <Card><p className="p-8 text-center text-sm text-ink-400">Aucun volume Docker trouvé.</p></Card>}
        </div>
      )}
    </div>
  );
}

/* ==================================================================================
 * MySQL
 * ================================================================================== */
function MysqlTab({ advanced }: { advanced: boolean }) {
  const [tables, setTables] = useState<MysqlTableInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMysqlTopTables(15)
      .then((r) => { if (r.available) setTables(r.tables ?? []); else setError(r.errors?.[0] ?? 'Non disponible'); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto animate-spin" /></div>;

  const byDb = new Map<string, { bytes: number; tables: number }>();
  for (const t of tables ?? []) {
    const cur = byDb.get(t.database) ?? { bytes: 0, tables: 0 };
    cur.bytes += t.bytes; cur.tables += 1;
    byDb.set(t.database, cur);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Bases de données" subtitle="Espace utilisé par base" />
        {error ? <p className="p-6 text-center text-sm text-ink-400">{error}</p> : (
          <div className="divide-y divide-ink-50">
            {[...byDb.entries()].sort((a, b) => b[1].bytes - a[1].bytes).map(([name, v]) => (
              <div key={name} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-mono text-sm text-ink-800">{name}</span>
                  <span className="text-xs text-ink-400 ml-2">{v.tables} tables</span>
                </div>
                <span className="font-semibold text-ink-700 tabular-nums">{formatBytes(v.bytes)}</span>
              </div>
            ))}
            {byDb.size === 0 && <p className="px-5 py-8 text-center text-sm text-ink-400">Aucune base MySQL/MariaDB connectée</p>}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Tables les plus volumineuses" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
              <th className="text-left font-medium px-5 py-2.5">Table</th>
              {advanced && <th className="text-left font-medium px-3 py-2.5">Connexion</th>}
              <th className="text-right font-medium px-3 py-2.5">Taille</th>
              <th className="text-right font-medium px-3 py-2.5">Lignes</th>
            </tr></thead>
            <tbody>
              {(tables ?? []).map((t, i) => (
                <tr key={i} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                  <td className="px-5 py-3"><span className="font-mono text-xs text-ink-800">{t.database}.{t.table}</span></td>
                  {advanced && <td className="px-3 py-3 text-xs text-ink-400">{t.connection}</td>}
                  <td className="px-3 py-3 text-right tabular-nums text-ink-700 font-medium">{formatBytes(t.bytes)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-400">{t.rows.toLocaleString()}</td>
                </tr>
              ))}
              {(tables ?? []).length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-ink-400">Aucune table trouvée</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-ink-100 flex items-start gap-2 text-xs text-ink-400">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
          Aucune donnée MySQL n'est jamais supprimée automatiquement depuis cette page.
        </div>
      </Card>
    </div>
  );
}

/* ==================================================================================
 * Logs
 * ================================================================================== */
function LogsTab({ advanced, onOpenConfirm, busyAction }: {
  advanced: boolean;
  onOpenConfirm: (c: { title: string; bytes: number; keep?: string; run: () => Promise<{ freedBytes?: number } | void> }) => void;
  busyAction: string | null;
}) {
  const [summary, setSummary] = useState<LogsSummary | null>(null);
  const load = useCallback(() => { fetchLogsSummary().then(setSummary).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  if (!summary) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto animate-spin" /></div>;
  if (!summary.available) return <Card><div className="p-8 text-center text-sm text-ink-500">{summary.reason}</div></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Logs système" subtitle={`Taille totale : ${formatBytes(summary.totalBytes ?? 0)}`} action={<Badge tone={summary.level === 'ok' ? 'green' : 'amber'} dot>{summary.level === 'ok' ? 'Taille normale' : 'Volumineux'}</Badge>} />
        <div className="p-5">
          <p className="text-sm text-ink-600">
            {summary.rotatedFileCount ?? 0} fichier(s) déjà archivé(s) trouvé(s), représentant <strong>{formatBytes(summary.reclaimableBytes ?? 0)}</strong>.
            Les fichiers de logs actifs (en cours d'écriture) ne sont jamais supprimés.
          </p>
          <Button
            variant="danger" className="mt-4" icon={<Trash2 className="w-3.5 h-3.5" />} disabled={!summary.reclaimableBytes || busyAction !== null}
            onClick={() => onOpenConfirm({
              title: 'Nettoyer les anciens logs', bytes: summary.reclaimableBytes ?? 0,
              keep: 'Seuls les fichiers déjà archivés (tournés) sont supprimés — jamais le fichier de log actif.',
              run: async () => { const r = await cleanupLogs(); load(); return r; },
            })}
          >
            🧹 Nettoyer les anciens logs
          </Button>
        </div>
      </Card>

      {summary.topFiles && summary.topFiles.length > 0 && (
        <Card>
          <CardHeader title="Fichiers archivés" />
          <div className="divide-y divide-ink-50">
            {summary.topFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="font-mono text-xs text-ink-700">{advanced ? f.path : f.name}</span>
                <span className="text-ink-500 tabular-nums">{formatBytes(f.size)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ==================================================================================
 * History
 * ================================================================================== */
function HistoryTab({ advanced }: { advanced: boolean }) {
  const [ops, setOps] = useState<ServerOperation[] | null>(null);
  useEffect(() => { fetchServerOperations().then((r) => setOps(r.operations)).catch(() => setOps([])); }, []);

  if (!ops) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto animate-spin" /></div>;

  return (
    <Card>
      <CardHeader title="Historique des opérations" subtitle="Analyses et nettoyages effectués depuis DBHub" />
      <div className="divide-y divide-ink-50">
        {ops.map((op) => (
          <div key={op.id} className="px-5 py-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              {op.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : op.status === 'failed' ? <XCircle className="w-4 h-4 text-rose-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
              <span className="text-sm font-medium text-ink-800">{op.label}</span>
              <Badge tone={op.status === 'completed' ? 'green' : op.status === 'failed' ? 'red' : 'amber'}>{op.status === 'completed' ? 'Terminé' : op.status === 'failed' ? 'Échec' : 'Partiel'}</Badge>
              <span className="text-xs text-ink-400 ml-auto">{formatDate(op.created_at)}</span>
            </div>
            <div className="mt-1.5 text-xs text-ink-500 flex items-center gap-3 flex-wrap">
              {op.freed_bytes !== null && op.freed_bytes > 0 && <span>Espace libéré : <strong className="text-emerald-600">{formatBytes(op.freed_bytes)}</strong></span>}
              {op.detail && <span className="text-ink-400">{op.detail}</span>}
              {op.error && <span className="text-rose-600">{op.error}</span>}
              {advanced && <span className="text-ink-300 font-mono">{timeAgo(op.created_at)}</span>}
            </div>
          </div>
        ))}
        {ops.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-400">Aucune opération pour le moment</p>}
      </div>
    </Card>
  );
}

/* ==================================================================================
 * Confirmation modal — used for every destructive action
 * ================================================================================== */
function ConfirmModal({ title, bytes, keep, danger, busy, onCancel, onConfirm }: {
  title: string; bytes: number; keep?: string; danger?: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /><h3 className="text-sm font-semibold text-ink-900">Confirmation</h3></div>
          <button onClick={onCancel} className="text-ink-400 hover:text-ink-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-ink-700">Vous êtes sur le point d'exécuter :</p>
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100">
            <span className="text-xs text-blue-700">Espace récupérable</span>
            <span className="text-sm font-bold text-blue-800">~{formatBytes(bytes)}</span>
          </div>
          {keep && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />{keep}
            </div>
          )}
          {danger && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />Cette opération est irréversible.
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
          <Button variant={danger ? 'danger' : 'primary'} icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />} onClick={onConfirm} disabled={busy}>
            {busy ? 'En cours…' : danger ? 'Confirmer le nettoyage' : 'Continuer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
