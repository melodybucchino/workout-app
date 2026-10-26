import * as db from '../db.js';
import {
  TYPES, TYPE_ORDER, ui, esc, toKey, fromKey, todayKey, addDays, mondayIndex, mondayOf, fmt,
  formatKm1, fmtCount, logSubtitle, byOrder, badgeHtml, weekRange, volumeKg, fmtVolume, getUnit, icon,
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

// Average daily steps over a date range, counting only days with steps logged.
export function stepsAverage(steps, from, to) {
  const days = steps.filter(s => s.date >= from && s.date <= to);
  const total = days.reduce((sum, s) => sum + s.steps, 0);
  return { days: days.length, avg: days.length ? Math.round(total / days.length) : null };
}

// Compares a week with the one before it ("last week" from the current week's view).
function stepsVsPrevWeek(week, prevWeek, current) {
  if (week.avg == null || prevWeek.avg == null) return '';
  const prev = current ? 'last week' : 'week before';
  const diff = week.avg - prevWeek.avg;
  if (Math.abs(diff) < 50) return badgeHtml({ cls: '', text: `Same as ${prev}`, dir: 0 });
  return badgeHtml({ cls: diff > 0 ? 'up' : 'down', text: `${fmtCount(Math.abs(diff))} vs ${prev}`, dir: Math.sign(diff) });
}

// Strength volume for a week: weight × reps of every set (per-side sets count twice).
function liftedWeek(logs, from, to) {
  const sessions = logs.filter(l => l.type === 'strength' && l.date >= from && l.date <= to);
  const total = sessions.reduce((sum, l) => sum + volumeKg(l.exercises), 0);
  return { sessions: sessions.length, total, avg: sessions.length ? total / sessions.length : null };
}

// +1 / -1 / 0 when within 1% of the earlier value.
const change = (now, before) => (Math.abs(now - before) <= Math.abs(before) * 0.01 ? 0 : Math.sign(now - before));

function liftedVsPrevWeek(week, prevWeek, current) {
  if (!week.sessions || !prevWeek.sessions) return '';
  const prev = current ? 'last week' : 'week before';
  const dir = change(week.total, prevWeek.total);
  if (!dir) return badgeHtml({ cls: '', text: `Same as ${prev}`, dir: 0 });
  const amt = `${fmtVolume(Math.abs(week.total - prevWeek.total))} ${getUnit()}`;
  return badgeHtml({ cls: dir > 0 ? 'up' : 'down', text: `${amt} vs ${prev}`, dir });
}

function liftedLabel(week, prevWeek) {
  if (!week.sessions) return `${getUnit()} lifted`;
  const dir = prevWeek.sessions ? change(week.avg, prevWeek.avg) : 0;
  const arrow = dir ? `<span class="avg-arrow ${dir > 0 ? 'up' : 'down'}" aria-label="${dir > 0 ? 'up' : 'down'} on the week before">${dir > 0 ? icon.up : icon.down}</span>` : '';
  return `${getUnit()} lifted · avg ${fmtVolume(week.avg)} ${getUnit()} / session · ${week.sessions} session${week.sessions === 1 ? '' : 's'}${arrow}`;
}

// Summary for the Mon–Sun week starting `wkStart`, which is never after the current week.
function weekCard(wkStart, logs, steps) {
  const thisMonday = mondayOf(new Date());
  const weeksAgo = Math.round((thisMonday - wkStart) / (7 * 864e5));
  const wkEnd = addDays(wkStart, 6);
  const [ws, we] = [toKey(wkStart), toKey(wkEnd)];
  const weekLogs = logs.filter(l => l.date >= ws && l.date <= we);
  const strengthDays = new Set(weekLogs.filter(l => l.type === 'strength').map(l => l.date)).size;
  const runKm = weekLogs.filter(l => l.type === 'cardio' && l.activity === 'run').reduce((s, l) => s + (l.distanceKm || 0), 0);
  const stepsWeek = stepsAverage(steps, ws, we);
  const stepsPrev = stepsAverage(steps, toKey(addDays(wkStart, -7)), toKey(addDays(wkStart, -1)));
  const lifted = liftedWeek(logs, ws, we);
  const liftedPrev = liftedWeek(logs, toKey(addDays(wkStart, -7)), toKey(addDays(wkStart, -1)));

  const range = weekRange(wkStart);
  const title = weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : range;
  const year = wkEnd.getFullYear() !== thisMonday.getFullYear() ? ` · ${wkEnd.getFullYear()}` : '';
  const sub = weeksAgo <= 1 ? range : `${weeksAgo} weeks ago${year}`;

  return `<section class="card week-card" id="week-card">
      <div class="week-head">
        <div class="week-title"><strong>${title}</strong><span>${sub}</span></div>
        <div class="cal-nav">
          <button class="icon-btn" data-week="-1" aria-label="Previous week">${icon.prev}</button>
          <button class="icon-btn" data-week="1" aria-label="Next week" ${weeksAgo === 0 ? 'disabled' : ''}>${icon.next}</button>
        </div>
      </div>
      ${weeksAgo > 0 ? '<button class="week-back" data-week="0">Back to this week</button>' : ''}
      <div class="stats">
        <div><div class="stat-val">${weekLogs.length}</div><div class="stat-label">workout${weekLogs.length === 1 ? '' : 's'}</div></div>
        <div><div class="stat-val">${strengthDays}</div><div class="stat-label">strength day${strengthDays === 1 ? '' : 's'}</div></div>
        <div><div class="stat-val">${formatKm1(runKm)}<small>km</small></div><div class="stat-label">run</div></div>
      </div>
      <div class="week-steps">
        <div class="stat-val">${stepsWeek.avg != null ? fmtCount(stepsWeek.avg) : '–'}</div>
        ${stepsVsPrevWeek(stepsWeek, stepsPrev, weeksAgo === 0)}
        <div class="stat-label">avg steps / day · ${stepsWeek.days} of 7 days</div>
      </div>
      <div class="week-steps week-lifted">
        <div class="stat-val">${lifted.sessions ? `${fmtVolume(lifted.total)}<small>${getUnit()}</small>` : '–'}</div>
        ${liftedVsPrevWeek(lifted, liftedPrev, weeksAgo === 0)}
        <div class="stat-label">${liftedLabel(lifted, liftedPrev)}</div>
      </div>
    </section>`;
}

// The summary's week is kept in `ui.calWeek` (a Monday key, null = this week),
// separate from the month being shown, so changing month leaves it alone.
function selectedMonday() {
  const thisMonday = mondayOf(new Date());
  if (!ui.calWeek || ui.calWeek >= toKey(thisMonday)) return thisMonday;
  return mondayOf(fromKey(ui.calWeek));
}

function setWeek(monday) {
  ui.calWeek = monday < mondayOf(new Date()) ? toKey(monday) : null;
}

export default async function calendar(ctx) {
  const [logs, steps] = await Promise.all([db.getAll('logs'), db.getAll('steps')]);
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

    ${weekCard(selectedMonday(), logs, steps)}

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

  // Tapping a day moves the summary to that day's week.
  ctx.app.querySelectorAll('.cal-day').forEach(a => a.addEventListener('click', () => {
    setWeek(mondayOf(fromKey(a.getAttribute('href').slice('#/day/'.length))));
  }));

  // Week arrows swap just the summary card, so the page doesn't jump.
  const wireWeek = () => {
    ctx.app.querySelectorAll('[data-week]').forEach(btn => btn.addEventListener('click', () => {
      const step = Number(btn.dataset.week);
      setWeek(step ? addDays(selectedMonday(), step * 7) : mondayOf(new Date()));
      ctx.app.querySelector('#week-card').outerHTML = weekCard(selectedMonday(), logs, steps);
      wireWeek();
    }));
  };
  wireWeek();
}
