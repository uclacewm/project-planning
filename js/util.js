// Small helpers shared by every view.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Dates are stored as 'YYYY-MM-DD' and handled as local dates (no time-zone shifts).
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
export function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

const MON = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDate(s, withYear = false) {
  const d = typeof s === 'string' ? parseDate(s) : s;
  if (!d) return '';
  return `${MON[d.getMonth()]} ${d.getDate()}${withYear ? ', ' + d.getFullYear() : ''}`;
}
export function fmtRange(a, b) {
  if (!a) return '';
  if (!b || a === b) return fmtDate(a);
  const da = parseDate(a), db = parseDate(b);
  if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) return `${fmtDate(da)}–${db.getDate()}`;
  return `${fmtDate(da)}–${fmtDate(db)}`;
}
export function fmtStamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  return `${fmtDate(d, true)}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

// Position of a date on a 12-month axis that starts at `start` (first of a month): 0..12
export function monthPos(start, d) {
  const months = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return months + (d.getDate() - 1) / dim;
}

export function byKey(arr, key = 'id') { const m = new Map(); for (const r of arr) m.set(r[key], r); return m; }
export function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''); }
export function uuid() { return crypto.randomUUID(); }
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
