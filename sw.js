// Offline support: every app file is cached on install. Requests are served
// from the cache straight away and refreshed in the background, so an update
// shows up on the next launch. Bump VERSION when files are added or removed.
const VERSION = 'v9';
const CACHE = `workouts-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/db.js',
  'js/util.js',
  'js/seed.js',
  'js/migrate.js',
  'js/views/calendar.js',
  'js/views/day.js',
  'js/views/add.js',
  'js/views/log.js',
  'js/views/library.js',
  'js/views/edit.js',
  'js/views/settings.js',
  'js/views/progress.js',
  'fonts/bricolage-latin.woff2',
  'fonts/bricolage-latin-ext.woff2',
  'fonts/dmsans-latin.woff2',
  'fonts/dmsans-latin-ext.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages allows 10 min),
  // so a new version never gets stored with stale files.
  event.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('workouts-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './' : req;

  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key, { ignoreSearch: true });
    // Navigation requests can't be re-initialised, so fetch them by URL.
    const network = fetch(req.mode === 'navigate' ? new Request(req.url) : req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || new Response('Offline', { status: 503 });
  }));
});
