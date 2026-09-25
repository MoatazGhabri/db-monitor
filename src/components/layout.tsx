import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard, Database, Table2, Terminal, History, Users, ArrowUpDown,
  HardDrive, Activity, Settings, ChevronLeft, X, Search, Bell, AlertTriangle, AlertCircle, Loader2,
} from 'lucide-react';
import type { PageKey } from '@/lib/types';
import { fetchStatus, fetchAlerts, searchPlatform, type PlatformStatus, type Alert, type SearchResult } from '@/lib/api';
import { timeAgo } from '@/lib/format';

const navItems: { key: PageKey; label: string; icon: typeof Database; group: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { key: 'databases', label: 'Databases', icon: Database, group: 'Overview' },
  { key: 'tables', label: 'Tables', icon: Table2, group: 'Overview' },
  { key: 'sql-editor', label: 'SQL Editor', icon: Terminal, group: 'Tools' },
  { key: 'query-history', label: 'Query History', icon: History, group: 'Tools' },
  { key: 'import-export', label: 'Import / Export', icon: ArrowUpDown, group: 'Tools' },
  { key: 'users', label: 'Users & Permissions', icon: Users, group: 'Management' },
  { key: 'backups', label: 'Backups', icon: HardDrive, group: 'Management' },
  { key: 'monitoring', label: 'Monitoring', icon: Activity, group: 'Management' },
  { key: 'settings', label: 'Settings', icon: Settings, group: 'Management' },
];

const isPageKey = (p: string): p is PageKey => navItems.some((n) => n.key === p);

export function Sidebar({
  current,
  onNavigate,
  open,
  onClose,
}: {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  open: boolean;
  onClose: () => void;
}) {
  const groups = ['Overview', 'Tools', 'Management'];
  const [status, setStatus] = useState<PlatformStatus | null>(null);

  useEffect(() => {
    const load = () => fetchStatus().then(setStatus).catch(() => setStatus(null));
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const uptimeDays = status ? Math.floor(status.uptimeSec / 86400) : 0;
  const uptimeLabel = status ? (uptimeDays > 0 ? `${uptimeDays}d` : `${Math.floor(status.uptimeSec / 3600)}h`) : '—';
  const healthColor = status?.health === 'operational' ? 'bg-emerald-500' : status?.health === 'warning' ? 'bg-amber-500' : 'bg-rose-500';
  const healthText = status?.health === 'operational' ? 'All Systems Operational' : status?.health === 'warning' ? 'Minor issues detected' : status?.health === 'degraded' ? 'Attention needed' : 'Connecting…';

  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-ink-950/40 z-30 lg:hidden animate-fade-in" onClick={onClose} />}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-60 bg-white border-r border-ink-100 flex flex-col shrink-0 transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-ink-100 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-soft">
            <Database className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <span className="text-sm font-bold text-ink-900 tracking-tight">DBHub</span>
            <span className="block text-[10px] text-ink-400 -mt-0.5">Admin Platform</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-ink-400 hover:text-ink-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{group}</p>
              <div className="space-y-0.5">
                {navItems.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon;
                  const active = current === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => onNavigate(item.key)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                        active
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600' : ''}`} strokeWidth={active ? 2.4 : 2} />
                      <span className="truncate">{item.label}</span>
                      {active && <span className="ml-auto w-1 h-4 rounded-full bg-blue-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Server status */}
        <button onClick={() => onNavigate('monitoring')} className="m-3 p-3 rounded-lg bg-ink-50 border border-ink-100 text-left hover:bg-ink-100/70 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full animate-pulse-dot ${healthColor}`} />
            <span className="text-xs font-medium text-ink-700">{healthText}</span>
          </div>
          <div className="text-[10px] text-ink-400">{status?.hostname ?? '—'} · v{status?.version ?? '—'}</div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-ink-400">
            <span>{status ? `${status.online}/${status.total} online` : '—'}</span>
            <span>Uptime {uptimeLabel}</span>
          </div>
        </button>
      </aside>
    </>
  );
}

export function Topbar({ title, onMenuClick, onNavigate }: { title: string; onMenuClick: () => void; onNavigate: (page: PageKey) => void }) {
  const [profileName, setProfileName] = useState('Administrator');
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ databases: [], tables: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const alertBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => { fetchStatus().then((s) => { setStatus(s); setProfileName(s.profile.name); }).catch(() => {}); fetchAlerts().then((r) => setAlerts(r.alerts)).catch(() => {}); };
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (alertBoxRef.current && !alertBoxRef.current.contains(e.target as Node)) setAlertsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults({ databases: [], tables: [] }); setSearching(false); return; }
    setSearching(true);
    searchPlatform(q).then(setResults).catch(() => setResults({ databases: [], tables: [] })).finally(() => setSearching(false));
  }, []);

  useEffect(() => { const t = setTimeout(() => runSearch(query), 200); return () => clearTimeout(t); }, [query, runSearch]);

  const goTo = (page: string) => { if (isPageKey(page)) onNavigate(page); setSearchOpen(false); setAlertsOpen(false); };
  const hasResults = results.databases.length > 0 || results.tables.length > 0;
  const initials = profileName.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';

  return (
    <header className="sticky top-0 z-20 h-14 bg-white/80 backdrop-blur-md border-b border-ink-100 flex items-center gap-3 px-4 lg:px-6 shrink-0">
      <button onClick={onMenuClick} className="lg:hidden text-ink-500 hover:text-ink-800">
        <ChevronLeft className="w-5 h-5 rotate-180" />
      </button>
      <h2 className="text-sm font-semibold text-ink-900 hidden sm:block">{title}</h2>

      <div className="flex-1" />

      {/* Quick search */}
      <div className="relative hidden md:block" ref={searchBoxRef}>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search databases, tables…"
          className="pl-8 pr-12 py-1.5 text-sm bg-ink-50 border border-transparent rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-300 transition-all"
        />
        {!query && <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 bg-white border border-ink-200 rounded px-1.5 py-0.5">⌘K</kbd>}

        {searchOpen && query && (
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-pop border border-ink-100 overflow-hidden animate-fade-in max-h-96 overflow-y-auto">
            {searching ? (
              <div className="py-8 text-center"><Loader2 className="w-4 h-4 text-ink-300 mx-auto animate-spin" /></div>
            ) : hasResults ? (
              <>
                {results.databases.length > 0 && (
                  <div className="py-1.5">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Databases</p>
                    {results.databases.map((d) => (
                      <button key={d.id} onClick={() => goTo('databases')} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ink-50 transition-colors">
                        <Database className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-xs font-mono text-ink-700 truncate">{d.name}</span>
                        <span className={`ml-auto w-1.5 h-1.5 rounded-full ${d.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      </button>
                    ))}
                  </div>
                )}
                {results.tables.length > 0 && (
                  <div className="py-1.5 border-t border-ink-50">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Tables</p>
                    {results.tables.map((t, i) => (
                      <button key={i} onClick={() => goTo('tables')} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ink-50 transition-colors">
                        <Table2 className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                        <span className="text-xs font-mono text-ink-700 truncate">{t.name}</span>
                        <span className="ml-auto text-[10px] text-ink-400">{t.connection_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="px-3 py-6 text-center text-xs text-ink-400">No matches</p>
            )}
          </div>
        )}
      </div>

      {/* Connection status */}
      <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${status && status.online < status.total ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
        <span className={`w-1.5 h-1.5 rounded-full animate-pulse-dot ${status && status.online < status.total ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span className={`text-xs font-medium ${status && status.online < status.total ? 'text-amber-700' : 'text-emerald-700'}`}>{status ? `${status.online} connected` : '—'}</span>
      </div>

      {/* Notifications */}
      <div className="relative" ref={alertBoxRef}>
        <button onClick={() => setAlertsOpen((o) => !o)} className="relative w-8 h-8 flex items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 transition-colors">
          <Bell className="w-4.5 h-4.5" />
          {alerts.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />}
        </button>
        {alertsOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-pop border border-ink-100 overflow-hidden animate-fade-in max-h-96 overflow-y-auto">
            <p className="px-3 py-2 text-xs font-semibold text-ink-700 border-b border-ink-50">Alerts</p>
            {alerts.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-ink-400">Nothing to report</p>
            ) : alerts.map((a) => (
              <button key={a.id} onClick={() => goTo(a.page)} className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-ink-50 transition-colors border-b border-ink-50 last:border-0">
                {a.level === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-800 truncate">{a.title}</p>
                  {a.detail && <p className="text-[11px] text-ink-400 truncate">{a.detail}</p>}
                  <p className="text-[10px] text-ink-300 mt-0.5">{timeAgo(a.at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User avatar */}
      <button onClick={() => onNavigate('settings')} className="flex items-center gap-2 pl-2 border-l border-ink-100">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold">
          {initials}
        </div>
        <div className="hidden lg:block text-left">
          <div className="text-xs font-medium text-ink-800">{profileName}</div>
          <div className="text-[10px] text-ink-400">{status?.profile.role ?? 'Admin'}</div>
        </div>
      </button>
    </header>
  );
}
