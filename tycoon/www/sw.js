// Offline cache for the web/PWA build (not used inside the native apps).
const CACHE = 'yum-empire-v3';
const ASSETS = [
  './', './index.html', './privacy.html', './css/style.css', './vendor/three.min.js', './js/engine.js', './js/platform.js', './js/world.js', './js/game.js',
  './fonts/lilita-one-latin-400-normal.woff2', './fonts/nunito-latin-700-normal.woff2', './fonts/nunito-latin-900-normal.woff2',
  './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network first so updates arrive quickly, cache as fallback for offline play.
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
