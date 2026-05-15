const CACHE_NAME = 'bbc2026-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './assets/logo.jpeg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always fetch JS files from network — never serve stale cached scripts
  if (e.request.url.endsWith('.js')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
