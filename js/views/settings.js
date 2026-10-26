import * as db from '../db.js';
import { linkAllLogs, migrateCardio } from '../migrate.js';
import { getUnit, setUnitCache, todayKey, toast, saveFile, esc, isExerciseType, isTimed } from '../util.js';
import { unmatchedExercises, mergeExercise } from '../names.js';

// Old exercise names in logs that don't match a saved workout's exercise, each
// with a picker of saved exercises (measured the same way) to merge it into.
function mergeCard(logs, templates) {
  const list = unmatchedExercises(logs, templates);
  const withEx = templates.filter(t => isExerciseType(t.type) && (t.exercises || []).length)
    .sort((a, b) => a.title.localeCompare(b.title));
  const options = timed => withEx.map(t => {
    const exs = t.exercises.filter(e => isTimed(e) === timed);
    return exs.length ? `<optgroup label="${esc(t.title)}">${exs.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const rows = list.map(u => `<div class="merge-row" data-key="${esc(u.key)}">
      <div class="merge-name"><strong>${esc(u.name)}</strong><span>in ${u.logs} log${u.logs === 1 ? '' : 's'}${u.timed ? ' · timed' : ''}</span></div>
      <div class="merge-pick">
        <select class="field prog-select" aria-label="Merge ${esc(u.name)} into"><option value="">Merge into…</option>${options(u.timed)}</select>
        <button class="btn btn-dark" data-merge disabled>Merge</button>
      </div>
    </div>`).join('');
  return `<section class="card settings-card">
      <h3 class="card-h">Merge exercises</h3>
      ${list.length
        ? `<p>These names in your past logs don't match an exercise in any saved workout, for example an old spelling or an exercise you've since removed. Merge one into a saved exercise to give it that name and join its history.</p>
           <div class="merge-list">${rows}</div>`
        : '<p>Every exercise in your past logs matches a saved workout. Nothing to merge.</p>'}
    </section>`;
}


export default async function settings(ctx) {
  const [templates, logs, steps] = await Promise.all([db.getAll('templates'), db.getAll('logs'), db.getAll('steps')]);
  if (!ctx.alive()) return;
  const unit = getUnit();

  ctx.app.innerHTML = `
    <h1 class="display page-title">Settings</h1>

    <section class="card settings-card">
      <h3 class="card-h">Weight units</h3>
      <p>Weights are stored in kg and converted for display, so switching never changes your data.</p>
      <div class="seg two" id="units">
        <button data-unit="kg" class="${unit === 'kg' ? 'on' : ''}">kg</button>
        <button data-unit="lbs" class="${unit === 'lbs' ? 'on' : ''}">lbs</button>
      </div>
    </section>

    ${mergeCard(logs, templates)}

    <section class="card settings-card">
      <h3 class="card-h">Backup</h3>
      <p>Everything is saved only on this device: ${templates.length} saved workout${templates.length === 1 ? '' : 's'}, ${logs.length} log${logs.length === 1 ? '' : 's'} and ${steps.length} day${steps.length === 1 ? '' : 's'} of steps. Export a backup now and then. Importing replaces everything here with the backup.</p>
      <div class="settings-actions">
        <button class="btn btn-dark" id="export">Export JSON</button>
        <button class="btn btn-outline" id="import">Import JSON</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
      <div class="status" id="status" hidden></div>
    </section>
  `;

  const status = ctx.app.querySelector('#status');
  const say = (msg, err = false) => {
    status.textContent = msg;
    status.classList.toggle('err', err);
    status.hidden = false;
  };

  ctx.app.querySelector('#units').addEventListener('click', async e => {
    const b = e.target.closest('[data-unit]');
    if (!b || b.dataset.unit === getUnit()) return;
    await db.setSetting('unit', b.dataset.unit);
    setUnitCache(b.dataset.unit);
    ctx.rerender();
  });

  ctx.app.querySelector('#export').addEventListener('click', async () => {
    try {
      const data = await db.exportAll();
      await saveFile(JSON.stringify(data, null, 2), `workouts-backup-${todayKey()}.json`);
      say('Backup exported.');
    } catch (err) {
      if (err.name !== 'AbortError') say(`Export failed: ${err.message}`, true);
    }
  });

  ctx.app.querySelectorAll('.merge-row').forEach(row => {
    const select = row.querySelector('select');
    const btn = row.querySelector('[data-merge]');
    select.addEventListener('change', () => { btn.disabled = !select.value; });
    btn.addEventListener('click', async () => {
      const from = row.querySelector('strong').textContent;
      const to = select.selectedOptions[0].textContent;
      const workout = select.selectedOptions[0].parentElement.label;
      if (!confirm(`Merge "${from}" into "${to}" (${workout})? Past logs will show "${to}" and count towards its history. Sets and weights aren't changed.`)) return;
      btn.disabled = true;
      await mergeExercise(row.dataset.key, select.value);
      await ctx.rerender();
      toast(`Merged ${from} into ${to}`);
    });
  });

  const fileIn = ctx.app.querySelector('#file');
  ctx.app.querySelector('#import').addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'workout-tracker') throw new Error("This file isn't a workout backup.");
      const ok = confirm(`Replace everything on this device with this backup (${data.templates?.length ?? 0} workouts, ${data.logs?.length ?? 0} logs, ${data.steps?.length ?? 0} days of steps)?`);
      if (!ok) return;
      await db.importAll(data);
      await migrateCardio();
      await linkAllLogs();
      setUnitCache(await db.getSetting('unit', 'kg'));
      await ctx.rerender();
      toast('Backup imported.');
    } catch (err) {
      say(err instanceof SyntaxError ? "Couldn't read that file. Is it a JSON backup?" : err.message, true);
    }
  });
}
