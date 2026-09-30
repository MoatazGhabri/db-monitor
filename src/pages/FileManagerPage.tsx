import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder, File as FileIcon, FolderPlus, Upload, Download, Trash2, Pencil, Scissors, ClipboardPaste,
  ChevronRight, Home, RefreshCw, Loader2, AlertCircle, Lock, Save, X, Server, Box, HardDrive,
  Search, History as HistoryIcon, LogOut, ShieldAlert, FileWarning,
} from 'lucide-react';
import { Card, Button, PageHeader, EmptyState } from '@/components/ui';
import { formatBytes, formatDate } from '@/lib/format';
import {
  fetchFilesStatus, filesLogin, filesLogout, filesAuthenticated, filesSignOut,
  fetchFileRoots, fetchFileList, fetchFileRead, fileDownloadUrl, writeFileContent, uploadFile,
  createFolder, renameFileEntry, moveFileEntry, deleteFileEntry, fetchFileAudit,
  type FileRoot, type FileEntry, type FileAuditEntry,
} from '@/lib/api';

const rootIcon = (kind: FileRoot['kind']) => (kind === 'host' ? Server : kind === 'merged' ? Box : HardDrive);

export function FileManagerPage() {
  const [status, setStatus] = useState<{ configured: boolean; hostAvailable: boolean } | null>(null);
  const [authed, setAuthed] = useState(filesAuthenticated());
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => { fetchFilesStatus().then(setStatus).catch(() => setStatus({ configured: false, hostAvailable: false })).finally(() => setLoadingStatus(false)); }, []);

  if (loadingStatus) return <div className="py-24 text-center animate-fade-in"><Loader2 className="w-6 h-6 text-ink-300 mx-auto mb-2 animate-spin" /></div>;

  if (!status?.configured) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Gestionnaire de fichiers" subtitle="Fichiers du serveur et dossiers des conteneurs" />
        <Card><EmptyState icon={<ShieldAlert className="w-5 h-5" />} title="Fonctionnalité désactivée" subtitle="Définissez DBHUB_ADMIN_PASSWORD dans docker-compose.yml pour l'activer. C'est un accès complet au serveur : choisissez un mot de passe fort et dédié." /></Card>
      </div>
    );
  }

  if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />;

  return <FileBrowser onSignOut={() => { filesLogout().catch(() => {}); filesSignOut(); setAuthed(false); }} />;
}

/* ==================================================================================
 * Login
 * ================================================================================== */
function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try { await filesLogin(password); onSuccess(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Échec de connexion'); }
    finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Gestionnaire de fichiers" subtitle="Fichiers du serveur et dossiers des conteneurs" />
      <Card className="max-w-sm mx-auto mt-10">
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-3"><Lock className="w-6 h-6 text-amber-600" /></div>
          <h3 className="text-sm font-semibold text-ink-900 mb-1">Accès protégé</h3>
          <p className="text-xs text-ink-400 mb-4">Cette section donne un accès complet aux fichiers du serveur. Entrez le mot de passe dédié.</p>
          {error && <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 text-left"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="Mot de passe" autoFocus
            className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20 mb-3"
          />
          <Button variant="primary" className="w-full justify-center" disabled={!password || busy} icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} onClick={submit}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ==================================================================================
 * Browser
 * ================================================================================== */
type Clip = { root: string; path: string; name: string; cut: boolean } | null;

function FileBrowser({ onSignOut }: { onSignOut: () => void }) {
  const [roots, setRoots] = useState<FileRoot[]>([]);
  const [rootId, setRootId] = useState<string>('');
  const [curPath, setCurPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'browse' | 'audit'>('browse');
  const [clip, setClip] = useState<Clip>(null);
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<{ path: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; name: string; isDir: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRoots = useCallback(() => {
    fetchFileRoots().then((r) => {
      setRoots(r.roots);
      setRootId((cur) => cur || r.roots[0]?.id || '');
    }).catch((err) => setError(err instanceof Error ? err.message : 'Erreur'));
  }, []);
  useEffect(() => { loadRoots(); }, [loadRoots]);

  const load = useCallback(() => {
    if (!rootId) return;
    setLoading(true); setError(null);
    fetchFileList(rootId, curPath)
      .then((r) => setEntries(r.entries))
      .catch((err) => { setError(err instanceof Error ? err.message : 'Erreur'); setEntries([]); if ((err as { code?: string }).code === 'AUTH') onSignOut(); })
      .finally(() => setLoading(false));
  }, [rootId, curPath, onSignOut]);
  useEffect(() => { load(); }, [load]);

  const currentRoot = roots.find((r) => r.id === rootId);
  const crumbs = curPath.split('/').filter(Boolean);
  const goTo = (segments: string[]) => setCurPath(segments.length ? `/${segments.join('/')}` : '/');

  const withReload = async (fn: () => Promise<void>) => { await fn(); load(); };

  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Promise.all(Array.from(files).map((f) => uploadFile(rootId, curPath, f.name, f)))
      .then(load)
      .catch((err) => setError(err instanceof Error ? err.message : "Échec de l'envoi"));
  };

  const openEntry = async (entry: FileEntry) => {
    if (entry.isDir) { setCurPath(`${curPath.replace(/\/$/, '')}/${entry.name}`); return; }
    const path = `${curPath.replace(/\/$/, '')}/${entry.name}`;
    try {
      const r = await fetchFileRead(rootId, path);
      if (r.editable) setEditing({ path, name: entry.name });
      else window.open(fileDownloadUrl(rootId, path), '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d\u2019ouvrir ce fichier');
    }
  };

  const filtered = (entries ?? []).filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Gestionnaire de fichiers"
        subtitle="Fichiers du serveur et dossiers des conteneurs — accès complet"
        actions={<Button variant="secondary" icon={<LogOut className="w-3.5 h-3.5" />} onClick={onSignOut}>Se déconnecter</Button>}
      />

      <div className="flex items-start gap-2 px-3 py-2 mb-4 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">
        <FileWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Toute modification ou suppression ici agit directement sur le disque réel — aucune corbeille. Chaque action est journalisée dans l'onglet Journal.
      </div>

      <div className="flex items-center gap-1 mb-4">
        <button onClick={() => setTab('browse')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === 'browse' ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}><Folder className="w-3.5 h-3.5" />Parcourir</button>
        <button onClick={() => setTab('audit')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === 'audit' ? 'bg-blue-600 text-white shadow-soft' : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'}`}><HistoryIcon className="w-3.5 h-3.5" />Journal</button>
      </div>

      {tab === 'audit' ? <AuditTab /> : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Root selector */}
          <Card className="lg:col-span-1 p-2 h-fit">
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Emplacements</p>
            <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
              {roots.map((r) => {
                const Icon = rootIcon(r.kind);
                return (
                  <button key={r.id} onClick={() => { setRootId(r.id); setCurPath('/'); }} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-all ${rootId === r.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-ink-500 hover:bg-ink-50'}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{r.label}</span>
                  </button>
                );
              })}
              {roots.length === 0 && <p className="px-2 py-4 text-xs text-ink-400 text-center">Aucun emplacement disponible</p>}
            </div>
          </Card>

          {/* Browser */}
          <Card className="lg:col-span-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-4 py-3 border-b border-ink-100">
              <div className="flex items-center gap-1 text-xs overflow-x-auto flex-1 min-w-0">
                <button onClick={() => goTo([])} className="p-1 text-ink-400 hover:text-blue-600 shrink-0"><Home className="w-3.5 h-3.5" /></button>
                {crumbs.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-3 h-3 text-ink-300" />
                    <button onClick={() => goTo(crumbs.slice(0, i + 1))} className="text-ink-500 hover:text-blue-600 font-mono">{c}</button>
                  </span>
                ))}
              </div>
              <div className="relative shrink-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrer…" className="pl-7 pr-2 py-1.5 text-xs bg-ink-50 rounded-lg w-32 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-ink-50 flex-wrap">
              <Button variant="secondary" size="sm" icon={<FolderPlus className="w-3.5 h-3.5" />} onClick={() => setCreatingFolder(true)}>Nouveau dossier</Button>
              <Button variant="secondary" size="sm" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileInputRef.current?.click()}>Envoyer</Button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
              {clip && (
                <Button variant="secondary" size="sm" icon={<ClipboardPaste className="w-3.5 h-3.5" />} onClick={() => withReload(async () => {
                  await moveFileEntry(clip.root, clip.path, rootId, `${curPath.replace(/\/$/, '')}/${clip.name}`, !clip.cut);
                  setClip(null);
                })}>
                  Coller "{clip.name}"
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load}>Actualiser</Button>
            </div>

            {error && <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}

            {loading ? (
              <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-ink-100 text-xs text-ink-400 bg-ink-50/30">
                    <th className="text-left font-medium px-4 py-2">Nom</th>
                    <th className="text-right font-medium px-3 py-2">Taille</th>
                    <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Modifié</th>
                    <th className="text-right font-medium px-4 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.name} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40 group">
                        <td className="px-4 py-2.5 cursor-pointer" onClick={() => openEntry(e)}>
                          <div className="flex items-center gap-2">
                            {e.isDir ? <Folder className="w-4 h-4 text-blue-500 shrink-0" /> : <FileIcon className="w-4 h-4 text-ink-300 shrink-0" />}
                            <span className={`text-xs ${e.broken ? 'text-rose-400 line-through' : 'text-ink-700'}`}>{e.name}{e.isSymlink && <span className="text-ink-300"> →</span>}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-ink-400 tabular-nums">{e.isDir ? '—' : formatBytes(e.size ?? 0)}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-400 hidden md:table-cell">{formatDate(e.mtime)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!e.isDir && <button className="p-1.5 text-ink-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Télécharger" onClick={() => window.open(fileDownloadUrl(rootId, `${curPath.replace(/\/$/, '')}/${e.name}`), '_blank')}><Download className="w-3.5 h-3.5" /></button>}
                            <button className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded" title="Renommer" onClick={() => setRenaming({ path: `${curPath.replace(/\/$/, '')}/${e.name}`, name: e.name })}><Pencil className="w-3.5 h-3.5" /></button>
                            <button className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded" title="Couper (déplacer)" onClick={() => setClip({ root: rootId, path: `${curPath.replace(/\/$/, '')}/${e.name}`, name: e.name, cut: true })}><Scissors className="w-3.5 h-3.5" /></button>
                            <button className="p-1.5 text-ink-400 hover:text-rose-600 hover:bg-rose-50 rounded" title="Supprimer" onClick={() => setConfirmDelete({ path: `${curPath.replace(/\/$/, '')}/${e.name}`, name: e.name, isDir: e.isDir })}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && <div className="py-14 text-center text-sm text-ink-400">{search ? 'Aucun résultat' : 'Dossier vide'}</div>}
              </div>
            )}
          </Card>
        </div>
      )}

      {editing && (
        <EditorModal
          root={rootId} path={editing.path} name={editing.name}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {renaming && (
        <RenameModal
          name={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={(newName) => withReload(async () => { await renameFileEntry(rootId, renaming.path, newName); setRenaming(null); })}
        />
      )}
      {creatingFolder && (
        <RenameModal
          title="Nouveau dossier" name="" placeholder="nom-du-dossier"
          onClose={() => setCreatingFolder(false)}
          onSave={(name) => withReload(async () => { await createFolder(rootId, curPath, name); setCreatingFolder(false); })}
        />
      )}
      {confirmDelete && (
        <DeleteModal
          name={confirmDelete.name} isDir={confirmDelete.isDir}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => withReload(async () => { await deleteFileEntry(rootId, confirmDelete.path); setConfirmDelete(null); })}
        />
      )}
      {!currentRoot && roots.length > 0 && null}
    </div>
  );
}

/* ==================================================================================
 * Editor / Rename / Delete modals
 * ================================================================================== */
function EditorModal({ root, path, name, onClose, onSaved }: { root: string; path: string; name: string; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);

  useEffect(() => {
    fetchFileRead(root, path).then((r) => {
      if (r.editable) setContent(r.content ?? '');
      else setReadOnlyReason(r.reason ?? 'Non éditable');
    }).catch((err) => setError(err instanceof Error ? err.message : 'Erreur')).finally(() => setLoading(false));
  }, [root, path]);

  const save = async () => {
    setSaving(true); setError(null);
    try { await writeFileContent(root, path, content); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Échec de l\u2019enregistrement'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-3xl max-h-[85vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 shrink-0">
          <span className="text-sm font-mono font-medium text-ink-800 truncate">{name}</span>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-0">
          {loading ? <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto animate-spin" /></div>
            : readOnlyReason ? <p className="p-8 text-center text-sm text-ink-400">{readOnlyReason}</p>
            : (
              <textarea
                value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false}
                className="w-full h-[55vh] p-4 text-xs font-mono text-ink-800 focus:outline-none resize-none"
              />
            )}
        </div>
        {error && <div className="mx-5 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-100 shrink-0">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          {!readOnlyReason && <Button variant="primary" disabled={saving} icon={saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>}
        </div>
      </div>
    </div>
  );
}

function RenameModal({ title = 'Renommer', name, placeholder, onClose, onSave }: { title?: string; name: string; placeholder?: string; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(name);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-sm animate-slide-up">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-ink-900 mb-3">{title}</h3>
          <input
            autoFocus value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onSave(value.trim()); }}
            placeholder={placeholder} className="w-full text-sm bg-white border border-ink-200 rounded-lg px-3 py-2 text-ink-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={() => onSave(value.trim())}>Valider</Button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ name, isDir, onCancel, onConfirm }: { name: string; isDir: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-pop w-full max-w-sm animate-slide-up">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-ink-900 mb-2">Supprimer {isDir ? 'ce dossier' : 'ce fichier'} ?</h3>
          <p className="text-sm text-ink-600 font-mono">{name}</p>
          <p className="text-xs text-rose-600 mt-3">Cette action est irréversible — il n'y a pas de corbeille.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
          <Button variant="danger" disabled={busy} icon={busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} onClick={async () => { setBusy(true); await onConfirm(); }}>
            {busy ? 'Suppression…' : 'Supprimer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================================
 * Audit
 * ================================================================================== */
function AuditTab() {
  const [entries, setEntries] = useState<FileAuditEntry[] | null>(null);
  useEffect(() => { fetchFileAudit(150).then((r) => setEntries(r.entries)).catch(() => setEntries([])); }, []);
  if (!entries) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-ink-300 mx-auto animate-spin" /></div>;
  return (
    <Card>
      <div className="divide-y divide-ink-50">
        {entries.map((e) => (
          <div key={e.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
            <span className={`px-1.5 py-0.5 rounded font-medium ${e.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{e.action}</span>
            <span className="font-mono text-ink-500 truncate flex-1">{e.root}{e.path}</span>
            {e.detail && <span className="text-ink-400 truncate max-w-xs">{e.detail}</span>}
            <span className="text-ink-300 shrink-0">{formatDate(e.created_at)}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-400">Aucune activité pour le moment</p>}
      </div>
    </Card>
  );
}
