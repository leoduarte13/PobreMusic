import { PlaylistData, Track, TrackSearchResult } from "../types";
import { PRESET_OPTIONS } from "../data/presetPlaylists";
import { playlistLogger } from "./logger";
import {
  cachePlaylistMetadata,
  getCachedPlaylist,
  getLastPlayedPlaylist,
  getCachedResolvedVideoId,
  cacheResolvedVideoId,
  searchOfflineStoredTracks,
} from "./offlineStorage";

const DEV_RUN_BACKEND_URL = "https://pobremusic.vercel.app";
const CLOUD_RUN_BACKEND_URL = "https://pobremusic.vercel.app";

export function getCandidateBackendUrls(): string[] {
  const list: string[] = [];
  if (typeof localStorage !== "undefined") {
    try {
      const custom = localStorage.getItem("custom_backend_url");
      if (custom && custom.startsWith("http")) list.push(custom.replace(/\/+$/, ""));
    } catch {}
  }
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    const isLocalAppOrFile = !origin || origin === "null" || origin.startsWith("file:") || origin.startsWith("capacitor:") || origin.startsWith("ionic:");
    if (!isLocalAppOrFile) {
      list.push("");
      if (origin.startsWith("http")) list.push(origin.replace(/\/+$/, ""));
    }
  }
  list.push(DEV_RUN_BACKEND_URL, CLOUD_RUN_BACKEND_URL);
  return Array.from(new Set(list));
}

const PRESET_FALLBACK_TRACKS: Record<string, PlaylistData> = {
  top_hits: { sucesso: true, playlist_id: "top_hits", nome_playlist: "Global Top Hits 2026", descricao: "Os maiores sucessos mundiais do The Weeknd, Harry Styles, Miley Cyrus e mais.", capa_playlist: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80", total_faixas: 7, faixas: [
    { nome_musica: "Blinding Lights", nome_artista: "The Weeknd", duracao_ms: 200000, album: "After Hours", capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80", videoId: "4NRXx6U8ABQ" },
    { nome_musica: "As It Was", nome_artista: "Harry Styles", duracao_ms: 167000, album: "Harry's House", capa: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=300&auto=format&fit=crop&q=80", videoId: "H5v3kku4y6Q" },
    { nome_musica: "Flowers", nome_artista: "Miley Cyrus", duracao_ms: 200000, album: "Endless Summer Vacation", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80", videoId: "G7KNmW9a75Y" },
    { nome_musica: "Shape of You", nome_artista: "Ed Sheeran", duracao_ms: 233000, album: "÷ (Divide)", capa: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=300&auto=format&fit=crop&q=80", videoId: "JGwWNGJdvx8" },
    { nome_musica: "Stay", nome_artista: "The Kid LAROI, Justin Bieber", duracao_ms: 141000, album: "F*CK LOVE 3", capa: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80", videoId: "kTJczUoc568" },
    { nome_musica: "Levitating", nome_artista: "Dua Lipa", duracao_ms: 203000, album: "Future Nostalgia", capa: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80", videoId: "TUVcZfQe-Kw" },
    { nome_musica: "Save Your Tears", nome_artista: "The Weeknd", duracao_ms: 215000, album: "After Hours", capa: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80", videoId: "XXYlFuWEuKi" }
  ] },
  brasil_vibes: { sucesso: true, playlist_id: "brasil_vibes", nome_playlist: "Brasil MPB & Acústico", descricao: "Clássicos de Tom Jobim, Alceu Valença, Legião Urbana e Vanessa da Mata.", capa_playlist: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&auto=format&fit=crop&q=80", total_faixas: 5, faixas: [] },
  lofi_study: { sucesso: true, playlist_id: "lofi_study", nome_playlist: "Lofi Beats for Study", descricao: "Batidas calmas para trabalhar, estudar e relaxar.", capa_playlist: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80", total_faixas: 0, faixas: [] }
};

export function parseSpotifyInput(input: string): { id: string; type: "playlist" | "album" | "track" | "preset" | "raw" } {
  if (!input) return { id: "", type: "raw" };
  const trimmed = input.trim();
  if (PRESET_FALLBACK_TRACKS[trimmed]) return { id: trimmed, type: "preset" };
  const shortMatch = trimmed.match(/(?:spotify\.link|spoti\.fi)\/([a-zA-Z0-9]+)/i);
  if (shortMatch?.[1]) return { type: "playlist", id: shortMatch[1] };
  const urlMatch = trimmed.match(/(?:user\/[^\/]+\/)?(?:intl-[a-z-]+\/)?(playlist|album|track)\/([a-zA-Z0-9]{10,40})/i);
  if (urlMatch?.[1] && urlMatch?.[2]) return { type: urlMatch[1].toLowerCase() as "playlist" | "album" | "track", id: urlMatch[2] };
  const uriMatch = trimmed.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/i);
  if (uriMatch?.[1] && uriMatch?.[2]) return { type: uriMatch[1].toLowerCase() as "playlist" | "album" | "track", id: uriMatch[2] };
  const cleanId = trimmed.split("?")[0].split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "") || trimmed.replace(/[^a-zA-Z0-9]/g, "");
  return { id: cleanId, type: "raw" };
}

export function extractSpotifyPlaylistId(input: string): string { return parseSpotifyInput(input).id; }

export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  if (match?.[1]) return match[1];
  if (/^[\w-]{11}$/.test(input.trim())) return input.trim();
  return null;
}

export async function searchMusicTracksClient(query: string): Promise<TrackSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];
  const directYtId = extractYouTubeVideoId(trimmedQuery);
  if (directYtId) return [{ nome_musica: "Vídeo do YouTube", nome_artista: "YouTube Link Direto", album: "Vídeo", duracao_ms: 210000, capa: `https://img.youtube.com/vi/${directYtId}/hqdefault.jpg`, videoId: directYtId, origem: "youtube_direct" }];
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const offlineMatches = searchOfflineStoredTracks(trimmedQuery);
    if (offlineMatches.length > 0) return offlineMatches.map((t) => ({ nome_musica: t.nome_musica, nome_artista: t.nome_artista, album: t.album || "Cache Offline", duracao_ms: t.duracao_ms || 200000, capa: t.capa || "", videoId: t.videoId, spotify_id: t.spotify_id, origem: "offline_cache" }));
  }
  for (const host of getCandidateBackendUrls()) {
    try {
      const res = await fetch(`${host}/api/search-tracks?q=${encodeURIComponent(trimmedQuery)}`);
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType?.includes("application/json")) {
        const data = await res.json();
        if (Array.isArray(data.tracks) && data.tracks.length) return data.tracks;
      }
    } catch {}
  }
  try {
    const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(trimmedQuery)}&media=music&entity=song&limit=25`);
    if (itunesRes.ok) {
      const data = await itunesRes.json();
      if (Array.isArray(data.results) && data.results.length) return data.results.map((item: any) => ({ nome_musica: item.trackName || "Sem título", nome_artista: item.artistName || "Artista", album: item.collectionName || "Single", duracao_ms: item.trackTimeMillis || 200000, capa: item.artworkUrl100 ? item.artworkUrl100.replace("100x100bb", "600x600bb") : "", previewUrl: item.previewUrl, origem: "itunes_search" }));
    }
  } catch {}
  const offlineFallback = searchOfflineStoredTracks(trimmedQuery);
  if (offlineFallback.length) return offlineFallback.map((t) => ({ nome_musica: t.nome_musica, nome_artista: t.nome_artista, album: t.album || "Cache Offline", duracao_ms: t.duracao_ms || 200000, capa: t.capa || "", videoId: t.videoId, spotify_id: t.spotify_id, origem: "offline_cache" }));
  return [{ nome_musica: trimmedQuery, nome_artista: "Buscar no YouTube", album: "Single", duracao_ms: 200000, capa: "", origem: "smart_search" }];
}

export async function resolveYouTubeVideoIdClient(nomeMusica: string, nomeArtista: string, existingVideoId?: string): Promise<string> {
  if (existingVideoId) { cacheResolvedVideoId(nomeMusica, nomeArtista, existingVideoId); return existingVideoId; }
  const cachedId = getCachedResolvedVideoId(nomeMusica, nomeArtista);
  if (cachedId) return cachedId;
  const query = `${nomeMusica} ${nomeArtista}`.trim();
  for (const host of getCandidateBackendUrls()) {
    try {
      const res = await fetch(`${host}/api/search?q=${encodeURIComponent(query)}&nome_musica=${encodeURIComponent(nomeMusica)}&nome_artista=${encodeURIComponent(nomeArtista)}`);
      if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json();
        if (data.videoId) { cacheResolvedVideoId(nomeMusica, nomeArtista, data.videoId); return data.videoId; }
      }
    } catch {}
  }
  const lowerQuery = query.toLowerCase();
  const popularMap: Record<string, string> = { "blinding lights": "4NRXx6U8ABQ", "as it was": "H5v3kku4y6Q", "flowers": "G7KNmW9a75Y", "shape of you": "JGwWNGJdvx8", "stay": "kTJczUoc568", "levitating": "TUVcZfQe-Kw", "save your tears": "XXYlFuWEuKi", "lofi": "jfKfPfyJRdk" };
  for (const [key, vid] of Object.entries(popularMap)) if (lowerQuery.includes(key)) { cacheResolvedVideoId(nomeMusica, nomeArtista, vid); return vid; }
  const defaultVid = "4NRXx6U8ABQ";
  cacheResolvedVideoId(nomeMusica, nomeArtista, defaultVid);
  return defaultVid;
}

export async function fetchPlaylistSafe(urlOrId: string, manualSpotifyToken?: string | null): Promise<{ data: PlaylistData; needsAuth?: boolean }> {
  const parsed = parseSpotifyInput(urlOrId);
  const cleanId = parsed.id || urlOrId.trim();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = getCachedPlaylist(cleanId) || getCachedPlaylist(urlOrId);
    if (cached?.faixas?.length) return { data: cached };
    const lastPlayed = getLastPlayedPlaylist();
    if (lastPlayed?.faixas?.length) return { data: lastPlayed };
  }
  if (PRESET_FALLBACK_TRACKS[cleanId]) { const data = PRESET_FALLBACK_TRACKS[cleanId]; cachePlaylistMetadata(data); return { data }; }
  const matchingPreset = PRESET_OPTIONS.find((p) => p.id === cleanId || p.spotifyUrlOrId === cleanId || p.name.toLowerCase() === urlOrId.toLowerCase());
  if (matchingPreset && PRESET_FALLBACK_TRACKS[matchingPreset.id]) { const data = PRESET_FALLBACK_TRACKS[matchingPreset.id]; cachePlaylistMetadata(data); return { data }; }
  const directYtId = extractYouTubeVideoId(urlOrId);
  if (directYtId) {
    const data: PlaylistData = { sucesso: true, playlist_id: directYtId, nome_playlist: "Música do YouTube", descricao: "Reproduzindo link direto do YouTube", capa_playlist: `https://img.youtube.com/vi/${directYtId}/hqdefault.jpg`, total_faixas: 1, faixas: [{ nome_musica: "Vídeo do YouTube", nome_artista: "YouTube Direto", album: "YouTube Audio", duracao_ms: 210000, capa: `https://img.youtube.com/vi/${directYtId}/hqdefault.jpg`, videoId: directYtId }] };
    cachePlaylistMetadata(data); return { data };
  }

  // Public Spotify playlists are intentionally resolved without OAuth/Premium.
  const isSpotifyPlaylist = parsed.type === "playlist" || /spotify\.com\/(?:[^/]+\/)?playlist\//i.test(urlOrId) || /spotify:playlist:/i.test(urlOrId);
  if (isSpotifyPlaylist) {
    for (const host of getCandidateBackendUrls()) {
      try {
        const endpoint = `${host}/api/public-playlist?url=${encodeURIComponent(urlOrId)}`;
        const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
        const contentType = res.headers.get("content-type") || "";
        const data = contentType.includes("application/json") ? await res.json() : null;
        if (res.ok && data?.sucesso && Array.isArray(data.faixas) && data.faixas.length) {
          cachePlaylistMetadata(data);
          return { data };
        }
        console.warn("Public Spotify playlist resolver:", res.status, data?.error || "sem dados");
      } catch (err) { console.warn("Public Spotify playlist request failed:", err); }
    }
  }

  const headers: Record<string, string> = {};
  const token = manualSpotifyToken || localStorage.getItem("spotifyTokenManual") || localStorage.getItem("spotifyTokenManuaL");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  for (const host of getCandidateBackendUrls()) {
    const endpoint = `${host}/api/spotify-playlist?url=${encodeURIComponent(urlOrId)}`;
    try {
      const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(12000) });
      const contentType = res.headers.get("content-type") || "";
      const data: any = contentType.includes("application/json") ? await res.json() : null;
      if (res.ok && data?.sucesso && Array.isArray(data.faixas) && data.faixas.length) { cachePlaylistMetadata(data); return { data }; }
      if (data && (data.needsAuth || res.status === 401 || res.status === 403)) return { data, needsAuth: true };
    } catch {}
  }

  if (token && cleanId) {
    try {
      const endpoint = parsed.type === "album" ? `https://api.spotify.com/v1/albums/${cleanId}` : parsed.type === "track" ? `https://api.spotify.com/v1/tracks/${cleanId}` : `https://api.spotify.com/v1/playlists/${cleanId}?market=BR`;
      const spotifyRes = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (spotifyRes.ok) {
        const spotifyData = await spotifyRes.json();
        if (parsed.type === "track") {
          const trackItem: Track = { nome_musica: spotifyData.name, nome_artista: (spotifyData.artists || []).map((a: any) => a.name).join(", "), album: spotifyData.album?.name || "", duracao_ms: spotifyData.duration_ms || 200000, capa: spotifyData.album?.images?.[0]?.url || "", spotify_id: spotifyData.id };
          const data: PlaylistData = { sucesso: true, playlist_id: spotifyData.id, nome_playlist: spotifyData.name, descricao: `Faixa por ${(spotifyData.artists || []).map((a: any) => a.name).join(", ")}`, capa_playlist: trackItem.capa, total_faixas: 1, faixas: [trackItem] };
          cachePlaylistMetadata(data); return { data };
        }
        const rawItems = Array.isArray(spotifyData.items) ? spotifyData.items : Array.isArray(spotifyData.items?.items) ? spotifyData.items.items : Array.isArray(spotifyData.tracks?.items) ? spotifyData.tracks.items : [];
        const faixas: Track[] = rawItems.map((item: any) => { const tr = item.track || item; if (!tr?.name) return null; return { nome_musica: tr.name, nome_artista: (tr.artists || []).map((a: any) => a.name).join(", ") || "Artista", album: tr.album?.name || spotifyData.name || "", duracao_ms: tr.duration_ms || 200000, capa: tr.album?.images?.[0]?.url || spotifyData.images?.[0]?.url || "", spotify_id: tr.id }; }).filter(Boolean) as Track[];
        if (faixas.length) { const data: PlaylistData = { sucesso: true, playlist_id: spotifyData.id, nome_playlist: spotifyData.name || "Playlist Spotify", descricao: spotifyData.description || "", capa_playlist: spotifyData.images?.[0]?.url || "", total_faixas: faixas.length, faixas }; cachePlaylistMetadata(data); return { data }; }
      }
    } catch {}
  }

  const cachedOffline = getCachedPlaylist(cleanId) || getCachedPlaylist(urlOrId);
  if (cachedOffline?.faixas?.length) return { data: cachedOffline };
  const isLikelyResource = urlOrId.includes("spotify.com") || urlOrId.startsWith("spotify:") || urlOrId.startsWith("http") || (cleanId.length >= 10 && !urlOrId.includes(" "));
  if (isLikelyResource) return { data: { sucesso: false, playlist_id: cleanId, nome_playlist: "Playlist não encontrada", descricao: "Não foi possível carregar as músicas deste link. Verifique se a playlist é pública ou conecte sua conta Spotify para playlists privadas.", capa_playlist: "", total_faixas: 0, faixas: [] } };
  if (cleanId.length > 2) {
    try {
      const directSearchTracks = await searchMusicTracksClient(urlOrId.trim());
      if (directSearchTracks?.length) {
        const faixas: Track[] = directSearchTracks.slice(0, 15).map((t) => ({ nome_musica: t.nome_musica, nome_artista: t.nome_artista, album: t.album || "Busca", duracao_ms: t.duracao_ms || 200000, capa: t.capa || "", videoId: t.videoId, spotify_id: t.spotify_id }));
        const data: PlaylistData = { sucesso: true, playlist_id: cleanId, nome_playlist: urlOrId.trim().replace(/^https?:\/\/[^\/]+\//, ""), descricao: "Músicas localizadas via busca.", capa_playlist: faixas[0]?.capa || "", total_faixas: faixas.length, faixas };
        cachePlaylistMetadata(data); return { data };
      }
    } catch {}
  }
  const lastPlayedFallback = getLastPlayedPlaylist();
  if (lastPlayedFallback?.faixas?.length) return { data: lastPlayedFallback };
  return { data: { sucesso: false, playlist_id: cleanId, nome_playlist: "Nenhuma música encontrada", descricao: "Não foi possível encontrar músicas para o termo ou link informado.", capa_playlist: "", total_faixas: 0, faixas: [] } };
}
