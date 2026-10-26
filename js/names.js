// Logs are linked to their saved workout (templateId) and each exercise to the
// workout's exercise (exId). Names shown for a log come from the current saved
// workout, so renaming updates every past log. Logs still keep the last known
// names, used when the workout or exercise has since been deleted.
// Numbers (sets, weights, distances, times) and notes always come from the log.
import * as db from './db.js';
import { isExerciseType, isTimed, normName } from './util.js';

function index(templates) {
  const byId = new Map(templates.map(t => [t.id, t]));
  const exById = new Map();
  for (const t of templates) for (const e of t.exercises || []) exById.set(e.id, e);
  return { byId, exById };
}

// Copies of the logs with the current workout title, exercise names and
// (between Strength and Core only, which are logged the same way) type.
export function withCurrentNames(logs, templates) {
  const { byId, exById } = index(templates);
  return logs.map(log => {
    const t = byId.get(log.templateId);
    const out = { ...log };
    if (t) {
      out.title = t.title;
      if (isExerciseType(t.type) && isExerciseType(log.type)) out.type = t.type;
    }
    if (log.exercises) {
      out.exercises = log.exercises.map(ex => {
        const te = exById.get(ex.exId);
        return te ? { ...ex, name: te.name } : ex;
      });
    }
    return out;
  });
}

export async function loadLogs() {
  const [logs, templates] = await Promise.all([db.getAll('logs'), db.getAll('templates')]);
  return withCurrentNames(logs, templates);
}

// Refreshes the last known names stored in logs from the current saved
// workouts, so they stay right if a workout or exercise is deleted later.
export async function stampNames(templates) {
  const all = templates ?? await db.getAll('templates');
  const logs = await db.getAll('logs');
  const fresh = withCurrentNames(logs, all);
  const changed = fresh.filter((l, i) => l.title !== logs[i].title || l.type !== logs[i].type
    || (l.exercises || []).some((e, j) => e.name !== logs[i].exercises[j].name));
  if (changed.length) await db.putMany('logs', changed);
}

/* ---------- Merge exercises ---------- */

// Exercise names in logs that aren't linked to any current saved workout's
// exercise: old spellings, exercises removed from a workout, or from deleted
// workouts. Grouped by name and measure (reps or time).
export function unmatchedExercises(logs, templates) {
  const { exById } = index(templates);
  const groups = new Map();
  for (const log of logs) {
    if (!isExerciseType(log.type)) continue;
    for (const ex of log.exercises || []) {
      if (ex.exId && exById.has(ex.exId)) continue;
      const key = `${normName(ex.name)}|${isTimed(ex) ? 'time' : 'reps'}`;
      if (!groups.has(key)) groups.set(key, { key, timed: isTimed(ex), spellings: new Map(), logIds: new Set() });
      const g = groups.get(key);
      const name = String(ex.name || '').trim();
      g.spellings.set(name, (g.spellings.get(name) || 0) + 1);
      g.logIds.add(log.id);
    }
  }
  return [...groups.values()].map(g => ({
    key: g.key,
    timed: g.timed,
    name: [...g.spellings].sort((a, b) => b[1] - a[1])[0][0],
    logs: g.logIds.size,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// Links every unmatched exercise in group `key` to the saved exercise `targetId`.
export async function mergeExercise(key, targetId) {
  const [logs, templates] = await Promise.all([db.getAll('logs'), db.getAll('templates')]);
  const { exById } = index(templates);
  const target = exById.get(targetId);
  if (!target) throw new Error('That exercise no longer exists.');
  const changed = [];
  for (const log of logs) {
    if (!isExerciseType(log.type)) continue;
    let dirty = false;
    for (const ex of log.exercises || []) {
      if (ex.exId && exById.has(ex.exId)) continue;
      if (`${normName(ex.name)}|${isTimed(ex) ? 'time' : 'reps'}` !== key) continue;
      ex.exId = target.id;
      ex.name = target.name;
      dirty = true;
    }
    if (dirty) changed.push(log);
  }
  if (changed.length) await db.putMany('logs', changed);
  return changed.length;
}
