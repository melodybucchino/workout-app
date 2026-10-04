import * as db from './db.js';
import { uid } from './util.js';

// The saved workouts from the design, loaded once on first launch (no logs).
const SEED = [
  { type: 'strength', title: 'Glute + Quads', exercises: ['Hip Thrust', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Leg Press', 'Cable Kickback'] },
  { type: 'strength', title: 'Upper Body Push', exercises: ['Bench Press', 'Shoulder Press', 'Dips', 'Incline Dumbbell Press', 'Tricep Pushdown'] },
  { type: 'strength', title: 'Hamstrings + Back', exercises: ['Deadlift', 'Lat Pulldown', 'Seated Row', 'Hamstring Curl'] },
  { type: 'cardio', activity: 'run', title: 'Easy Run' },
  { type: 'cardio', activity: 'run', title: 'Intervals' },
  { type: 'cardio', activity: 'walk', title: 'Walk' },
  { type: 'mobility', title: 'Hip + Spine Flow', durationMin: 20, movements: ['Cat-Cow', "World's Greatest Stretch", '90/90 Hip Switch', 'Thoracic Rotation', 'Pigeon Pose', "Child's Pose"] },
  { type: 'class', title: 'Pilates', durationMin: 50 },
  { type: 'class', title: 'Spin', durationMin: 45 },
];

export async function seedIfNeeded() {
  if (await db.getSetting('seeded', false)) return;
  const now = Date.now();
  const templates = SEED.map((s, i) => ({
    id: uid() + i,
    type: s.type,
    ...(s.activity ? { activity: s.activity } : {}),
    title: s.title,
    exercises: (s.exercises || []).map(name => ({ id: uid() + name.length, name })),
    movements: s.movements || [],
    durationMin: s.durationMin ?? null,
    createdAt: now + i,
  }));
  await db.putMany('templates', templates);
  await db.setSetting('seeded', true);
}
