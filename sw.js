/* ═══════════════════════════════════════════════════════════════
   sw.js — offline shell.

   The app is a prototype with no backend, so everything it needs is
   static. Precache the shell on install; serve it cache-first after
   that. Fonts come from a CDN, so they get cached on first use.

   Bump CACHE when any shell file changes — the old cache is dropped
   on activate.
   ═══════════════════════════════════════════════════════════════ */
const CACHE = 'coach-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './vendor/gsap.min.js',
  './vendor/Draggable.min.js',
  './vendor/Flip.min.js',
  './js/data.js',
  './js/store.js',
  './js/ui.js',
  './js/charts.js',
  './js/views/dashboard.js',
  './js/views/schedule.js',
  './js/views/progress.js',
  './js/views/coach.js',
  './js/logs/strength.js',
  './js/logs/session.js',
  './js/logs/onboard.js',
  './js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* one miss shouldn't fail the whole install */
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* navigations: network first so a deploy shows up, shell as the fallback */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      /* stash same-origin assets and the font CDN as they're used */
      if (res.ok && (req.url.startsWith(self.registration.scope) || /fonts\.(googleapis|gstatic)\.com/.test(req.url))) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
