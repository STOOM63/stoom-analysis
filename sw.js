const CACHE = 'analysis-v2.0.0';
const CORE = [
  './','./index.html','./manifest.webmanifest','./assets/favicon.svg','./assets/css/styles.css',
  './assets/js/app.js','./assets/js/core/utils.js','./assets/js/core/storage.js','./assets/js/core/importer.js','./assets/js/core/analytics.js','./assets/js/core/demo.js'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok || response.type === 'opaque') {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
    }
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
