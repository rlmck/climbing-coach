/* ═══════════════════════════════════════════════════════════════
   sw.js — offline shell.

   The app is a prototype with no backend, so everything it needs is
   static. It is also under active review, so freshness beats speed:
   same-origin files are network-first and fall back to the cache
   only when the network fails. That way a redeploy reaches a phone
   on the next launch instead of waiting for this file to change.

   Fonts are the exception — they never change, so they stay
   cache-first once fetched.
   ═══════════════════════════════════════════════════════════════ */
const CACHE = 'coach-v36';

/* Which build is actually running, asked for by the app and shown in the
   sidebar. "Is my phone up to date" is otherwise unanswerable from the
   phone, which is the only place it ever gets asked. */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'version' && e.ports[0]) {
    e.ports[0].postMessage({ version: CACHE });
  }
});

/* "Network first" has to mean the network, and plain fetch() does not:
   it goes through the browser's own HTTP cache, so a max-age on a file
   is enough to answer the request without a single byte leaving the
   phone — and this worker would then dutifully hand back a stale file
   believing it had just fetched it. That is precisely what happened,
   and no amount of relaunching shifted it, because a response already
   stored with a week on it stays valid for a week whatever the server
   says next.

   `cache: 'no-cache'` forces a conditional request: the file is still
   stored, still returns 304 and a few hundred bytes when nothing has
   changed, but the server is always the one that decides. It also
   reaches past whatever is already sitting in the cache with a long
   expiry on it, which is the only way to undo one. */
function fresh(req) {
  try { return fetch(req, { cache: 'no-cache' }); }
  catch (err) { return fetch(req); }        // older browsers: better stale than broken
}

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './vendor/gsap.min.js',
  './vendor/Flip.min.js',
  './js/config.js',
  './js/firebase.js',
  './js/cftest.js',
  './js/data.js',
  /* The whole of Portland, precached rather than fetched on demand.
     A crag is exactly where there is no signal, and a route search
     that only works at home is not a route search. */
  './js/crags.data.js',
  './js/crags.js',
  './js/store.js',
  './js/repo.js',
  './js/ui.js',
  './js/charts.js',
  './js/views/signin.js',
  './js/views/dashboard.js',
  './js/views/schedule.js',
  './js/views/progress.js',
  './js/views/coach.js',
  './js/views/invite.js',
  './js/logs/strength.js',
  './js/logs/session.js',
  './js/logs/loads.js',
  './js/logs/onboard.js',
  './js/logs/cfupload.js',
  './js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* Through fresh() rather than cache.add(), so a worker installing
         itself cannot seed its brand-new cache out of the browser's old
         one. One miss shouldn't fail the whole install. */
      .then(c => Promise.allSettled(
        SHELL.map(u => fresh(new Request(u)).then(r => r.ok ? c.put(u, r) : null))
      ))
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
      fresh(req).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  const save = res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  };

  /* fonts and the pinned Firebase SDK: cache-first. Both are versioned
     URLs that never change contents, and the SDK has to be on disk or
     the app can't start without a connection — which is the one thing
     offline-first can't afford. */
  if (/fonts\.(googleapis|gstatic)\.com/.test(req.url) ||
      /gstatic\.com\/firebasejs\//.test(req.url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(save)));
    return;
  }

  /* Firestore's own traffic is long-lived streams and must never be
     touched by a cache. */
  if (/(firestore|identitytoolkit|googleapis)\.com/.test(req.url)) return;

  /* everything else: network-first, cache as the offline fallback */
  e.respondWith(
    fresh(req).then(save).catch(() => caches.match(req))
  );
});
