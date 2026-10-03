import * as db from '../db.js';
import { TYPES, TYPE_ORDER, ui, esc, templateSummary, icon } from '../util.js';

const FILTERS = [['all', 'All'], ...TYPE_ORDER.map(t => [t, TYPES[t].short])];

export default async function library(ctx) {
  const templates = await db.getAll('templates');
  if (!ctx.alive()) return;

  const sorted = templates.sort((a, b) =>
    TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.createdAt - b.createdAt);
  const shown = sorted.filter(t => ui.libFilter === 'all' || t.type === ui.libFilter);

  ctx.app.innerHTML = `
    <header class="cal-head">
      <div>
        <h1 class="display page-title">Workouts</h1>
        <p class="page-sub">${templates.length} saved workout${templates.length === 1 ? '' : 's'}</p>
      </div>
      <a class="btn btn-accent" href="#/workouts/new${ui.libFilter !== 'all' ? `?type=${ui.libFilter}` : ''}" style="min-height:52px">${icon.plus}New</a>
    </header>
    <div class="chips">
      ${FILTERS.map(([v, l]) => `<button class="chip ${ui.libFilter === v ? 'on' : ''}" data-filter="${v}">${l}</button>`).join('')}
    </div>
    <div class="stack">
      ${shown.map(t => `
        <a class="card row-link" href="#/workouts/${t.id}">
          <span class="dot lg t-${t.type}"></span>
          <span class="row-main">
            <div class="row-title">${esc(t.title)}</div>
            <div class="row-sub">${esc(templateSummary(t))}</div>
          </span>
          ${icon.chevR}
        </a>`).join('') || `<div class="empty">No saved workouts here yet. Tap New to create one.</div>`}
    </div>
  `;

  ctx.app.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    ui.libFilter = b.dataset.filter;
    ctx.rerender();
  }));
}
