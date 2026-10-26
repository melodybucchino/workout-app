// Strength history across all logs, for the Progress tab and "New PR!" on the log screen.
import { byOrder, normName, isTimed, isPerSide, isExerciseType, todayKey, addDays, toKey } from './util.js';

// Heaviest set of an exercise, ties broken by reps. Null if no set has a weight.
export function bestSet(ex) {
  let best = null;
  for (const s of ex?.sets || []) {
    if (!(s.kg > 0)) continue;
    if (!best || better(s, best)) best = { kg: s.kg, reps: s.reps ?? null };
  }
  return best;
}

// More weight, or the same weight for more reps.
export function better(a, b) {
  if (!b) return !!a;
  if (!a) return false;
  if (Math.abs(a.kg - b.kg) > 1e-6) return a.kg > b.kg;
  return (a.reps || 0) > (b.reps || 0);
}

// Keys an exercise is known by: its link to the saved exercise and its name.
const keysOf = ex => [...(ex.exId ? [`id:${ex.exId}`] : []), `n:${normName(ex.name)}`];

// Weighted (reps) exercises grouped into one history each. The same exercise in
// different workouts, or renamed later, ends up in one group: anything sharing a
// link or a name is joined. Groups come back most recently done first.
export function exerciseHistories(logs) {
  const parent = new Map();
  const find = k => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    parent.set(k, r);
    return r;
  };
  const entries = [];
  for (const log of [...logs].sort(byOrder)) {
    if (!isExerciseType(log.type)) continue;
    for (const ex of log.exercises || []) {
      if (isTimed(ex) || !ex.name) continue;
      const best = bestSet(ex);
      if (!best) continue;
      const keys = keysOf(ex);
      keys.forEach(k => parent.set(find(k), find(keys[0])));
      entries.push({ log, ex, best, keys });
    }
  }

  const groups = new Map();
  for (const e of entries) {
    const root = find(e.keys[0]);
    if (!groups.has(root)) groups.set(root, { keys: new Set(), sessions: [] });
    const g = groups.get(root);
    e.keys.forEach(k => g.keys.add(k));
    g.sessions.push({ date: e.log.date, log: e.log, ex: e.ex, best: e.best });
  }

  const weekAgo = toKey(addDays(new Date(), -6));
  const list = [...groups.values()].map(g => {
    const last = g.sessions[g.sessions.length - 1];
    // The record is the first session to reach the best set; `beat` says
    // whether it improved on an earlier one (a first-ever session doesn't count).
    let record = null;
    let beat = false;
    for (const s of g.sessions) {
      if (better(s.best, record?.best)) { beat = !!record; record = s; }
    }
    return {
      id: [...g.keys].sort()[0],
      keys: g.keys,
      name: displayName(g.sessions),
      perSide: isPerSide(last.ex),
      sessions: g.sessions,
      record,
      isNew: beat && record.date >= weekAgo && record.date <= todayKey(),
    };
  });
  return list.sort((a, b) => byOrder(b.sessions.at(-1).log, a.sessions.at(-1).log));
}

// The latest name, spelled the way it's been written most often ("Hip Thrust" over "hip thrust").
function displayName(sessions) {
  const latest = normName(sessions.at(-1).ex.name);
  const counts = new Map();
  sessions.filter(s => normName(s.ex.name) === latest)
    .forEach(s => counts.set(s.ex.name.trim(), (counts.get(s.ex.name.trim()) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export const historyFor = (histories, ex) => histories.find(h => keysOf(ex).some(k => h.keys.has(k))) || null;

// For each exercise in `log`, the best set from logs before it (null if never done).
export function priorBests(logs, log) {
  const earlier = logs.filter(l => l.id !== log.id && byOrder(l, log) < 0);
  const histories = exerciseHistories(earlier);
  return (log.exercises || []).map(ex => (isTimed(ex) ? null : historyFor(histories, ex)?.record?.best || null));
}
