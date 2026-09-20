const CACHE='asha-saathi-v1.0.0';
const ASSETS=['./','./index.html','./style.css','./app.mjs','./domain.mjs','./vault.mjs','./icons.mjs','./demo.mjs','./assets/logo.svg','./assets/icon-192.png','./assets/icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;const allowed=ASSETS.some(p=>new URL(p,self.registration.scope).pathname===u.pathname);if(!allowed)return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});
