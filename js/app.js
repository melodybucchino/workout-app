import * as db from './db.js';
import { seedIfNeeded } from './seed.js';
import { linkExerciseIds, migrateCardio } from './migrate.js';
import { setUnitCache } from './util.js';
import calendar from './views/calendar.js';
import day from './views/day.js';
import add from './views/add.js';
import log from './views/log.js';
import library from './views/library.js';
import edit from './views/edit.js';
import settings from './views/settings.js';
import progress from './views/progress.js';

const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const routes = [
  [new RegExp('^/$'), calendar, 'calendar'],
  [new RegExp(`^/day/${DATE}$`), day, null],
  [new RegExp(`^/day/${DATE}/add$`), add, null],
  [/^\/log\/([\w-]+)$/, log, null],
  [/^\/workouts$/, library, 'workouts'],
  [/^\/workouts\/([\w-]+)$/, edit, null],
  [/^\/progress$/, progress, 'progress'],
  [/^\/settings$/, settings, 'settings'],
];

const app = document.getElementById('app');
let renderToken = 0;
let cleanup = null;

async function router() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  let match = null;
  for (const [re, view, tab] of routes) {
    const m = path.match(re);
    if (m) { match = { view, tab, params: m.slice(1) }; break; }
  }
  if (!match) { location.replace('#/'); return; }

  if (cleanup) { try { await cleanup(); } catch (e) { console.error(e); } cleanup = null; }

  const token = ++renderToken;
  document.body.classList.toggle('has-tabbar', !!match.tab);
  document.body.classList.remove('has-fixed-cta');
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === match.tab));

  const ctx = {
    app,
    params: match.params,
    query,
    alive: () => token === renderToken,
    onLeave: fn => { cleanup = fn; },
    rerender: () => token === renderToken && router(),
  };
  try {
    await match.view(ctx);
    if (ctx.alive()) window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    if (ctx.alive()) app.innerHTML = `<div class="empty">Something went wrong: ${String(err.message || err)}</div>`;
  }
}

async function start() {
  try { navigator.storage?.persist?.(); } catch {}
  await seedIfNeeded();
  // Housekeeping only; never block the app from opening.
  try { await migrateCardio(); } catch (err) { console.warn('Cardio migration failed', err); }
  try { await linkExerciseIds(); } catch (err) { console.warn('Linking exercises failed', err); }
  setUnitCache(await db.getSetting('unit', 'kg'));
  window.addEventListener('hashchange', router);
  router();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  }
}

start();
