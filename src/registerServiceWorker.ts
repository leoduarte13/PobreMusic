// Service Worker Registration and Lifecycle Manager for POBREMUSIC

export interface ServiceWorkerState {
  isRegistered: boolean;
  isReady: boolean;
  hasUpdate: boolean;
  isOffline: boolean;
  registration: ServiceWorkerRegistration | null;
}

type SWCallback = (state: ServiceWorkerState) => void;
const listeners: Set<SWCallback> = new Set();

let currentState: ServiceWorkerState = {
  isRegistered: false,
  isReady: false,
  hasUpdate: false,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  registration: null,
};

function notifyListeners() {
  listeners.forEach((cb) => cb({ ...currentState }));
}

/**
 * Subscribes to Service Worker and Online/Offline state changes
 */
export function subscribeToServiceWorker(callback: SWCallback): () => void {
  listeners.add(callback);
  callback({ ...currentState });
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Forces the waiting Service Worker to activate immediately
 */
export function applyServiceWorkerUpdate(): void {
  if (currentState.registration && currentState.registration.waiting) {
    currentState.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

/**
 * Registers the Service Worker in production / browser environment
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[SW] Service Workers not supported in this browser/environment.');
    return;
  }

  // Set up online/offline event listeners
  window.addEventListener('online', () => {
    currentState.isOffline = false;
    notifyListeners();
    window.dispatchEvent(new CustomEvent('pobremusic_online'));
  });

  window.addEventListener('offline', () => {
    currentState.isOffline = true;
    notifyListeners();
    window.dispatchEvent(new CustomEvent('pobremusic_offline'));
  });

  window.addEventListener('load', async () => {
    try {
      const swUrl = '/sw.js';
      const registration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
      
      currentState.isRegistered = true;
      currentState.registration = registration;
      notifyListeners();
      console.log('[SW] POBREMUSIC Service Worker registered with scope:', registration.scope);

      // Check if SW is already active and controlling page
      if (navigator.serviceWorker.controller) {
        currentState.isReady = true;
        notifyListeners();
      }

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New content is available; please refresh.
              console.log('[SW] New version available for POBREMUSIC.');
              currentState.hasUpdate = true;
              notifyListeners();
            } else {
              // Content is cached for offline use.
              console.log('[SW] Content cached for offline use.');
              currentState.isReady = true;
              notifyListeners();
            }
          }
        });
      });

      // Reload page when new SW takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    } catch (error) {
      console.warn('[SW] Service Worker registration failed:', error);
    }
  });
}
