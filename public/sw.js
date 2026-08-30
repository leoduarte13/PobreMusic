// Service Worker for POBREMUSIC
// Caches the app shell, images and safe metadata. API requests always use the network.
const CACHE_VERSION = 'v1.2.0';
const SHELL_CACHE = `pobremusic-shell-${CACHE_VERSION}`;
const METADATA_CACHE = `pobremusic-metadata-${CACHE_VERSION}`;
const IMAGE_CACHE = `pobremusic-images-${CACHE_VERSION}`;
const STATIC_APP_SHELL = ['/', '/index.html', '/manifest.json', '/pobremusic_icon.svg', '/pobremusic_icon.png', '/pobremusic_icon_192.png', '/pobremusic_icon_512.png', '/apple-touch-icon.png', '/favicon.png'];
const MAX_IMAGE_CACHE_ENTRIES = 120;

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) await Promise.all(keys.slice(0, keys.length - maxEntries).map(req => cache.delete(req)));
  } catch (err) { console.warn('[SW] Cache trim:', err); }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try { await cache.addAll(STATIC_APP_SHELL); } catch (err) { console.warn('[SW] Shell pre-cache:', err); }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const expected = [SHELL_CACHE, METADATA_CACHE, IMAGE_CACHE];
    await Promise.all((await caches.keys()).map(key => expected.includes(key) ? Promise.resolve() : caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.protocol.startsWith('chrome-extension')) return;

  // NEVER intercept application APIs. The server must return the real HTTP status/body.
  // This prevents a stale service worker from converting a server error into a fake
  // "offline and not cached" response.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Spotify/Audius/YouTube audio streams must also go directly to the network.
  if (url.hostname.includes('audius.co') || url.hostname.includes('audius-content-node') || url.pathname.includes('/stream')) return;

  if (req.destination === 'image' || /\.(png|jpg|jpeg|svg|webp|gif|ico)$/i.test(url.pathname) || url.hostname.includes('unsplash.com') || url.hostname.includes('scdn.co') || url.hostname.includes('spotifycdn.com') || url.hostname.includes('ytimg.com') || url.hostname.includes('youtube.com') || url.hostname.includes('mzstatic.com')) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE_ENTRIES); }
        return res;
      }).catch(() => null);
      if (cached) return cached;
      const res = await network;
      if (res) return res;
      return new Response('', { status: 503, statusText: 'Image unavailable' });
    })());
    return;
  }

  // Safe metadata caching for external metadata pages only. Same-origin APIs are excluded above.
  if (url.hostname.includes('open.spotify.com') || url.hostname.includes('itunes.apple.com')) {
    event.respondWith((async () => {
      const cache = await caches.open(METADATA_CACHE);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(req, { signal: controller.signal });
        clearTimeout(timeout);
        if (response?.ok) cache.put(req, response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return cached || await network;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(req);
    if (cached) {
      fetch(req).then(res => { if (res?.ok) cache.put(req, res.clone()); }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(req);
      if (response?.ok && (req.destination === 'script' || req.destination === 'style' || req.destination === 'document' || /\.(js|css)$/i.test(url.pathname))) cache.put(req, response.clone());
      return response;
    } catch (err) {
      if (req.mode === 'navigate') {
        const fallback = await cache.match('/index.html') || await cache.match('/');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_ALL_CACHES') caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => event.ports?.[0]?.postMessage({ success: true }));
  if (event.data?.type === 'GET_CACHE_STATS') (async () => {
    try {
      const shell = await caches.open(SHELL_CACHE), meta = await caches.open(METADATA_CACHE), img = await caches.open(IMAGE_CACHE);
      const shellKeys = await shell.keys(), metaKeys = await meta.keys(), imgKeys = await img.keys();
      event.ports?.[0]?.postMessage({ version: CACHE_VERSION, shellCount: shellKeys.length, metadataCount: metaKeys.length, imageCount: imgKeys.length, totalEntries: shellKeys.length + metaKeys.length + imgKeys.length });
    } catch (e) { event.ports?.[0]?.postMessage({ error: String(e) }); }
  })();
});
