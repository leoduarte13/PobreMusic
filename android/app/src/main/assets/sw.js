// Minimal PWA service worker. API and media requests always use the network.
const CACHE='pobremusic-v2';
const SHELL=['/','/index.html','/manifest.json','/pobremusic_icon.svg','/pobremusic_icon.png','/pobremusic_icon_192.png','/pobremusic_icon_512.png','/apple-touch-icon.png','/favicon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.hostname.includes('youtube.com')||u.hostname.includes('googlevideo.com')||u.hostname.includes('ytimg.com')||u.hostname.includes('open.spotify.com')) return;
  if(e.request.mode==='navigate') e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));
});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
