// Shared helpers: workout types, dates, durations, weights, history lookups.

export const TYPES = {
  strength: { label: 'Strength', short: 'Strength' },
  run: { label: 'Run', short: 'Run' },
  walk: { label: 'Walk', short: 'Walk' },
  mobility: { label: 'Mobility', short: 'Mobility' },
  class: { label: 'Workout Class', short: 'Class' },
};
export const TYPE_ORDER = ['strength', 'run', 'walk', 'mobility', 'class'];
export const isDistanceType = t => t === 'run' || t === 'walk';

// UI state that should survive moving between screens.
export const ui = { calMonth: null, addFilter: 'all', libFilter: 'all' };

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.flush = (...args) => { clearTimeout(t); return fn(...args); };
  return wrapped;
}

let toastTimer;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2400);
}

/* ---------- Dates (local time, stored as YYYY-MM-DD) ---------- */

const pad = n => String(n).padStart(2, '0');
export const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const todayKey = () => toKey(new Date());
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
export const mondayIndex = d => (d.getDay() + 6) % 7;
export const mondayOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -mondayIndex(d));

// Built by hand: browsers disagree on short month names ("Sep" vs "Sept").
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmt = {
  short: d => `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`, // Wed 30 Sep
  dayMonth: d => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`, // 30 Sep
  long: d => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`, // Wednesday 30 September
  full: d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, // 30 September 2026
  weekday: d => DAYS[d.getDay()],
  month: d => MONTHS[d.getMonth()],
};

/* ---------- Durations & pace ---------- */

// "28:45" -> 1725, "1:02:03" -> 3723. Returns null when incomplete.
export function parseDuration(str) {
  if (!str) return null;
  const parts = String(str).trim().split(':').map(p => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, ...nums];
  if (s >= 60 || (nums.length === 3 && m >= 60)) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

export function formatDuration(sec) {
  if (sec == null) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Typing on the iPhone number pad gives digits only; insert colons from the right.
export function digitsToTime(raw) {
  const d = String(raw).replace(/\D/g, '').replace(/^0+(?=\d{3})/, '').slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

export function paceOf(log) {
  if (!log || !(log.distanceKm > 0) || !(log.durationSec > 0)) return null;
  return log.durationSec / log.distanceKm;
}

// 6 -> "6.0", 5.25 -> "5.25"
export function formatKm(km) {
  if (km == null) return '';
  return (Math.round(km * 100) / 100).toFixed(2).replace(/0$/, '');
}
export const formatKm1 = km => (Math.round((km || 0) * 10) / 10).toFixed(1);

/* ---------- Weights (always stored in kg) ---------- */

const KG_PER_LB = 0.45359237;
let unit = 'kg';
export const getUnit = () => unit;
export const setUnitCache = u => { unit = u === 'lbs' ? 'lbs' : 'kg'; };

export function kgToDisplay(kg) {
  if (kg == null) return null;
  return unit === 'lbs' ? kg / KG_PER_LB : kg;
}
export function displayToKg(v) {
  if (v == null) return null;
  return unit === 'lbs' ? v * KG_PER_LB : v;
}
const trim1 = n => (Math.round(n * 10) / 10).toString();
// Weight number for display, without unit: 80, 12.5
export const fmtW = kg => (kg == null ? '' : trim1(kgToDisplay(kg)));
export const fmtWU = kg => `${fmtW(kg)} ${unit}`;
export function fmtVolume(kg) {
  return Math.round(kgToDisplay(kg) || 0).toLocaleString('en-GB');
}

export function parseNumber(str) {
  if (str == null) return null;
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ---------- Log history ---------- */

const orderKey = l => `${l.date}|${String(l.createdAt).padStart(15, '0')}`;
export const byOrder = (a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0);

// Logs of the same saved workout (and type) that come before `log`, newest first.
export function priorLogs(logs, log) {
  const key = orderKey(log);
  return logs
    .filter(l => l.id !== log.id && l.templateId === log.templateId && l.type === log.type && orderKey(l) < key)
    .sort(byOrder)
    .reverse();
}

export const normName = s => String(s || '').trim().toLowerCase();

const hasData = ex => ex && ex.sets.some(s => s.kg != null || s.reps != null);

// The most recent earlier time this exercise was done in this workout.
export function previousExercise(prior, name) {
  const n = normName(name);
  for (const l of prior) {
    const ex = (l.exercises || []).find(e => normName(e.name) === n);
    if (hasData(ex)) return { log: l, exercise: ex };
  }
  return null;
}

export function topKg(ex) {
  const ws = (ex?.sets || []).map(s => s.kg).filter(k => k != null && (k > 0));
  return ws.length ? Math.max(...ws) : null;
}

export function volumeKg(exercises) {
  let v = 0;
  for (const ex of exercises || []) for (const s of ex.sets) if (s.kg && s.reps) v += s.kg * s.reps;
  return v;
}

export const countedSets = ex => ex.sets.filter(s => s.kg != null || s.reps != null);

// { cls: 'up' | '', text } comparing top weights, or null if there's nothing to compare.
export function weightBadge(ex, prevEx, sameText = 'same') {
  const now = topKg(ex);
  const before = topKg(prevEx);
  if (now == null || before == null) return null;
  const diff = kgToDisplay(now) - kgToDisplay(before);
  if (Math.abs(diff) < 0.05) return { cls: '', text: sameText, dir: 0 };
  const amt = trim1(Math.abs(diff));
  return diff > 0
    ? { cls: 'up', text: `+${amt} ${unit}`, dir: 1 }
    : { cls: '', text: `−${amt} ${unit}`, dir: -1 };
}

export function logSubtitle(log) {
  const t = TYPES[log.type].short;
  if (log.type === 'strength') {
    const n = (log.exercises || []).length;
    return `${t} · ${n} exercise${n === 1 ? '' : 's'}`;
  }
  if (isDistanceType(log.type)) {
    const bits = [t];
    if (log.distanceKm) bits.push(`${formatKm(log.distanceKm)} km`);
    if (log.durationSec) bits.push(formatDuration(log.durationSec));
    return bits.join(' · ');
  }
  return log.durationMin ? `${t} · ${log.durationMin} min` : t;
}

/* ---------- Templates ---------- */

export function exerciseList(names, max = 3) {
  const short = { 'romanian deadlift': 'RDL' };
  const shown = names.slice(0, max).map(n => short[normName(n)] || n);
  const more = names.length - shown.length;
  return shown.join(', ') + (more > 0 ? ` +${more}` : '');
}

export function templateSummary(t) {
  const label = TYPES[t.type].short;
  switch (t.type) {
    case 'strength': {
      const names = (t.exercises || []).map(e => e.name);
      return names.length ? `${label} · ${exerciseList(names)}` : `${label} · No exercises yet`;
    }
    case 'run': return `${label} · Distance · time · pace`;
    case 'walk': return `${label} · Distance · time`;
    case 'mobility': {
      const n = (t.movements || []).length;
      return `${label} · Duration${n ? ` · ${n} movement${n === 1 ? '' : 's'}` : ''}`;
    }
    default: return `${label} · Duration · notes`;
  }
}

export function templateShortDesc(t) {
  if (t.type === 'strength') {
    const n = (t.exercises || []).length;
    return `${n} exercise${n === 1 ? '' : 's'}`;
  }
  if (isDistanceType(t.type)) return 'Distance + time';
  return t.durationMin ? `${t.durationMin} min` : 'Duration';
}

/* ---------- Icons ---------- */

export const icon = {
  chevR: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg>',
};

export const backLink = (href, label) =>
  `<a class="back-link" href="${href}">${icon.back}<span>${esc(label)}</span></a>`;

export function badgeHtml(b, arrows = true) {
  if (!b) return '';
  const arrow = !arrows ? '' : b.dir > 0 ? icon.up : b.dir < 0 ? icon.down : '';
  return `<span class="badge ${b.cls}">${arrow}${esc(b.text)}</span>`;
}
