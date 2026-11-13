/* VITALIS service worker: hand-written, no dependencies.
 * - Precaches the app shell + every hashed build asset (list injected at build time).
 * - Navigations: network-first, falling back to the cached shell (works fully offline).
 * - Static assets: cache-first. Google Fonts: stale-while-revalidate.
 * - Never caches cross-origin API calls (e.g. the optional AI layer).
 */
const VERSION = '__VERSION__';
const PRECACHE = self.__PRECACHE__ || ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];
const SHELL = `vitalis-shell-${VERSION}`;
const RUNTIME = 'vitalis-runtime';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vitalis-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html', { ignoreVary: true }).then((r) => r || caches.match('/', { ignoreVary: true }))),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(RUNTIME).then((c) =>
        c.match(req, { ignoreVary: true }).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              c.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || net;
        }),
      ),
    );
  }
});
