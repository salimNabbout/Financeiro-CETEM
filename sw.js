// Service Worker — cache app shell para uso offline.
const CACHE = 'cockpit-fin-v23';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/db.js', './js/kpis.js', './js/ui.js', './js/reports.js', './js/ofx.js', './js/impostos.js', './js/pix.js', './js/views.js', './js/app.js',
  './icons/icon-192.svg', './icons/icon-512.svg', './icons/logo-cetem.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
