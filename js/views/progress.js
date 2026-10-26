import * as db from '../db.js';
import {
  TYPES, TYPE_ORDER, ui, esc, toKey, fromKey, todayKey, addDays, mondayOf, fmt, weekRange,
  fmtW, getUnit, kgToDisplay, fmtCount, formatKm, formatKm1, formatDuration, countedSets, byOrder, isTimed,
  badgeHtml, icon,
} from '../util.js';
import { exerciseHistories, historyFor, bestSet } from '../stats.js';
import { stepsAverage } from './calendar.js';
import { DERIVED } from '../cardio.js';

const RANGES = [['4', '4 weeks'], ['12', '12 weeks'], ['all', 'All']];
const EMPTY = 'Log a few workouts to see your progress here.';
const pace = DERIVED.pace;

const svgNS = 'http://www.w3.org/2000/svg';
const sideTag = '<span class="side-tag">per side</span>';
const setText = (s, unit = true) => `${fmtW(s.kg)}${unit ? ` ${getUnit()}` : ''}${s.reps ? ` × ${s.reps}` : ''}`;
const dateText = key => {
  const d = fromKey(key);
  return d.getFullYear() === new Date().getFullYear() ? fmt.dayMonth(d) : `${fmt.dayMonth(d)} ${d.getFullYear()}`;
};

/* ---------- Scales ---------- */

const NUM_STEPS = [1, 2, 2.5, 5];
const PACE_STEPS = [5, 10, 15, 20, 30, 60, 120, 300, 600];

// Rounded axis from `min` to `max` with about three gridlines.
function niceScale(min, max, paceSteps = false) {
  const span = max - min || Math.abs(max) * 0.2 || 1;
  const rough = span / 3;
  let step;
  if (paceSteps) step = PACE_STEPS.find(s => s >= rough) || 600;
  else {
    const mag = 10 ** Math.floor(Math.log10(rough));
    step = (NUM_STEPS.find(s => s * mag >= rough) || 10) * mag;
  }
  let lo = Math.max(0, Math.floor(min / step) * step);
  let hi = Math.ceil(max / step) * step;
  if (min === max) { lo = Math.max(0, lo - step); hi += step; }
  if (hi === lo) hi += step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi: ticks.at(-1), ticks };
}

const svgText = (x, y, text, anchor = 'start') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="ax">${esc(text)}</text>`;

/* ---------- Line chart (one dot per session) ---------- */

// points: [{ t (ms), y, key }]. `from` pins the left edge to the range start.
function lineChart(W, points, { from, yFmt, paceAxis = false, selected }) {
  const H = 180;
  const pad = { l: 40, r: 14, t: 12, b: 26 };
  const ys = points.map(p => p.y);
  const sc = niceScale(Math.min(...ys), Math.max(...ys), paceAxis);
  const t0 = from ?? points[0].t;
  const t1 = Math.max(Date.now(), points.at(-1).t);
  const span = t1 - t0;
  // A single session with no fixed range start sits in the middle.
  const x = t => (from == null && points.length === 1
    ? (pad.l + W - pad.r) / 2
    : pad.l + ((t - t0) / (span || 1)) * (W - pad.l - pad.r));
  const y = v => pad.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - pad.t - pad.b);

  const grid = sc.ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
    ${svgText(pad.l - 8, y(v) + 4, yFmt(v), 'end')}`).join('');
  const xl = [svgText(pad.l, H - 6, dateText(toKey(new Date(t0))))];
  xl.push(svgText(W - pad.r, H - 6, dateText(toKey(new Date(t1))), 'end'));
  const line = points.length > 1
    ? `<polyline class="line" points="${points.map(p => `${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}"/>` : '';
  const dots = points.map((p, i) => `<circle class="pt${i === selected ? ' on' : ''}" cx="${x(p.t).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${i === selected ? 6.5 : 4.5}"/>`).join('');
  return { svg: `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">${grid}${xl.join('')}${line}${dots}</svg>`, xs: points.map(p => x(p.t)) };
}

/* ---------- Bar chart (one bar per week) ---------- */

// weeks: [{ start (Date), total, parts?: [{ value, color }] }]
// `selected` is only highlighted (others faded) once a bar has been tapped.
function barChart(W, weeks, { yFmt, color, selected, tapped }) {
  const H = 150;
  const pad = { l: 40, r: 6, t: 12, b: 24 };
  const max = Math.max(0, ...weeks.map(w => w.total || 0));
  const sc = niceScale(0, max || 1);
  const slot = (W - pad.l - pad.r) / weeks.length;
  const bw = Math.max(2, Math.min(28, slot * 0.62));
  const y = v => pad.t + (1 - v / sc.hi) * (H - pad.t - pad.b);
  const grid = [sc.ticks[0], sc.ticks.at(-1)].map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>
    ${svgText(pad.l - 8, y(v) + 4, yFmt(v), 'end')}`).join('');
  const every = Math.max(1, Math.ceil(52 / slot));
  const xs = weeks.map((_, i) => pad.l + slot * (i + 0.5));
  const bars = weeks.map((w, i) => {
    const cx = xs[i];
    const cls = `bar${tapped && i !== selected ? ' dim' : ''}`;
    let base = 0;
    const parts = w.parts || (w.total ? [{ value: w.total, color }] : []);
    const rects = parts.filter(p => p.value > 0).map(p => {
      const top = y(base + p.value);
      const r = `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(base) - top).toFixed(1)}" style="fill:${p.color}"/>`;
      base += p.value;
      return r;
    }).join('');
    // Labels run back from the newest week so the current one is always named.
    const label = (weeks.length - 1 - i) % every === 0 ? svgText(cx, H - 6, fmt.dayMonth(w.start), 'middle') : '';
    return `<g class="${cls}">${rects}</g>${label}`;
  }).join('');
  return { svg: `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">${grid}${bars}</svg>`, xs };
}

// Tapping anywhere on a chart picks the nearest point or bar.
function wireChart(box, xs, onPick) {
  box.querySelector('svg').addEventListener('click', e => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (svg.viewBox.baseVal.width / rect.width);
    let best = 0;
    xs.forEach((x, i) => { if (Math.abs(x - px) < Math.abs(xs[best] - px)) best = i; });
    onPick(best);
  });
}

const readout = (main, sub) => `<div class="chart-read"><strong>${main}</strong><span>${sub}</span></div>`;
const empty = text => `<div class="empty prog-empty">${text}</div>`;

/* ---------- Workout overview ---------- */

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const RANGE_SUFFIX = { 4: ' over 4 weeks', 12: ' over 12 weeks', all: ' overall' };

// Green/orange/grey % badge; under 1% counts as the same.
function pctBadge(pct, suffix = '') {
  if (Math.abs(pct) < 1) return badgeHtml({ cls: '', text: `Same${suffix}`, dir: 0 });
  return badgeHtml({ cls: pct > 0 ? 'up' : 'down', text: `${Math.abs(Math.round(pct))}%${suffix}`, dir: Math.sign(pct) });
}

// Each strength workout's sessions in the range. Per exercise (matched by name or
// link, as in the exercise histories), the change in top-set weight from its first
// to its latest session of this workout in the range; the workout's figure is the
// average of those. `spark` is the same average at each session, from 0 at the start.
function workoutGroups(logs, histories, from) {
  const groups = new Map();
  for (const l of [...logs].sort(byOrder)) {
    if (l.type !== 'strength') continue;
    const key = l.templateId || `title:${l.title}`;
    if (!groups.has(key)) groups.set(key, { key, all: [] });
    groups.get(key).all.push(l);
  }
  return [...groups.values()].map(g => {
    const sessions = g.all.filter(l => l.date >= from);
    const exs = new Map();
    const spark = [];
    for (const l of sessions) {
      const pcts = [];
      for (const ex of l.exercises || []) {
        const kg = bestSet(ex)?.kg;
        const h = kg != null && !isTimed(ex) ? historyFor(histories, ex) : null;
        if (!h) continue;
        if (!exs.has(h.id)) exs.set(h.id, { h, first: kg, last: kg, n: 0 });
        const e = exs.get(h.id);
        e.last = kg;
        e.n++;
        pcts.push(((kg - e.first) / e.first) * 100);
      }
      if (pcts.length) spark.push(mean(pcts));
    }
    const rows = [...exs.values()].map(e => ({ ...e, pct: e.n > 1 ? ((e.last - e.first) / e.first) * 100 : null }));
    const pcts = rows.filter(r => r.pct != null).map(r => r.pct);
    return { key: g.key, title: g.all.at(-1).title, last: g.all.at(-1), sessions, spark, rows, avg: pcts.length ? mean(pcts) : null };
  }).filter(g => g.sessions.length).sort((a, b) => byOrder(b.last, a.last));
}

function sparkline(vals) {
  if (vals.length < 2) return '';
  const [W, H, p] = [76, 30, 4];
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  const x = i => p + (i / (vals.length - 1)) * (W - 2 * p);
  const y = v => p + (1 - (v - lo) / span) * (H - 2 * p);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <line x1="${p}" x2="${W - p}" y1="${y(0)}" y2="${y(0)}" class="zero"/>
    <polyline points="${pts}"/><circle cx="${x(vals.length - 1)}" cy="${y(vals.at(-1))}" r="3"/></svg>`;
}

function overviewSection(groups, anyStrength, rangeName) {
  const head = '<h2 class="prog-h">Workouts</h2>';
  if (!anyStrength) return head + empty(EMPTY);
  if (!groups.length) return head + empty(`No strength workouts ${rangeName}.`);
  const suffix = RANGE_SUFFIX[ui.progRange];
  return head + groups.map(g => {
    const open = ui.progOpen === g.key;
    const n = g.sessions.length;
    const change = g.avg != null ? pctBadge(g.avg, suffix)
      : `<span class="sp-first">${n === 1 ? 'Log it again to compare' : 'No weights to compare'}</span>`;
    const rows = !open ? '' : `<div class="wo-exs">${g.rows.map(r => `
      <button class="wo-ex" data-ex="${esc(r.h.id)}">
        <span class="wo-ex-name">${esc(r.h.name)}${r.h.perSide ? sideTag : ''}</span>
        ${r.pct != null ? pctBadge(r.pct) : '<span class="sp-first">1 session</span>'}
        ${icon.chevR}
      </button>`).join('') || '<p class="chart-none">No weighted exercises.</p>'}</div>`;
    return `<section class="card wo-card${open ? ' open' : ''}">
      <button class="wo-head" data-wo="${esc(g.key)}" aria-expanded="${open}">
        <span class="wo-main">
          <span class="wo-title"><span class="dot t-strength"></span>${esc(g.title)}</span>
          <span class="wo-change">${change}<span class="wo-n">${n} session${n === 1 ? '' : 's'}</span></span>
        </span>
        ${sparkline(g.spark)}
        <span class="wo-chev">${icon.chevR}</span>
      </button>
      ${rows}
    </section>`;
  }).join('');
}

/* ---------- Sections ---------- */

function strengthSection(histories) {
  if (!histories.length) return `<h2 class="prog-h" id="ex-detail">Exercise detail</h2>${empty(EMPTY)}`;
  const h = histories.find(x => x.keys.has(ui.progEx)) || histories[0];
  const options = histories.map(x => `<option value="${esc(x.id)}" ${x === h ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const recent = h.sessions.slice(-5).reverse();
  const rows = recent.map(s => {
    const reps = countedSets(s.ex).map(x => x.reps ?? '–').join(', ');
    return `<tr><td>${dateText(s.date)}</td><td>${esc(reps || '–')}</td><td class="r">${fmtW(s.best.kg)} ${getUnit()}</td></tr>`;
  }).join('');
  return `<h2 class="prog-h" id="ex-detail">Exercise detail</h2>
    <section class="card prog-card">
      <label class="sr-only" for="ex-pick">Exercise</label>
      <select class="field prog-select" id="ex-pick">${options}</select>
      <div class="chart-box" id="strength-chart"></div>
      <div class="pb-row">
        <div><div class="eyebrow">Personal best</div>
          <div class="pb-val">${setText(h.record.best)}${h.perSide ? sideTag : ''}</div></div>
        <span class="muted">${dateText(h.record.date)}</span>
      </div>
      <table class="hist-table">
        <thead><tr><th>Date</th><th>Reps${h.perSide ? ' / side' : ''}</th><th class="r">Top${h.perSide ? ' / side' : ''}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function recordsSection(histories) {
  if (!histories.length) return `<h2 class="prog-h">Personal records</h2>${empty(EMPTY)}`;
  const list = [...histories].sort((a, b) => byOrder(b.record.log, a.record.log));
  return `<h2 class="prog-h">Personal records</h2>
    <section class="card group-card pr-list">
      ${list.map(h => `<div class="pr-row">
        <div class="row-main"><div class="row-title">${esc(h.name)}${h.isNew ? '<span class="new-tag">New</span>' : ''}</div>
          <div class="row-sub">${dateText(h.record.date)}</div></div>
        <div class="pr-val">${setText(h.record.best)}${h.perSide ? '<small>per side</small>' : ''}</div>
      </div>`).join('')}
    </section>`;
}

const trendCard = (id, title) => `<section class="card prog-card trend-card">
  <h3 class="card-h">${title}</h3><div class="chart-box" id="${id}"></div></section>`;

function runGroups(logs) {
  const groups = new Map();
  for (const l of [...logs].sort(byOrder)) {
    if (l.type !== 'cardio' || l.activity !== 'run') continue;
    const p = pace.calc(l);
    if (p == null) continue;
    const key = l.templateId || `title:${l.title}`;
    if (!groups.has(key)) groups.set(key, { key, runs: [] });
    groups.get(key).runs.push({ log: l, pace: p });
  }
  return [...groups.values()]
    .map(g => ({ ...g, title: g.runs.at(-1).log.title, best: g.runs.reduce((a, b) => (b.pace < a.pace ? b : a)) }))
    .sort((a, b) => byOrder(b.runs.at(-1).log, a.runs.at(-1).log));
}

function runningSection(groups) {
  if (!groups.length) return `<h2 class="prog-h">Running</h2>${empty('Log a few runs to see your pace here.')}`;
  const g = groups.find(x => x.key === ui.progRun) || groups[0];
  const picker = groups.length > 1
    ? `<label class="sr-only" for="run-pick">Run workout</label>
       <select class="field prog-select" id="run-pick">${groups.map(x => `<option value="${esc(x.key)}" ${x === g ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>`
    : `<h3 class="card-h">${esc(g.title)}</h3>`;
  return `<h2 class="prog-h">Running</h2>
    <section class="card prog-card">
      ${picker}
      <div class="chart-box" id="run-chart"></div>
      <div class="pb-row">
        <div><div class="eyebrow">Best pace</div>
          <div class="pb-val">${pace.format(g.best.pace)}<small> /km</small></div></div>
        <span class="muted">${dateText(g.best.log.date)} · ${formatKm(g.best.log.distanceKm)} km</span>
      </div>
    </section>`;
}

/* ---------- Screen ---------- */

export default async function progress(ctx) {
  const [logs, steps] = await Promise.all([db.getAll('logs'), db.getAll('steps')]);
  if (!ctx.alive()) return;

  const histories = exerciseHistories(logs);
  const runs = runGroups(logs);

  ctx.app.innerHTML = `
    <h1 class="display page-title">Progress</h1>
    <div class="seg range-seg" role="group" aria-label="Range">
      ${RANGES.map(([v, l]) => `<button data-range="${v}" class="${ui.progRange === v ? 'on' : ''}">${l}</button>`).join('')}
    </div>
    <div id="prog"></div>
  `;
  const prog = ctx.app.querySelector('#prog');

  // The range sets the charts' time window; records and the session table are all-time.
  const render = () => {
    const thisMonday = mondayOf(new Date());
    const firstData = [...logs.map(l => l.date), ...steps.map(s => s.date)].sort()[0];
    const startMonday = ui.progRange === 'all'
      ? (firstData ? mondayOf(fromKey(firstData)) : thisMonday)
      : addDays(thisMonday, -7 * (Number(ui.progRange) - 1));
    const fromKeyStr = toKey(startMonday);
    const nWeeks = Math.round((thisMonday - startMonday) / (7 * 864e5)) + 1;
    // "All" is capped at five years of bars.
    const shown = Math.min(nWeeks, 260);
    const weeks = Array.from({ length: shown }, (_, i) => addDays(thisMonday, -7 * (shown - 1 - i)));
    const rangeName = ui.progRange === 'all' ? 'yet' : `in the last ${ui.progRange} weeks`;

    const workouts = workoutGroups(logs, histories, fromKeyStr);
    prog.innerHTML = `
      ${overviewSection(workouts, logs.some(l => l.type === 'strength'), rangeName)}
      ${strengthSection(histories)}
      ${recordsSection(histories)}
      <h2 class="prog-h">Weekly trends</h2>
      ${logs.length || steps.length
        ? `${trendCard('wk-workouts', 'Workouts')}${trendCard('wk-steps', 'Average daily steps')}${trendCard('wk-run', 'Running')}`
        : empty(EMPTY)}
      ${runningSection(runs)}
    `;
    const W = prog.querySelector('.prog-card, .empty').clientWidth - 34;

    // Workout cards open to their exercises; an exercise opens its chart below.
    prog.querySelectorAll('[data-wo]').forEach(b => b.addEventListener('click', () => {
      ui.progOpen = ui.progOpen === b.dataset.wo ? null : b.dataset.wo;
      render();
    }));
    prog.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => {
      ui.progEx = b.dataset.ex;
      render();
      prog.querySelector('#ex-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    // Strength line chart
    const sBox = prog.querySelector('#strength-chart');
    if (sBox) {
      const h = histories.find(x => x.keys.has(ui.progEx)) || histories[0];
      const sessions = h.sessions.filter(s => s.date >= fromKeyStr);
      const draw = sel => {
        if (!sessions.length) { sBox.innerHTML = `<p class="chart-none">No sessions ${rangeName}.</p>`; return; }
        const pts = sessions.map(s => ({ t: fromKey(s.date).getTime(), y: kgToDisplay(s.best.kg) }));
        const { svg, xs } = lineChart(W, pts, { from: ui.progRange === 'all' ? null : startMonday.getTime(), yFmt: v => String(v), selected: sel });
        const s = sessions[sel];
        sBox.innerHTML = readout(`${setText(s.best)}${h.perSide ? ' per side' : ''}`, fmt.short(fromKey(s.date))) + svg;
        wireChart(sBox, xs, draw);
      };
      draw(sessions.length - 1);
      prog.querySelector('#ex-pick').addEventListener('change', e => {
        ui.progEx = e.target.value;
        render();
      });
    }

    // Weekly bars
    const wkBox = prog.querySelector('#wk-workouts');
    if (wkBox) {
      const data = weeks.map(start => {
        const [a, b] = [toKey(start), toKey(addDays(start, 6))];
        const wl = logs.filter(l => l.date >= a && l.date <= b);
        const counts = TYPE_ORDER.map(t => ({ t, value: wl.filter(l => l.type === t).length }));
        const stepsAvg = stepsAverage(steps, a, b);
        const km = wl.filter(l => l.type === 'cardio' && l.activity === 'run').reduce((s, l) => s + (l.distanceKm || 0), 0);
        return { start, counts, total: wl.length, steps: stepsAvg, km };
      });
      const weekName = start => (start.getTime() === thisMonday.getTime() ? 'This week' : weekRange(start));
      const bars = (box, opts) => {
        const draw = (sel, tapped = false) => {
          const { svg, xs } = barChart(W, opts.weeks, { ...opts, selected: sel, tapped });
          box.innerHTML = readout(opts.main(data[sel]), weekName(data[sel].start)) + svg;
          wireChart(box, xs, i => draw(i, true));
        };
        draw(data.length - 1);
      };
      bars(wkBox, {
        weeks: data.map(d => ({ start: d.start, total: d.total, parts: d.counts.map(c => ({ value: c.value, color: `var(--${c.t})` })) })),
        yFmt: v => String(v),
        main: d => {
          const parts = d.counts.filter(c => c.value).map(c => `${c.value} ${TYPES[c.t].short.toLowerCase()}`).join(', ');
          return `${d.total} workout${d.total === 1 ? '' : 's'}${parts ? `<small>${parts}</small>` : ''}`;
        },
      });
      bars(prog.querySelector('#wk-steps'), {
        weeks: data.map(d => ({ start: d.start, total: d.steps.avg || 0 })),
        color: 'var(--dark)',
        yFmt: v => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v)),
        main: d => (d.steps.avg != null ? `${fmtCount(d.steps.avg)}<small>avg steps / day · ${d.steps.days} of 7 days</small>` : 'No steps logged'),
      });
      bars(prog.querySelector('#wk-run'), {
        weeks: data.map(d => ({ start: d.start, total: d.km })),
        color: 'var(--cardio)',
        yFmt: v => String(v),
        main: d => `${formatKm1(d.km)} km<small>run</small>`,
      });
      prog.querySelector('.trend-card').insertAdjacentHTML('beforeend', `<div class="legend prog-legend">
        ${TYPE_ORDER.map(t => `<span><span class="dot t-${t}"></span>${TYPES[t].short}</span>`).join('')}</div>`);
    }

    // Run pace line chart
    const rBox = prog.querySelector('#run-chart');
    if (rBox) {
      const g = runs.find(x => x.key === ui.progRun) || runs[0];
      const list = g.runs.filter(r => r.log.date >= fromKeyStr);
      const draw = sel => {
        if (!list.length) { rBox.innerHTML = `<p class="chart-none">No runs ${rangeName}.</p>`; return; }
        const pts = list.map(r => ({ t: fromKey(r.log.date).getTime(), y: r.pace }));
        const { svg, xs } = lineChart(W, pts, { from: ui.progRange === 'all' ? null : startMonday.getTime(), yFmt: formatDuration, paceAxis: true, selected: sel });
        const r = list[sel];
        rBox.innerHTML = readout(`${pace.format(r.pace)}<small>/km · ${formatKm(r.log.distanceKm)} km</small>`, fmt.short(fromKey(r.log.date)))
          + svg + '<p class="chart-note">Lower is faster</p>';
        wireChart(rBox, xs, draw);
      };
      draw(list.length - 1);
      prog.querySelector('#run-pick')?.addEventListener('change', e => {
        ui.progRun = e.target.value;
        render();
      });
    }
  };

  render();
  ctx.app.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
    ui.progRange = b.dataset.range;
    ctx.app.querySelectorAll('[data-range]').forEach(x => x.classList.toggle('on', x === b));
    render();
  }));
}
