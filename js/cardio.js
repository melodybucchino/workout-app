// Cardio activities. Everything about an activity (its fields, colour and any
// calculated value) lives here; screens are built from this config.
//
// To add an activity (e.g. Elliptical, Row), add an entry to ACTIVITIES. If it
// needs a field that doesn't exist yet, add that field to FIELDS too.
import { formatDuration, formatKm } from './util.js';

const num = v => String(Math.round(v * 10) / 10);
const thousands = v => Math.round(v).toLocaleString('en-GB');

// Log fields an activity can use. `input` picks the keyboard and rounding;
// `short` is how the value reads in one-line summaries.
export const FIELDS = {
  distanceKm: { label: 'Distance', unit: 'km', input: 'decimal', format: formatKm, short: v => `${formatKm(v)} km` },
  floors: { label: 'Floors', input: 'int', format: thousands, short: v => `${thousands(v)} floors` },
  elevationM: { label: 'Elevation', unit: 'm', input: 'int', format: thousands, short: v => `${thousands(v)} m elevation` },
  steps: { label: 'Steps', input: 'int', format: thousands, short: v => `${thousands(v)} steps` },
  incline: { label: 'Incline level', input: 'decimal', format: num, short: v => `incline ${num(v)}` },
  resistance: { label: 'Resistance', input: 'decimal', format: num, short: v => `resistance ${num(v)}` },
  level: { label: 'Level', input: 'decimal', format: num, short: v => `level ${num(v)}` },
};

// Values worked out from a log, compared with last time.
export const DERIVED = {
  pace: {
    label: 'Pace',
    unit: '/km',
    calc: l => (l.distanceKm > 0 && l.durationSec > 0 ? l.durationSec / l.distanceKm : null),
    format: formatDuration,
    // Positive = better. Lower pace is faster.
    gain: (now, before) => Math.round(before - now),
    diffText: d => `${Math.abs(d)} s/km ${d > 0 ? 'faster' : 'slower'}`,
  },
  speed: {
    label: 'Avg speed',
    unit: 'km/h',
    calc: l => (l.distanceKm > 0 && l.durationSec > 0 ? l.distanceKm / (l.durationSec / 3600) : null),
    format: v => v.toFixed(1),
    gain: (now, before) => Math.round((now - before) * 10) / 10,
    diffText: d => `${Math.abs(d).toFixed(1)} km/h ${d > 0 ? 'faster' : 'slower'}`,
  },
};

// Every cardio log also records duration, how it felt and notes.
export const ACTIVITIES = {
  run: { label: 'Run', color: '#2F6FEB', required: ['distanceKm'], optional: ['elevationM'], derived: 'pace' },
  walk: { label: 'Walk', color: '#85B7EB', required: ['distanceKm'], optional: ['steps', 'incline'], derived: 'pace' },
  bike: { label: 'Bike', color: '#0C447C', required: ['distanceKm'], optional: ['resistance'], derived: 'speed' },
  stairmaster: { label: 'StairMaster', color: '#185FA5', required: ['floors'], optional: ['level', 'steps'] },
};
export const ACTIVITY_ORDER = Object.keys(ACTIVITIES);
export const DEFAULT_ACTIVITY = 'run';

export const activityOf = x => ACTIVITIES[x?.activity] || ACTIVITIES[DEFAULT_ACTIVITY];
export const derivedOf = x => DERIVED[activityOf(x).derived] || null;
export const fieldsOf = x => [...activityOf(x).required, ...activityOf(x).optional];

export const fieldLabel = key => {
  const f = FIELDS[key];
  return f.unit ? `${f.label} (${f.unit})` : f.label;
};

// "5.2 km · 28:45 · 5:32 /km · incline 8" — only values that are filled in.
export function cardioSummary(log, { withDerived = false } = {}) {
  const act = activityOf(log);
  const bits = act.required.filter(k => log[k] != null).map(k => FIELDS[k].short(log[k]));
  if (log.durationSec) bits.push(formatDuration(log.durationSec));
  const der = derivedOf(log);
  const dv = der?.calc(log);
  if (withDerived && dv != null) bits.push(`${der.format(dv)} ${der.unit}`);
  act.optional.filter(k => log[k] != null).forEach(k => bits.push(FIELDS[k].short(log[k])));
  return bits.join(' · ');
}

// What a log of this activity records, for the Edit workout screen.
export function recordsList(activity) {
  const act = ACTIVITIES[activity] || ACTIVITIES[DEFAULT_ACTIVITY];
  return [
    ...act.required.map(fieldLabel),
    'Time',
    ...(act.derived ? [`${DERIVED[act.derived].label} (calculated)`] : []),
    ...act.optional.map(k => `${fieldLabel(k)} · optional`),
    'How it felt',
    'Notes',
  ];
}
