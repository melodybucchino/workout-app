import * as db from './db.js';
import { normName } from './util.js';
import { stampNames } from './names.js';

// Logs made before exercises were linked by id only carry the exercise name.
// Link them to their saved workout's exercises (by name, while names still
// match) so renaming an exercise later keeps its history. Only adds the hidden
// link; names, sets and weights are untouched. Safe to run on every launch.
export async function linkExerciseIds() {
  const [templates, logs] = await Promise.all([db.getAll('templates'), db.getAll('logs')]);
  const byId = new Map(templates.map(t => [t.id, t]));
  const changed = [];
  for (const log of logs) {
    const t = byId.get(log.templateId);
    if (!t || !log.exercises) continue;
    let dirty = false;
    for (const ex of log.exercises) {
      if (ex.exId) continue;
      const match = (t.exercises || []).find(e => normName(e.name) === normName(ex.name));
      if (match) { ex.exId = match.id; dirty = true; }
    }
    if (dirty) changed.push(log);
  }
  if (changed.length) await db.putMany('logs', changed);
}

// Run and Walk used to be workout types of their own. They're now activities
// under Cardio: { type: 'run' } becomes { type: 'cardio', activity: 'run' }.
// Every other field (distance, time, incline, feel, notes) is kept as is.
// Safe to run on every launch.
export async function migrateCardio() {
  const toCardio = item => {
    if (item.type !== 'run' && item.type !== 'walk') return false;
    item.activity = item.type;
    item.type = 'cardio';
    return true;
  };
  const [templates, logs] = await Promise.all([db.getAll('templates'), db.getAll('logs')]);
  const t = templates.filter(toCardio);
  const l = logs.filter(toCardio);
  if (t.length) await db.putMany('templates', t);
  if (l.length) await db.putMany('logs', l);
}

// Logs whose saved workout was deleted and re-created point at an id that no
// longer exists. Re-link them when exactly one saved workout of the same kind
// has exactly the same name; otherwise leave them under their last known name.
export async function linkLogsToTemplates() {
  const [templates, logs] = await Promise.all([db.getAll('templates'), db.getAll('logs')]);
  const ids = new Set(templates.map(t => t.id));
  const changed = [];
  for (const log of logs) {
    if (ids.has(log.templateId)) continue;
    const matches = templates.filter(t => normName(t.title) === normName(log.title)
      && t.type === log.type && (t.activity ?? null) === (log.activity ?? null));
    if (matches.length === 1) {
      log.templateId = matches[0].id;
      changed.push(log);
    }
  }
  if (changed.length) await db.putMany('logs', changed);
}

// One-time update that links past logs to their saved workouts so names follow
// the saved workout. Run after a backup has been saved (see the calendar).
// Exercises that don't match by exact name are left for Settings → Merge exercises.
export const LINKED_FLAG = 'linkedLogs';
export async function needsLinkMigration() {
  if (await db.getSetting(LINKED_FLAG, false)) return false;
  if ((await db.getAll('logs')).length) return true;
  await db.setSetting(LINKED_FLAG, true);
  return false;
}
export async function linkAllLogs() {
  await linkLogsToTemplates();
  await linkExerciseIds();
  await stampNames();
}
export async function runLinkMigration() {
  await linkAllLogs();
  await db.setSetting(LINKED_FLAG, true);
}
