import * as db from '../db.js';
import {
  TYPES, TYPE_ORDER, ui, esc, toKey, todayKey, addDays, mondayIndex, mondayOf, fmt,
  formatKm1, logSubtitle, byOrder, icon,
} from '../util.js';

export function dotsHtml(logs) {
  return `<span class="cal-dots">${logs.map(l => `<span class="dot t-${l.type}"></span>`).join('')}</span>`;
}

export function groupByDate(logs) {
  const map = new Map();
  for (const l of [...logs].sort(byOrder)) {
    if (!map.has(l.date)) map.set(l.date, []);
    map.get(l.date).push(l);
  }
  return map;
}

export default async function calendar(ctx) {
  const logs = await db.getAll('logs');
  if (!ctx.alive()) return;

  const today = new Date();
  if (!ui.calMonth) ui.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const month = ui.calMonth;
  const byDate = groupByDate(logs);
  const tKey = todayKey();

  // Month grid, Monday first, padded with the neighbouring months' days.
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = mondayIndex(first);
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const start = addDays(first, -lead);
  let grid = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < cells; i++) {
    const d = addDays(start, i);
    const key = toKey(d);
    const cls = ['cal-day'];
    if (d.getMonth() !== month.getMonth()) cls.push('other');
    if (key === tKey) cls.push('today');
    grid += `<a class="${cls.join(' ')}" href="#/day/${key}" aria-label="${fmt.long(d)}">
      <span class="cal-num">${d.getDate()}</span>${dotsHtml(byDate.get(key) || [])}</a>`;
  }

  // This week (Mon–Sun containing today).
  const wkStart = mondayOf(today);
  const wkEnd = addDays(wkStart, 6);
  const [ws, we] = [toKey(wkStart), toKey(wkEnd)];
  const weekLogs = logs.filter(l => l.date >= ws && l.date <= we);
  const strengthDays = new Set(weekLogs.filter(l => l.type === 'strength').map(l => l.date)).size;
  const runKm = weekLogs.filter(l => l.type === 'cardio' && l.activity === 'run').reduce((s, l) => s + (l.distanceKm || 0), 0);

  const todays = byDate.get(tKey) || [];

  ctx.app.innerHTML = `
    <header class="cal-head">
      <div>
        <div class="cal-year">${month.getFullYear()}</div>
        <h1 class="display cal-month">${fmt.month(month)}</h1>
      </div>
      <div class="cal-nav">
        <button class="icon-btn" data-nav="-1" aria-label="Previous month">${icon.prev}</button>
        <button class="icon-btn" data-nav="1" aria-label="Next month">${icon.next}</button>
      </div>
    </header>

    <div class="cal-grid">${grid}</div>

    <div class="legend">
      ${TYPE_ORDER.map(t => `<span><span class="dot t-${t}"></span>${TYPES[t].short}</span>`).join('')}
    </div>

    <section class="card week-card">
      <div class="week-head"><strong>This week</strong><span>${fmt.dayMonth(wkStart)} – ${fmt.dayMonth(wkEnd)}</span></div>
      <div class="stats">
        <div><div class="stat-val">${weekLogs.length}</div><div class="stat-label">workout${weekLogs.length === 1 ? '' : 's'}</div></div>
        <div><div class="stat-val">${strengthDays}</div><div class="stat-label">strength day${strengthDays === 1 ? '' : 's'}</div></div>
        <div><div class="stat-val">${formatKm1(runKm)}<small>km</small></div><div class="stat-label">run</div></div>
      </div>
    </section>

    <div class="today-head">
      <h2>Today<span>${fmt.short(today)}</span></h2>
      <a class="btn btn-accent" href="#/day/${tKey}/add">${icon.plus}Add</a>
    </div>
    <div class="stack">
      ${todays.length ? todays.map(l => `
        <a class="card row-link" href="#/log/${l.id}">
          <span class="dot lg t-${l.type}"></span>
          <span class="row-main">
            <div class="row-title">${esc(l.title)}</div>
            <div class="row-sub">${esc(logSubtitle(l))}</div>
          </span>
          ${icon.chevR}
        </a>`).join('') : `<div class="empty">Nothing logged yet today.</div>`}
    </div>
  `;

  ctx.app.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
    const step = Number(btn.dataset.nav);
    ui.calMonth = new Date(month.getFullYear(), month.getMonth() + step, 1);
    ctx.rerender();
  }));
}
