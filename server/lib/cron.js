/**
 * Minimal 5-field cron (minute hour day-of-month month day-of-week) supporting
 * `*`, lists (1,3), ranges (1-5) and steps (star/2, 1-10/3).  Evaluated in an IANA time zone.
 */
const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];

function parseField(src, [min, max], isDow) {
  const out = new Set();
  for (const part of src.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart === undefined ? 1 : parseInt(stepPart, 10);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step in "${src}"`);
    let lo, hi;
    if (rangePart === '*') { lo = min; hi = max; }
    else if (rangePart.includes('-')) { [lo, hi] = rangePart.split('-').map((n) => parseInt(n, 10)); }
    else { lo = parseInt(rangePart, 10); hi = stepPart === undefined ? lo : max; }
    if (![lo, hi].every(Number.isInteger) || lo < min || hi > (isDow ? 7 : max) || lo > hi) throw new Error(`Invalid value "${part}"`);
    for (let v = lo; v <= hi; v += step) out.add(isDow && v === 7 ? 0 : v);
  }
  return out;
}

export function parseCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('Cron expression must have 5 fields (minute hour day month weekday)');
  const [min, hour, dom, mon, dow] = parts.map((p, i) => parseField(p, RANGES[i], i === 4));
  return { min, hour, dom, mon, dow, domStar: parts[2] === '*', dowStar: parts[4] === '*' };
}

const fmtCache = new Map();
function partsIn(date, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minute: +o.minute, hour: +o.hour % 24, day: +o.day, month: +o.month, dow: dowMap[o.weekday] };
}

const dayMatches = (c, p) => {
  const domOk = c.dom.has(p.day);
  const dowOk = c.dow.has(p.dow);
  // classic cron: when both day fields are restricted, either may match
  if (!c.domStar && !c.dowStar) return domOk || dowOk;
  return domOk && dowOk;
};

/** Next run strictly after `from`, or null when none in the next ~2 years. */
export function nextRun(expr, tz = 'UTC', from = new Date()) {
  const c = parseCron(expr);
  let t = new Date(Math.floor(from.getTime() / 60000) * 60000 + 60000);
  const limit = from.getTime() + 2 * 366 * 86400000;
  while (t.getTime() < limit) {
    const p = partsIn(t, tz);
    if (!c.mon.has(p.month) || !dayMatches(c, p)) {           // skip to the next local midnight
      t = new Date(t.getTime() + ((23 - p.hour) * 60 + (60 - p.minute)) * 60000);
      continue;
    }
    if (!c.hour.has(p.hour)) {                                 // skip to the next hour
      t = new Date(t.getTime() + (60 - p.minute) * 60000);
      continue;
    }
    if (!c.min.has(p.minute)) { t = new Date(t.getTime() + 60000); continue; }
    return t;
  }
  return null;
}

export function validateTimezone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
