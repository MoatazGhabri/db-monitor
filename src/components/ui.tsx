import type { ReactNode } from 'react';

/* ---------- Card ---------- */
export function Card({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
      className={`bg-white rounded-xl border border-ink-100 shadow-soft ${hover ? 'transition-all duration-200 hover:shadow-lift hover:border-ink-200' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-ink-100">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
type BadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'cyan' | 'violet';

const badgeTones: Record<BadgeTone, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-ink-100 text-ink-600 ring-ink-200',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ children, tone = 'slate', dot = false }: { children: ReactNode; tone?: BadgeTone; dot?: boolean }) {
  const dotColors: Record<BadgeTone, string> = {
    blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500',
    red: 'bg-rose-500', slate: 'bg-ink-400', cyan: 'bg-cyan-500', violet: 'bg-violet-500',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[tone]} ${tone === 'green' || tone === 'amber' ? 'animate-pulse-dot' : ''}`} />}
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'Online': case 'Active': case 'Completed': return 'green';
    case 'Syncing': case 'In Progress': case 'Invited': case 'Scheduled': return 'amber';
    case 'Offline': case 'Suspended': case 'Failed': case 'error': return 'red';
    case 'Maintenance': return 'slate';
    default: return 'slate';
  }
}

/* ---------- Button ---------- */
type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
};

export function Button({ children, variant = 'secondary', size = 'md', icon, onClick, className = '', disabled = false, title }: ButtonProps) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-soft',
    secondary: 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50 hover:border-ink-300',
    ghost: 'text-ink-600 hover:bg-ink-100',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ initials, color, size = 32 }: { initials: string; color: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-semibold shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

/* ---------- Progress bar ---------- */
export function Progress({ value, tone = 'blue' }: { value: number; tone?: string }) {
  const toneMap: Record<string, string> = {
    blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500',
  };
  return (
    <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${toneMap[tone] || toneMap.blue} transition-all duration-500`} style={{ width: `${value}%` }} />
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-ink-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-400 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Search input ---------- */
export function SearchInput({ placeholder = 'Search…', value, onChange }: { placeholder?: string; value?: string; onChange?: (v: string) => void }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-3 py-1.5 text-sm bg-white border border-ink-200 rounded-lg w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
      />
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="w-12 h-12 rounded-xl bg-ink-100 flex items-center justify-center text-ink-400 mb-3">{icon}</div>}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {subtitle && <p className="text-xs text-ink-400 mt-1">{subtitle}</p>}
    </div>
  );
}
