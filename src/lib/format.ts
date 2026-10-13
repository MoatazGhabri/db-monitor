export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

/** MySQL returns "YYYY-MM-DD HH:MM:SS" (no timezone), ISO strings otherwise. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return 'never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Quote an SQL identifier for the given engine. */
export function quoteIdent(engine: string, name: string): string {
  return engine === 'postgresql'
    ? `"${name.replace(/"/g, '""')}"`
    : `\`${name.replace(/`/g, '``')}\``;
}

/** Fully qualified, quoted table reference. */
export function tableRef(engine: string, name: string, schema?: string): string {
  if (engine === 'postgresql') return `${quoteIdent(engine, schema || 'public')}.${quoteIdent(engine, name)}`;
  return quoteIdent(engine, name);
}
