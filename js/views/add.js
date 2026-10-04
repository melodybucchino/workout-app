import * as db from '../db.js';
import {
  TYPES, TYPE_ORDER, isExerciseType, isCardio, ui, uid, esc, fromKey, fmt, byOrder, priorLogs, previousExercise, isTimed,
  templateShortDesc, icon,
} from '../util.js';
import { DEFAULT_ACTIVITY, fieldsOf } from '../cardio.js';

const FILTERS = [['all', 'All'], ...TYPE_ORDER.map(t => [t, TYPES[t].short])];

// A log is a full copy of the template, so later template edits never touch it.
export async function createLog(template, date) {
  const logs = await db.getAll('logs');
  const log = {
    id: uid(),
    date,
    templateId: template.id,
    type: template.type,
    ...(isCardio(template.type) ? { activity: template.activity || DEFAULT_ACTIVITY } : {}),
    title: template.title,
    notes: '',
    feel: null,
    createdAt: Date.now(),
  };
  const prior = priorLogs(logs, log);

  if (isExerciseType(template.type)) {
    // Pre-fill every exercise with what was done the last time this workout was logged.
    log.exercises = (template.exercises || []).map(e => {
      const timed = isTimed(e);
      const blank = () => (timed ? { kg: null, sec: null } : { kg: null, reps: null });
      const prev = previousExercise(prior, { exId: e.id, name: e.name, mode: e.mode });
      const sets = prev
        ? prev.exercise.sets
          .filter(s => s.kg != null || (timed ? s.sec != null : s.reps != null))
          .map(s => (timed ? { kg: s.kg, sec: s.sec ?? null } : { kg: s.kg, reps: s.reps ?? null }))
        : [];
      const ex = { exId: e.id, name: e.name, sets: sets.length ? sets : [blank(), blank(), blank()] };
      if (timed) ex.mode = 'time';
      return ex;
    });
  } else if (isCardio(template.type)) {
    log.durationSec = null;
    fieldsOf(log).forEach(k => { log[k] = null; });
  } else {
    log.durationMin = template.durationMin ?? prior[0]?.durationMin ?? null;
    if (template.type === 'mobility') log.movements = [...(template.movements || [])];
  }
  await db.put('logs', log);
  return log;
}

export default async function add(ctx) {
  const [key] = ctx.params;
  const [templates, logs] = await Promise.all([db.getAll('templates'), db.getAll('logs')]);
  if (!ctx.alive()) return;

  const lastDone = new Map();
  for (const l of [...logs].sort(byOrder)) lastDone.set(l.templateId, l.date);

  const groups = TYPE_ORDER
    .filter(t => ui.addFilter === 'all' || ui.addFilter === t)
    .map(t => [t, templates.filter(x => x.type === t).sort((a, b) => a.createdAt - b.createdAt)])
    .filter(([, list]) => list.length);

  const rows = groups.map(([t, list]) => `
    <div class="eyebrow group-label"><span class="dot t-${t}"></span>${esc(TYPES[t].label)}</div>
    <div class="card group-card">
      ${list.map(tp => {
        const last = lastDone.get(tp.id);
        const desc = `${templateShortDesc(tp)} · ${last ? `last done ${fmt.short(fromKey(last))}` : 'not done yet'}`;
        return `<button class="row-link add-row" data-id="${tp.id}">
          <span class="row-main"><div class="row-title">${esc(tp.title)}</div><div class="row-sub">${esc(desc)}</div></span>
          <span class="plus-circle" aria-hidden="true">${icon.plus}</span>
        </button>`;
      }).join('')}
    </div>`).join('');

  const dayHref = `#/day/${key}`;
  ctx.app.innerHTML = `
    <div class="add-close"><a class="icon-btn" href="${dayHref}" aria-label="Close">${icon.x}</a></div>
    <h1 class="display page-title">Add workout</h1>
    <p class="page-sub">to ${fmt.long(fromKey(key)).replace(' ', ', ')}</p>
    <div class="chips" role="tablist">
      ${FILTERS.map(([v, l]) => `<button class="chip ${ui.addFilter === v ? 'on' : ''}" data-filter="${v}">${l}</button>`).join('')}
    </div>
    ${rows || `<div class="empty">No saved ${ui.addFilter === 'all' ? '' : TYPES[ui.addFilter].short.toLowerCase() + ' '}workouts yet.</div>`}
    <a class="btn-dashed create-link" href="#/workouts/new?back=${encodeURIComponent(`day/${key}/add`)}${ui.addFilter !== 'all' ? `&type=${ui.addFilter}` : ''}">${icon.plus}Create a new workout</a>
  `;

  ctx.app.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    ui.addFilter = b.dataset.filter;
    ctx.rerender();
  }));
  ctx.app.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const tp = templates.find(t => t.id === b.dataset.id);
    const log = await createLog(tp, key);
    // Replace so "back" from the log goes to the day, not this picker.
    location.replace(`#/log/${log.id}`);
  }));
}
