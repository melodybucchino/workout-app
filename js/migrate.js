import * as db from './db.js';
import { normName } from './util.js';

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
