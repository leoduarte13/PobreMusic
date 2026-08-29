import { PlaylistData, Track, SavedPlaylist } from '../types';

const STORAGE_KEYS = {
  LAST_PLAYED_PLAYLIST: 'pobremusic_last_played_playlist',
  CACHED_PLAYLISTS: 'pobremusic_offline_playlists',
  RECENT_PLAYLISTS_HISTORY: 'pobremusic_recent_playlists_history',
  OFFLINE_TRACKS_STORE: 'pobremusic_offline_tracks_store',
  SERVICE_WORKER_STATUS: 'pobremusic_sw_status',
};

const MAX_CACHED_PLAYLISTS = 20;
const MAX_CACHED_HISTORY = 30;

export interface OfflineCacheStats {
  totalPlaylists: number;
  totalTracks: number;
  lastSyncTimestamp: number;
  lastPlayedPlaylistName: string | null;
  storageSizeBytes: number;
  isServiceWorkerActive: boolean;
}

/**
 * Normalizes playlist ID or URL for key lookup
 */
export function normalizePlaylistKey(idOrUrl: string): string {
  if (!idOrUrl) return '';
  const trimmed = idOrUrl.trim().toLowerCase();
  // Extract id from url if applicable
  const match = trimmed.match(/(?:playlist|album|track)\/([a-zA-Z0-9]+)/i);
  if (match && match[1]) return match[1].toLowerCase();
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Automatically caches a loaded playlist's metadata and track list in offline storage
 */
export function cachePlaylistMetadata(playlist: PlaylistData): void {
  if (!playlist || !playlist.faixas || playlist.faixas.length === 0) return;

  try {
    const key = normalizePlaylistKey(playlist.playlist_id || playlist.nome_playlist);
    if (!key) return;

    // 1. Get existing cached playlists map
    const existingRaw = localStorage.getItem(STORAGE_KEYS.CACHED_PLAYLISTS);
    const cachedMap: Record<string, PlaylistData & { cachedAt: number }> = existingRaw
      ? JSON.parse(existingRaw)
      : {};

    // 2. Enrich and store playlist
    cachedMap[key] = {
      ...playlist,
      cachedAt: Date.now(),
      modo: 'offline_cached',
    };

    // Limit stored playlists to avoid storage quota errors
    const keys = Object.keys(cachedMap);
    if (keys.length > MAX_CACHED_PLAYLISTS) {
      // Sort by cachedAt ascending and remove oldest
      const sortedKeys = keys.sort((a, b) => (cachedMap[a].cachedAt || 0) - (cachedMap[b].cachedAt || 0));
      delete cachedMap[sortedKeys[0]];
    }

    localStorage.setItem(STORAGE_KEYS.CACHED_PLAYLISTS, JSON.stringify(cachedMap));

    // 3. Update Last Played Playlist if valid
    setLastPlayedPlaylist(playlist);

    // 4. Update Recent History
    addPlaylistToOfflineHistory(playlist);

    // 5. Store individual track metadata for global search when offline
    storeTracksForOfflineSearch(playlist.faixas);

    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('pobremusic_cache_updated', { detail: { key, playlist } }));
  } catch (err) {
    console.warn('[OfflineStorage] Error caching playlist metadata:', err);
  }
}

/**
 * Sets the last played playlist in localStorage for instant offline resume
 */
export function setLastPlayedPlaylist(playlist: PlaylistData): void {
  if (!playlist || !playlist.faixas || playlist.faixas.length === 0) return;
  try {
    const payload = {
      ...playlist,
      cachedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.LAST_PLAYED_PLAYLIST, JSON.stringify(payload));
  } catch (err) {
    console.warn('[OfflineStorage] Could not store last played playlist:', err);
  }
}

/**
 * Retrieves the last played playlist for offline playback resume
 */
export function getLastPlayedPlaylist(): PlaylistData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_PLAYED_PLAYLIST);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.faixas) && parsed.faixas.length > 0) {
      return {
        ...parsed,
        modo: 'offline_cached',
        aviso: 'Modo Offline: Carregado do cache do seu dispositivo.',
      };
    }
  } catch (err) {
    console.warn('[OfflineStorage] Error reading last played playlist:', err);
  }
  return null;
}

/**
 * Retrieves a specific playlist by ID or URL from the offline cache
 */
export function getCachedPlaylist(idOrUrl: string): PlaylistData | null {
  if (!idOrUrl) return null;
  try {
    const key = normalizePlaylistKey(idOrUrl);
    const existingRaw = localStorage.getItem(STORAGE_KEYS.CACHED_PLAYLISTS);
    if (!existingRaw) return null;

    const cachedMap: Record<string, PlaylistData> = JSON.parse(existingRaw);

    // Direct key match
    if (cachedMap[key] && cachedMap[key].faixas?.length > 0) {
      return {
        ...cachedMap[key],
        modo: 'offline_cached',
        aviso: 'Modo Offline: Carregado do cache do seu dispositivo.',
      };
    }

    // Secondary scan across names or URLs
    const target = idOrUrl.toLowerCase().trim();
    for (const item of Object.values(cachedMap)) {
      if (
        item.playlist_id?.toLowerCase() === target ||
        item.nome_playlist?.toLowerCase() === target ||
        normalizePlaylistKey(item.playlist_id) === key
      ) {
        return {
          ...item,
          modo: 'offline_cached',
          aviso: 'Modo Offline: Carregado do cache do seu dispositivo.',
        };
      }
    }
  } catch (err) {
    console.warn('[OfflineStorage] Error reading cached playlist:', err);
  }
  return null;
}

/**
 * Returns all cached playlists available offline
 */
export function getAllCachedPlaylists(): Array<PlaylistData & { cachedAt?: number; key: string }> {
  try {
    const existingRaw = localStorage.getItem(STORAGE_KEYS.CACHED_PLAYLISTS);
    if (!existingRaw) return [];
    const cachedMap: Record<string, PlaylistData & { cachedAt?: number }> = JSON.parse(existingRaw);
    return Object.entries(cachedMap).map(([key, data]) => ({
      ...data,
      key,
    }));
  } catch (err) {
    console.warn('[OfflineStorage] Error getting all cached playlists:', err);
    return [];
  }
}

/**
 * Caches YouTube Video ID resolution for a specific track to avoid re-resolving offline
 */
export function cacheResolvedVideoId(trackName: string, artistName: string, videoId: string): void {
  if (!trackName || !videoId) return;
  try {
    const key = `yt_res_${trackName.trim().toLowerCase()}_${artistName.trim().toLowerCase()}`.slice(0, 100);
    localStorage.setItem(key, videoId);
  } catch (err) {
    // Storage quota or privacy ignore
  }
}

/**
 * Gets cached YouTube Video ID for a specific track
 */
export function getCachedResolvedVideoId(trackName: string, artistName: string): string | null {
  if (!trackName) return null;
  try {
    const key = `yt_res_${trackName.trim().toLowerCase()}_${artistName.trim().toLowerCase()}`.slice(0, 100);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Adds playlist to offline recent history
 */
function addPlaylistToOfflineHistory(playlist: PlaylistData): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECENT_PLAYLISTS_HISTORY);
    let history: Array<{ id: string; name: string; cover?: string; trackCount: number; timestamp: number }> = raw
      ? JSON.parse(raw)
      : [];

    const existingIdx = history.findIndex((h) => h.id === playlist.playlist_id || h.name === playlist.nome_playlist);
    const entry = {
      id: playlist.playlist_id,
      name: playlist.nome_playlist,
      cover: playlist.capa_playlist || playlist.faixas?.[0]?.capa,
      trackCount: playlist.total_faixas || playlist.faixas?.length || 0,
      timestamp: Date.now(),
    };

    if (existingIdx >= 0) {
      history.splice(existingIdx, 1);
    }
    history.unshift(entry);

    if (history.length > MAX_CACHED_HISTORY) {
      history = history.slice(0, MAX_CACHED_HISTORY);
    }

    localStorage.setItem(STORAGE_KEYS.RECENT_PLAYLISTS_HISTORY, JSON.stringify(history));
  } catch (e) {
    // ignore
  }
}

/**
 * Stores track metadata in a flat dictionary for instant offline search & recovery
 */
function storeTracksForOfflineSearch(tracks: Track[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_TRACKS_STORE);
    const store: Record<string, Track> = raw ? JSON.parse(raw) : {};

    tracks.forEach((t) => {
      if (t.nome_musica) {
        const id = `${t.nome_musica}_${t.nome_artista}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
        store[id] = t;
      }
    });

    // Limit store size
    const keys = Object.keys(store);
    if (keys.length > 500) {
      const trimmed: Record<string, Track> = {};
      keys.slice(keys.length - 300).forEach((k) => {
        trimmed[k] = store[k];
      });
      localStorage.setItem(STORAGE_KEYS.OFFLINE_TRACKS_STORE, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_TRACKS_STORE, JSON.stringify(store));
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Searches stored offline tracks by text query
 */
export function searchOfflineStoredTracks(query: string): Track[] {
  if (!query || query.trim().length < 2) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_TRACKS_STORE);
    if (!raw) return [];
    const store: Record<string, Track> = JSON.parse(raw);
    const q = query.toLowerCase().trim();

    return Object.values(store)
      .filter((t) => t.nome_musica.toLowerCase().includes(q) || t.nome_artista.toLowerCase().includes(q))
      .slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * Returns complete statistics of offline cache storage
 */
export async function getOfflineCacheStats(): Promise<OfflineCacheStats> {
  const cachedList = getAllCachedPlaylists();
  let totalTracks = 0;
  let lastSync = 0;

  cachedList.forEach((p) => {
    totalTracks += p.faixas?.length || 0;
    if (p.cachedAt && p.cachedAt > lastSync) {
      lastSync = p.cachedAt;
    }
  });

  const lastPlayed = getLastPlayedPlaylist();
  let storageSizeBytes = 0;

  try {
    for (const key in localStorage) {
      if (key.startsWith('pobremusic_') || key.startsWith('spottube_')) {
        const val = localStorage.getItem(key);
        if (val) {
          storageSizeBytes += key.length + val.length * 2; // UTF-16 approximation
        }
      }
    }
  } catch {
    // ignore
  }

  const isServiceWorkerActive = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;

  return {
    totalPlaylists: cachedList.length,
    totalTracks,
    lastSyncTimestamp: lastSync || Date.now(),
    lastPlayedPlaylistName: lastPlayed?.nome_playlist || null,
    storageSizeBytes,
    isServiceWorkerActive,
  };
}

/**
 * Clears offline metadata and service worker caches
 */
export async function clearAllOfflineCache(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEYS.CACHED_PLAYLISTS);
    localStorage.removeItem(STORAGE_KEYS.LAST_PLAYED_PLAYLIST);
    localStorage.removeItem(STORAGE_KEYS.RECENT_PLAYLISTS_HISTORY);
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_TRACKS_STORE);

    // Also tell Service Worker to clear its internal CacheStorage
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHES' });
    }

    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    window.dispatchEvent(new CustomEvent('pobremusic_cache_cleared'));
  } catch (err) {
    console.warn('[OfflineStorage] Error clearing offline cache:', err);
  }
}
