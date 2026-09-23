import { useId } from 'react';

/* ---------- Area Chart (smooth) ---------- */
export function AreaChart({
  data,
  labels,
  color = '#2563eb',
  height = 120,
  showGrid = true,
  unit = '',
}: {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
  showGrid?: boolean;
  unit?: string;
}) {
  const id = useId();
  const w = 100;
  const h = 100;
  const max = Math.max(...data) * 1.15;
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return [x, y];
  });

  // Catmull-Rom to Bezier for smooth curve
  const path = pts
    .map((pt, i) => {
      if (i === 0) return `M ${pt[0]},${pt[1]}`;
      const p0 = pts[i - 1];
      const cx = (p0[0] + pt[0]) / 2;
      return `C ${cx},${p0[1]} ${cx},${pt[1]} ${pt[0]},${pt[1]}`;
    })
    .join(' ');
  const areaPath = `${path} L ${w},${h} L 0,${h} Z`;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showGrid && [25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2={w} y2={y} stroke="#eceef1" strokeWidth="0.3" />
        ))}
        <path d={areaPath} fill={`url(#area-${id})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="0.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {pts.map((pt, i) => (
          <circle key={i} cx={pt[0]} cy={pt[1]} r="0.8" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {labels && (
        <div className="flex justify-between mt-1 text-[10px] text-ink-400">
          {labels.filter((_, i) => i % Math.ceil(labels.length / 7) === 0).map((l, i) => (
            <span key={i}>{l}</span>
          ))}
          <span>{unit}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Line Chart (multi-series) ---------- */
export function MultiLineChart({
  series,
  labels,
  height = 160,
}: {
  series: { data: number[]; color: string; label: string }[];
  labels?: string[];
  height?: number;
}) {
  const w = 100;
  const h = 100;
  const allValues = series.flatMap((s) => s.data);
  const max = Math.max(...allValues) * 1.15;
  const min = 0;
  const range = max - min || 1;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2={w} y2={y} stroke="#eceef1" strokeWidth="0.3" />
        ))}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => [(i / (s.data.length - 1)) * w, h - ((v - min) / range) * h]);
          const path = pts
            .map((pt, i) => {
              if (i === 0) return `M ${pt[0]},${pt[1]}`;
              const p0 = pts[i - 1];
              const cx = (p0[0] + pt[0]) / 2;
              return `C ${cx},${p0[1]} ${cx},${pt[1]} ${pt[0]},${pt[1]}`;
            })
            .join(' ');
          return <path key={si} d={path} fill="none" stroke={s.color} strokeWidth="0.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      {labels && (
        <div className="flex justify-between mt-1 text-[10px] text-ink-400">
          {labels.filter((_, i) => i % Math.ceil(labels.length / 7) === 0).map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Gauge (donut) ---------- */
export function Gauge({
  value,
  max = 100,
  label,
  sublabel,
  color = '#2563eb',
  size = 140,
}: {
  value: number;
  max?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  size?: number;
}) {
  const pct = Math.min(value / max, 1);
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - pct);
  return (
    <div className="flex flex-col items-center justify-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#eceef1" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-ink-900">{label ?? `${Math.round(pct * 100)}%`}</span>
          {sublabel && <span className="text-[10px] text-ink-400 mt-0.5">{sublabel}</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Bar Chart ---------- */
export function BarChart({
  data,
  labels,
  color = '#2563eb',
  height = 120,
}: {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data) * 1.1;
  return (
    <div className="w-full" style={{ height }}>
      <div className="flex items-end justify-between gap-1 h-[calc(100%-16px)]">
        {data.map((v, i) => (
          <div key={i} className="flex-1 flex items-end justify-center group">
            <div
              className="w-full max-w-[24px] rounded-t-md transition-all duration-500 hover:opacity-80"
              style={{ height: `${(v / max) * 100}%`, background: color, minHeight: '2px' }}
            />
          </div>
        ))}
      </div>
      {labels && (
        <div className="flex justify-between mt-1 text-[10px] text-ink-400">
          {labels.map((l, i) => <span key={i} className="flex-1 text-center">{l}</span>)}
        </div>
      )}
    </div>
  );
}

/* ---------- Sparkline ---------- */
export function Sparkline({ data, color = '#2563eb', width = 80, height = 24 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, 100 - ((v - min) / range) * 100]);
  const path = pts.map((pt, i) => (i === 0 ? `M ${pt[0]},${pt[1]}` : `L ${pt[0]},${pt[1]}`)).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width, height }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------- Horizontal bar list ---------- */
export function BarList({
  items,
}: {
  items: { label: string; value: number; color: string; valueLabel?: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-ink-600 w-28 truncate shrink-0">{item.label}</span>
          <div className="flex-1 h-5 bg-ink-50 rounded-md overflow-hidden">
            <div
              className="h-full rounded-md transition-all duration-700"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color }}
            />
          </div>
          <span className="text-xs font-medium text-ink-700 w-16 text-right tabular-nums">{item.valueLabel ?? `${item.value} GB`}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Donut Chart ---------- */
export function DonutChart({
  data,
  size = 140,
  thickness = 18,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = 50 - thickness / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {data.map((d, i) => {
            const pct = d.value / total;
            const dash = pct * circ;
            const seg = (
              <circle
                key={i}
                cx="50" cy="50" r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-ink-900">{total.toFixed(0)}</span>
          <span className="text-[10px] text-ink-400">GB total</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="text-ink-600 truncate">{d.label}</span>
            <span className="text-ink-400 ml-auto tabular-nums">{d.value} GB</span>
          </div>
        ))}
      </div>
    </div>
  );
}
