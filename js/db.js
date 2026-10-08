// Thin promise wrapper around IndexedDB. Data volumes are small (one person's
// workouts), so views load whole stores and filter in memory.

const DB_NAME = 'workout-tracker';
// v2 added `steps` (daily step counts, keyed by date).
const DB_VERSION = 2;
export const STORES = ['templates', 'logs', 'settings', 'steps'];

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('logs')) {
          const logs = db.createObjectStore('logs', { keyPath: 'id' });
          logs.createIndex('date', 'date');
          logs.createIndex('templateId', 'templateId');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('steps')) db.createObjectStore('steps', { keyPath: 'date' });
      };
      req.onsuccess = () => {
        // If a newer version of the app opens the database (e.g. another tab
        // after an update), let it upgrade instead of being blocked by us.
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAll(name) {
  return done((await store(name)).getAll());
}

export async function get(name, id) {
  return done((await store(name)).get(id));
}

export async function put(name, value) {
  return done((await store(name, 'readwrite')).put(value));
}

export async function del(name, id) {
  return done((await store(name, 'readwrite')).delete(id));
}

export async function putMany(name, values) {
  const db = await openDb();
  const tx = db.transaction(name, 'readwrite');
  const os = tx.objectStore(name);
  values.forEach(v => os.put(v));
  return txDone(tx);
}

export async function getSetting(key, fallback) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  return put('settings', { key, value });
}

export async function exportAll() {
  const [templates, logs, settings, steps] = await Promise.all(STORES.map(getAll));
  return {
    app: 'workout-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    templates,
    logs,
    settings,
    steps,
  };
}

// Steps for one day; an empty or zero count clears that day.
export function setSteps(date, steps) {
  return steps > 0 ? put('steps', { date, steps }) : del('steps', date);
}

// Replaces everything on the device with the backup's contents, in one transaction.
export async function importAll(data) {
  if (!data || data.app !== 'workout-tracker' || !Array.isArray(data.templates) || !Array.isArray(data.logs)) {
    throw new Error("This file isn't a workout backup.");
  }
  const db = await openDb();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  data.templates.forEach(t => tx.objectStore('templates').put(t));
  data.logs.forEach(l => tx.objectStore('logs').put(l));
  (data.settings || []).forEach(s => tx.objectStore('settings').put(s));
  // Backups from before step tracking have no `steps`.
  (data.steps || []).filter(s => s && s.date && s.steps > 0).forEach(s => tx.objectStore('steps').put(s));
  // A restored backup should never be re-seeded with sample templates.
  tx.objectStore('settings').put({ key: 'seeded', value: true });
  return txDone(tx);
}
