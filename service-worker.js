const CACHE = 'snapcal-v1';
const ASSETS = [
  '/', '/index.html',
  '/styles/style.css',
  '/scripts/main.js',
  '/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
});
self.addEventListener('fetch', (e)=>{
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(resp => {
      // cache new same-origin responses
      try {
        const url = new URL(request.url);
        if (url.origin === self.location.origin) {
          const clone = resp.clone();
          caches.open(CACHE).then(c=>c.put(request, clone));
        }
      } catch {}
      return resp;
    }).catch(()=> cached || new Response('Offline', {status: 503})))
  );
});
