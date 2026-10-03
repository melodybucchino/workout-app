import * as db from '../db.js';
import {
  TYPES, ui, esc, fromKey, toKey, todayKey, addDays, mondayOf, fmt, isDistanceType,
  formatKm, formatDuration, formatIncline, paceOf, fmtW, getUnit, topKg, countedSets, priorLogs,
  previousExercise, weightBadge, badgeHtml, backLink, icon,
} from '../util.js';
import { dotsHtml, groupByDate } from './calendar.js';

function strengthBody(log, allLogs) {
  const prior = priorLogs(allLogs, log);
  const exs = log.exercises || [];
  const sets = exs.reduce((n, e) => n + countedSets(e).length, 0);
  const lines = exs.map(ex => {
    const reps = countedSets(ex).map(s => s.reps ?? '–').join(', ');
    const top = topKg(ex);
    const val = [reps, top != null ? `${fmtW(top)} ${getUnit()}` : ''].filter(Boolean).join(' · ') || '—';
    const prev = previousExercise(prior, ex.name);
    return `<div class="ex-line"><span class="name">${esc(ex.name)}</span>
      <span class="val">${esc(val)}</span>${badgeHtml(weightBadge(ex, prev?.exercise), false)}</div>`;
  }).join('');
  return `<div class="meta">${exs.length} exercise${exs.length === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}</div>
    ${exs.length ? `<div class="ex-lines">${lines}</div>` : ''}`;
}

function distanceBody(log) {
  const pace = paceOf(log);
  return `<div class="run-stats">
    <div><div class="stat-val">${log.distanceKm ? formatKm(log.distanceKm) : '–'}<small>km</small></div><div class="stat-label">Distance</div></div>
    <div><div class="stat-val">${log.durationSec ? formatDuration(log.durationSec) : '–'}</div><div class="stat-label">Time</div></div>
    <div><div class="stat-val">${pace ? formatDuration(pace) : '–'}<small>/km</small></div><div class="stat-label">Pace</div></div>
  </div>
  ${log.type === 'walk' && log.incline != null ? `<div class="meta feel-tag">Incline ${formatIncline(log.incline)}</div>` : ''}`;
}

function durationBody(log) {
  const n = (log.movements || []).length;
  return `<div class="run-stats">
    <div><div class="stat-val">${log.durationMin || '–'}<small>min</small></div><div class="stat-label">Duration</div></div>
    ${log.type === 'mobility' && n ? `<div><div class="stat-val">${n}</div><div class="stat-label">movement${n === 1 ? '' : 's'}</div></div>` : ''}
    ${log.feel ? `<div><div class="stat-val" style="font-size:18px;line-height:30px">${esc(log.feel)}</div><div class="stat-label">Feel</div></div>` : ''}
  </div>`;
}

export default async function day(ctx) {
  const [key] = ctx.params;
  const logs = await db.getAll('logs');
  if (!ctx.alive()) return;

  const date = fromKey(key);
  const byDate = groupByDate(logs);
  const dayLogs = byDate.get(key) || [];
  const wk = mondayOf(date);
  const tKey = todayKey();

  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(wk, i);
    const k = toKey(d);
    const cls = ['ws-day', k === key ? 'on' : '', k === tKey ? 'today' : ''].join(' ');
    return `<a class="${cls}" href="#/day/${k}" data-replace aria-label="${fmt.long(d)}">
      <span class="ws-dow">${'MTWTFSS'[i]}</span><span class="ws-num">${d.getDate()}</span>${dotsHtml(byDate.get(k) || [])}</a>`;
  }).join('');

  const cards = dayLogs.map(l => {
    const body = l.type === 'strength' ? strengthBody(l, logs) : isDistanceType(l.type) ? distanceBody(l) : durationBody(l);
    return `<a class="card log-card" href="#/log/${l.id}">
      <div class="log-card-head"><span class="eyebrow"><span class="dot t-${l.type}"></span>${esc(TYPES[l.type].label)}</span>${icon.chevR}</div>
      <div class="log-card-title">${esc(l.title)}</div>
      ${body}
    </a>`;
  }).join('');

  document.body.classList.add('has-fixed-cta');
  ctx.app.innerHTML = `
    <div class="topbar">${backLink('#/', fmt.month(date))}</div>
    <h1 class="display day-title">${fmt.weekday(date)}</h1>
    <p class="page-sub">${fmt.full(date)}</p>
    <nav class="week-strip" aria-label="Week">${strip}</nav>
    <div class="section-label eyebrow" style="margin-top:22px">${dayLogs.length} workout${dayLogs.length === 1 ? '' : 's'}</div>
    ${cards || `<div class="empty">Nothing logged on this day.</div>`}
    <div class="fixed-cta"><a class="btn btn-accent" href="#/day/${key}/add">${icon.plus}Add workout</a></div>
  `;

  // The calendar should open on this day's month when going back.
  ctx.app.querySelector('.back-link').addEventListener('click', () => {
    ui.calMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  });
  // Switching days within the week shouldn't pile up history entries.
  ctx.app.querySelectorAll('[data-replace]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    location.replace(a.getAttribute('href'));
  }));
}
