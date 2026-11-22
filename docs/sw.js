// Glassware's site as an installed app. Pages come from the network as usual and a copy of each one you open is
// kept, so it still shows when you're offline. Everything else (the trailer, images, the scripts) goes straight to the network.
const CACHE = 'glassware-pages';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || r.mode !== 'navigate') return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || caches.match(new URL('./', self.registration.scope)))));
});
