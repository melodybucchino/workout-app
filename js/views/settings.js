import * as db from '../db.js';
import { linkExerciseIds, migrateCardio } from '../migrate.js';
import { getUnit, setUnitCache, todayKey, toast } from '../util.js';

async function saveFile(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  // On iPhone the share sheet ("Save to Files") is the most reliable way to keep a file.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
      await linkExerciseIds();
      setUnitCache(await db.getSetting('unit', 'kg'));
      await ctx.rerender();
      toast('Backup imported.');
    } catch (err) {
      say(err instanceof SyntaxError ? "Couldn't read that file. Is it a JSON backup?" : err.message, true);
    }
  });
}
