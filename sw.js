// Synopsical — Service Worker (#7 Offline App Shell & PWA)
//
// Caches the static application shell (HTML, CSS, ES modules, and icons)
// using a network-first-with-cache-fallback strategy for code/HTML so
// updates appear immediately when online, while reading, searching, and
// drafting in Sample Mode or cached sessions continue to work offline.

const CACHE_NAME = 'synopsical-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './info.html',
  './pricing.html',
  './privacy.html',
  './style.css',
  './config.js',
  './app.js',
  './homepage.js',
  './newsletter.js',
  './lib/backlinks.mjs',
  './lib/import-parser.mjs',
  './lib/retention.mjs',
  './lib/rich-text.mjs',
  './lib/sample-compendium.mjs',
  './lib/sharing.mjs',
  './manifest.json',
  './favicon.ico',
  './apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-192.png',
  './assets/synopsical-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
