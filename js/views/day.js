import * as db from '../db.js';
import {
  typeLabelHtml, isExerciseType, ui, esc, fromKey, toKey, todayKey, addDays, mondayOf, fmt, isCardio,
  formatDuration, fmtW, getUnit, topKg, countedSets, priorLogs,
  previousExercise, progressBadge, badgeHtml, isTimed, isPerSide, formatHold, backLink, icon,
} from '../util.js';
import { dotsHtml, groupByDate } from './calendar.js';
import { FIELDS, activityOf, derivedOf } from '../cardio.js';

function strengthBody(log, allLogs) {
  const prior = priorLogs(allLogs, log);
  const exs = log.exercises || [];
  const sets = exs.reduce((n, e) => n + countedSets(e).length, 0);
  const lines = exs.map(ex => {
    const done = countedSets(ex);
    const amounts = done.map(s => (isTimed(ex) ? (s.sec ? formatHold(s.sec) : '–') : s.reps ?? '–')).join(', ')
      + (done.length && isPerSide(ex) ? ' / side' : '');
    const top = topKg(ex);
    const val = [amounts, top != null ? `${fmtW(top)} ${getUnit()}` : ''].filter(Boolean).join(' · ') || '—';
    const prev = previousExercise(prior, ex);
    return `<div class="ex-line"><span class="name">${esc(ex.name)}</span>
      <span class="val">${esc(val)}</span>${badgeHtml(progressBadge(ex, prev?.exercise), false)}</div>`;
  }).join('');
  return `<div class="meta">${exs.length} exercise${exs.length === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}</div>
    ${exs.length ? `<div class="ex-lines">${lines}</div>` : ''}`;
}

// Required fields, time and any calculated value as big stats; optional
// fields and feel underneath.
function cardioBody(log) {
  const act = activityOf(log);
  const stat = (val, unit, label) =>
    `<div><div class="stat-val">${val ?? '–'}${unit ? `<small>${unit}</small>` : ''}</div><div class="stat-label">${label}</div></div>`;
  const stats = act.required.map(k => {
    const f = FIELDS[k];
    return stat(log[k] != null ? f.format(log[k]) : null, f.unit, f.label);
  });
  stats.push(stat(log.durationSec ? formatDuration(log.durationSec) : null, '', 'Time'));
  const der = derivedOf(log);
  if (der) {
    const v = der.calc(log);
    stats.push(stat(v != null ? der.format(v) : null, der.unit, der.label));
  }
  const extras = act.optional.filter(k => log[k] != null).map(k => FIELDS[k].short(log[k]));
  if (log.feel) extras.push(`felt ${log.feel.toLowerCase()}`);
  const line = extras.join(' · ');
  return `<div class="run-stats">${stats.join('')}</div>
    ${line ? `<div class="meta feel-tag">${esc(line[0].toUpperCase() + line.slice(1))}</div>` : ''}`;
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
    const body = isExerciseType(l.type) ? strengthBody(l, logs) : isCardio(l.type) ? cardioBody(l) : durationBody(l);
    return `<a class="card log-card" href="#/log/${l.id}">
      <div class="log-card-head"><span class="eyebrow">${typeLabelHtml(l)}</span>${icon.chevR}</div>
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
