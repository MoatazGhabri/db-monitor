import {
  LayoutDashboard, Database, Table2, Terminal, History, Users, ArrowUpDown,
  HardDrive, Activity, Settings, ChevronLeft, X,
} from 'lucide-react';
import type { PageKey } from '@/data/mockData';

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
        <div className="m-3 p-3 rounded-lg bg-ink-50 border border-ink-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
            <span className="text-xs font-medium text-ink-700">All Systems Operational</span>
          </div>
          <div className="text-[10px] text-ink-400">us-east-1 · v2.4.1</div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-ink-400">
            <span>Uptime 99.98%</span>
            <span>247 days</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Topbar({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-20 h-14 bg-white/80 backdrop-blur-md border-b border-ink-100 flex items-center gap-3 px-4 lg:px-6 shrink-0">
      <button onClick={onMenuClick} className="lg:hidden text-ink-500 hover:text-ink-800">
        <ChevronLeft className="w-5 h-5 rotate-180" />
      </button>
      <h2 className="text-sm font-semibold text-ink-900 hidden sm:block">{title}</h2>

      <div className="flex-1" />

      {/* Quick search */}
      <div className="relative hidden md:block">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search databases, tables…"
          className="pl-8 pr-12 py-1.5 text-sm bg-ink-50 border border-transparent rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-300 transition-all"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 bg-white border border-ink-200 rounded px-1.5 py-0.5">⌘K</kbd>
      </div>

      {/* Connection status */}
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
        <span className="text-xs font-medium text-emerald-700">18 connected</span>
      </div>

      {/* Notifications */}
      <button className="relative w-8 h-8 flex items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 transition-colors">
        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
      </button>

      {/* User avatar */}
      <div className="flex items-center gap-2 pl-2 border-l border-ink-100">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold">
          SC
        </div>
        <div className="hidden lg:block">
          <div className="text-xs font-medium text-ink-800">Sarah Chen</div>
          <div className="text-[10px] text-ink-400">Admin</div>
        </div>
      </div>
    </header>
  );
}
