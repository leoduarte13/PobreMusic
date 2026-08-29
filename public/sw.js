// Service Worker for POBREMUSIC
// Caches UI assets, track metadata, album covers, and API responses for complete offline playback experience.

const CACHE_VERSION = 'v1.1.0';
const SHELL_CACHE = `pobremusic-shell-${CACHE_VERSION}`;
const METADATA_CACHE = `pobremusic-metadata-${CACHE_VERSION}`;
const IMAGE_CACHE = `pobremusic-images-${CACHE_VERSION}`;

// Core static assets to pre-cache on install for instant offline loading
const STATIC_APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pobremusic_icon.svg',
  '/pobremusic_icon.png',
  '/pobremusic_icon_192.png',
  '/pobremusic_icon_512.png',
  '/apple-touch-icon.png',
  '/favicon.png'
];

// Max items in image cache
const MAX_IMAGE_CACHE_ENTRIES = 120;

// Helper: Trim cache to limit size
async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      // Remove oldest entries
      const toDelete = keys.slice(0, keys.length - maxEntries);
      await Promise.all(toDelete.map((req) => cache.delete(req)));
    }
  } catch (err) {
    console.warn('[SW] Cache trim notice:', err);
  }
}

// 1. INSTALL EVENT
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      console.log('[SW] Installing POBREMUSIC Service Worker...', CACHE_VERSION);
      const cache = await caches.open(SHELL_CACHE);
      try {
        await cache.addAll(STATIC_APP_SHELL);
        console.log('[SW] App Shell pre-cached successfully.');
      } catch (err) {
        console.warn('[SW] Non-blocking notice during shell pre-cache:', err);
      }
      // Activate immediately without waiting for existing clients to close
      return self.skipWaiting();
    })()
  );
});

// 2. ACTIVATE EVENT
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      console.log('[SW] Activating POBREMUSIC Service Worker...', CACHE_VERSION);
      const expectedCaches = [SHELL_CACHE, METADATA_CACHE, IMAGE_CACHE];
      const keys = await caches.keys();

      await Promise.all(
        keys.map((key) => {
          if (!expectedCaches.includes(key)) {
            console.log('[SW] Removing old cache version:', key);
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );

      // Claim all clients immediately so they use the new SW without reload
      await self.clients.claim();
      console.log('[SW] POBREMUSIC Service Worker claimed clients.');
    })()
  );
});

// 3. FETCH EVENT
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests and chrome-extension schemes
  if (req.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // A. Image & Cover Art Caching (Stale-While-Revalidate with Cache Fallback)
  if (
    req.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|gif|ico)$/i) ||
    url.hostname.includes('unsplash.com') ||
    url.hostname.includes('scdn.co') ||
    url.hostname.includes('spotifycdn.com') ||
    url.hostname.includes('ytimg.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('mzstatic.com')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE);
        const cachedResponse = await cache.match(req);

        // Fetch in background to update cache
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
              cache.put(req, networkResponse.clone());
              trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE_ENTRIES);
            }
            return networkResponse;
          })
          .catch(() => null);

        // Return cached immediately if found, else wait for network
        if (cachedResponse) {
          return cachedResponse;
        }

        const netRes = await fetchPromise;
        if (netRes) return netRes;

        // Fallback placeholder image if totally offline and not in cache
        const fallbackSvg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300" fill="#18181b">
            <rect width="300" height="300" fill="#18181b"/>
            <circle cx="150" cy="150" r="60" fill="#27272a"/>
            <circle cx="150" cy="150" r="24" fill="#10b981"/>
            <text x="150" y="240" font-family="sans-serif" font-size="14" fill="#71717a" text-anchor="middle" font-weight="600">POBREMUSIC OFFLINE</text>
          </svg>
        `;
        return new Response(fallbackSvg, {
          headers: { 'Content-Type': 'image/svg+xml' }
        });
      })()
    );
    return;
  }

  // B. Track Metadata & API Routes Caching (Network First -> Fallback to Cache)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('open.spotify.com') ||
    url.hostname.includes('itunes.apple.com')
  ) {
    // Avoid caching auth or status write actions
    if (
      url.pathname.includes('/auth/') ||
      url.pathname.includes('/set-credentials') ||
      url.pathname.includes('/login') ||
      url.pathname.includes('/callback')
    ) {
      return;
    }

    event.respondWith(
      (async () => {
        const cache = await caches.open(METADATA_CACHE);
        try {
          // Attempt network fetch first with a 4s timeout for snappy offline fallback
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          const networkResponse = await fetch(req, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkResponse && networkResponse.ok) {
            // Cache successful metadata response for offline use
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          // Network failed or timed out: serve cached metadata if available
          const cachedResponse = await cache.match(req);
          if (cachedResponse) {
            console.log('[SW] Serving cached metadata response for:', req.url);
            return cachedResponse;
          }

          // Return graceful JSON error response if neither network nor cache succeeded
          return new Response(
            JSON.stringify({
              sucesso: false,
              offline: true,
              error: 'Você está offline e esta música/playlist ainda não foi armazenada em cache.',
              modo: 'offline_empty',
              faixas: []
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      })()
    );
    return;
  }

  // C. Google Fonts & Third Party CDNs (Stale-While-Revalidate)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes.ok) cache.put(req, networkRes.clone());
            return networkRes;
          })
          .catch(() => null);

        return cached || (await fetchPromise);
      })()
    );
    return;
  }

  // D. App Shell & Static Assets (Navigation & JS/CSS Bundles)
  // Cache First with Network Fallback & Update
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cachedResponse = await cache.match(req);

      if (cachedResponse) {
        // Fetch new version in background if online to keep app updated
        fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put(req, networkResponse.clone());
            }
          })
          .catch(() => {
            // Offline - ignore background refresh failure
          });
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          // Cache Vite/Static scripts and stylesheets dynamically
          if (
            req.destination === 'script' ||
            req.destination === 'style' ||
            req.destination === 'document' ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css')
          ) {
            cache.put(req, networkResponse.clone());
          }
        }
        return networkResponse;
      } catch (err) {
        // If navigation request fails offline, fallback to /index.html app shell
        if (req.mode === 'navigate') {
          const fallbackShell = await cache.match('/index.html') || await cache.match('/');
          if (fallbackShell) {
            return fallbackShell;
          }
        }
        throw err;
      }
    })()
  );
});

// 4. MESSAGE EVENT
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_ALL_CACHES') {
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }

  if (event.data && event.data.type === 'GET_CACHE_STATS') {
    (async () => {
      try {
        const shell = await caches.open(SHELL_CACHE);
        const meta = await caches.open(METADATA_CACHE);
        const img = await caches.open(IMAGE_CACHE);

        const shellKeys = await shell.keys();
        const metaKeys = await meta.keys();
        const imgKeys = await img.keys();

        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({
            version: CACHE_VERSION,
            shellCount: shellKeys.length,
            metadataCount: metaKeys.length,
            imageCount: imgKeys.length,
            totalEntries: shellKeys.length + metaKeys.length + imgKeys.length
          });
        }
      } catch (e) {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ error: String(e) });
        }
      }
    })();
  }
});
