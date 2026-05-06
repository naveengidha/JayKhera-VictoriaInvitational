const CACHE_NAME = 'bbc2026-v1.1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './js/app.js',
  './js/scoring.js',
  './js/storage.js',
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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});
