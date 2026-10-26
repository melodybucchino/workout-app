import * as db from '../db.js';
import { loadLogs } from '../names.js';
import { needsLinkMigration, runLinkMigration } from '../migrate.js';
import {
  TYPES, TYPE_ORDER, ui, esc, toKey, fromKey, todayKey, addDays, mondayIndex, mondayOf, fmt,
  formatKm1, fmtCount, logSubtitle, byOrder, badgeHtml, weekRange, saveFile, toast, priorLogs, previousExercise, topKg, icon,
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

// Percentage change in top-set weight per exercise against the previous session
// of the same workout. Exercises without a weight in both sessions are skipped;
// per-side weights compare as logged (one side).
function strengthChange(log, prev) {
  const pcts = [];
  for (const ex of log.exercises || []) {
    const now = topKg(ex);
    const before = topKg(previousExercise([prev], ex)?.exercise);
    if (now != null && before != null) pcts.push(((now - before) / before) * 100);
  }
  const dir = p => (Math.abs(p) < 1 ? 0 : Math.sign(p));
  return {
    avg: pcts.length ? pcts.reduce((x, y) => x + y, 0) / pcts.length : null,
    up: pcts.filter(p => dir(p) > 0).length,
    same: pcts.filter(p => dir(p) === 0).length,
    down: pcts.filter(p => dir(p) < 0).length,
  };
}

// One row per strength workout done this week (its latest session), compared
// with the most recent earlier session of the same workout, however long ago.
function strengthRows(logs, from, to) {
  const latest = new Map();
  for (const l of logs.filter(x => x.type === 'strength' && x.date >= from && x.date <= to).sort(byOrder)) {
    latest.set(l.templateId || `title:${l.title}`, l);
  }
  return [...latest.values()].sort(byOrder).map(log => {
    const prev = priorLogs(logs, log)[0];
    let right;
    let sub = '';
    if (!prev) right = '<span class="sp-first">First session</span>';
    else {
      const c = strengthChange(log, prev);
      if (c.avg == null) {
        right = '<span class="sp-first">No weights to compare</span>';
      } else {
        const pct = Math.round(c.avg);
        right = Math.abs(c.avg) < 1
          ? badgeHtml({ cls: '', text: 'Same', dir: 0 })
          : badgeHtml({ cls: pct > 0 ? 'up' : 'down', text: `${Math.abs(pct)}% avg`, dir: Math.sign(pct) });
        sub = [[c.up, 'up'], [c.same, 'same'], [c.down, 'down']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(' · ');
      }
    }
    return `<a class="sp-row" href="#/log/${log.id}">
      <span class="dot t-strength"></span>
      <span class="row-main"><span class="sp-title">${esc(log.title)}</span>${sub ? `<span class="sp-sub">${sub}</span>` : ''}</span>
      ${right}
    </a>`;
  });
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
  const progress = strengthRows(logs, ws, we);

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
      ${progress.length ? `<div class="week-strength">
        <div class="stat-label">Strength progress</div>
        ${progress.join('')}
      </div>` : ''}
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
  const [logs, steps, needsUpdate] = await Promise.all([loadLogs(), db.getAll('steps'), needsLinkMigration()]);
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

  // One-time: save a backup, then link past logs to their saved workouts.
  const update = needsUpdate ? `<section class="card update-card">
      <h3>One-time update</h3>
      <p>Past logs will now follow your saved workouts, so renaming a workout or exercise updates them too. Save a backup of your data first.</p>
      <button class="btn btn-accent" id="run-update">Back up and update</button>
    </section>` : '';

  ctx.app.innerHTML = `${update}
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

  ctx.app.querySelector('#run-update')?.addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await saveFile(JSON.stringify(await db.exportAll(), null, 2), `workouts-backup-${todayKey()}-before-update.json`);
    } catch (err) {
      btn.disabled = false;
      toast(err.name === 'AbortError' ? 'Backup not saved, so nothing was changed' : `Backup failed: ${err.message}`);
      return;
    }
    await runLinkMigration();
    await ctx.rerender();
    toast('Updated. See Settings → Merge exercises');
  });

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
