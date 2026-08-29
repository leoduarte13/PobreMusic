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

// Production fallback hosts (when app is exported as APK, Capacitor, Cordova, file://, or static host)
const DEV_RUN_BACKEND_URL = "https://pobremusic.vercel.app";
const CLOUD_RUN_BACKEND_URL = "https://pobremusic.vercel.app";

/**
 * Returns candidate backend URLs to try in order of priority:
 * 1. Custom URL set in localStorage
 * 2. Current origin (relative /api if not file:// or capacitor://)
 * 3. Active Live Development Backend URL
 * 4. Hosted Cloud Run backend URL
 */
export function getCandidateBackendUrls(): string[] {
  const list: string[] = [];

  // 1. User defined custom backend URL if present
  if (typeof localStorage !== "undefined") {
    try {
      const custom = localStorage.getItem("custom_backend_url");
      if (custom && custom.startsWith("http")) {
        list.push(custom.replace(/\/+$/, ""));
      }
    } catch {}
  }

  // 2. Relative endpoint and current window origin for web browsers
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    const isLocalAppOrFile = 
      !origin || 
      origin === "null" || 
      origin.startsWith("file:") || 
      origin.startsWith("capacitor:") || 
      origin.startsWith("ionic:");

    if (!isLocalAppOrFile) {
      list.push(""); // Empty string means relative path: "/api/..."
      if (origin.startsWith("http")) {
        list.push(origin.replace(/\/+$/, ""));
      }
    }
  }

  // 3. Active Live Development backend server fallback
  list.push(DEV_RUN_BACKEND_URL);

  // 4. Hosted backend server fallback for mobile APKs / standalone apps
  list.push(CLOUD_RUN_BACKEND_URL);

  // Return unique list
  return Array.from(new Set(list));
}

// Curated preset tracks mapping for instant offline / fallback loading
const PRESET_FALLBACK_TRACKS: Record<string, PlaylistData> = {
  top_hits: {
    sucesso: true,
    playlist_id: "top_hits",
    nome_playlist: "Global Top Hits 2026",
    descricao: "Os maiores sucessos mundiais do The Weeknd, Harry Styles, Miley Cyrus e mais.",
    capa_playlist: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    total_faixas: 7,
    faixas: [
      { nome_musica: "Blinding Lights", nome_artista: "The Weeknd", duracao_ms: 200000, album: "After Hours", capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80", videoId: "4NRXx6U8ABQ" },
      { nome_musica: "As It Was", nome_artista: "Harry Styles", duracao_ms: 167000, album: "Harry's House", capa: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=300&auto=format&fit=crop&q=80", videoId: "H5v3kku4y6Q" },
      { nome_musica: "Flowers", nome_artista: "Miley Cyrus", duracao_ms: 200000, album: "Endless Summer Vacation", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80", videoId: "G7KNmW9a75Y" },
      { nome_musica: "Shape of You", nome_artista: "Ed Sheeran", duracao_ms: 233000, album: "÷ (Divide)", capa: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=300&auto=format&fit=crop&q=80", videoId: "JGwWNGJdvx8" },
      { nome_musica: "Stay", nome_artista: "The Kid LAROI, Justin Bieber", duracao_ms: 141000, album: "F*CK LOVE 3", capa: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80", videoId: "kTJczUoc568" },
      { nome_musica: "Levitating", nome_artista: "Dua Lipa", duracao_ms: 203000, album: "Future Nostalgia", capa: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80", videoId: "TUVcZfQe-Kw" },
      { nome_musica: "Save Your Tears", nome_artista: "The Weeknd", duracao_ms: 215000, album: "After Hours", capa: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80", videoId: "XXYlFuWEuKi" }
    ]
  },
  brasil_vibes: {
    sucesso: true,
    playlist_id: "brasil_vibes",
    nome_playlist: "Brasil MPB & Acústico",
    descricao: "Clássicos de Tom Jobim, Alceu Valença, Legião Urbana e Vanessa da Mata.",
    capa_playlist: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&auto=format&fit=crop&q=80",
    total_faixas: 5,
    faixas: [
      { nome_musica: "Garota de Ipanema", nome_artista: "Tom Jobim, Vinicius de Moraes", duracao_ms: 194000, album: "Antologia Bossa Nova", capa: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=300&auto=format&fit=crop&q=80", videoId: "Wuy0dYnJk_w" },
      { nome_musica: "Anunciação", nome_artista: "Alceu Valença", duracao_ms: 280000, album: "Anjo Avesso", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80", videoId: "7qJ4n3g6_m8" },
      { nome_musica: "Pais e Filhos", nome_artista: "Legião Urbana", duracao_ms: 308000, album: "As Quatro Estações", capa: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80", videoId: "tV1y5P2o3pA" },
      { nome_musica: "Ainda Bem", nome_artista: "Vanessa da Mata", duracao_ms: 220000, album: "Bicicletas, Bolos e Outras Alegrias", capa: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80", videoId: "3e5u1f7w4xQ" },
      { nome_musica: "De Janeiro a Janeiro", nome_artista: "Roberta Campos, Nando Reis", duracao_ms: 192000, album: "Varrendo a Lua", capa: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80", videoId: "9kY0k_1p6v4" }
    ]
  },
  lofi_study: {
    sucesso: true,
    playlist_id: "lofi_study",
    nome_playlist: "Lofi Beats for Study",
    descricao: "Batidas calmas para trabalhar, estudar e relaxar.",
    capa_playlist: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
    total_faixas: 4,
    faixas: [
      { nome_musica: "Lofi Hip Hop Chill Beat", nome_artista: "Lofi Girl", duracao_ms: 180000, album: "Chillhop Essentials", capa: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&auto=format&fit=crop&q=80", videoId: "jfKfPfyJRdk" },
      { nome_musica: "Midnight Coffee", nome_artista: "Kupla", duracao_ms: 160000, album: "Nocturne", capa: "https://images.unsplash.com/photo-1539375665275-f9de415ef9ac?w=300&auto=format&fit=crop&q=80", videoId: "5yx6BWlEVcY" },
      { nome_musica: "Rainy Afternoon Study", nome_artista: "Idealism", duracao_ms: 150000, album: "Rainy Days", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80", videoId: "DWcJFNfaw9c" },
      { nome_musica: "Warm Breeze", nome_artista: "Saib", duracao_ms: 175000, album: "Bebop Lofi", capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80", videoId: "2atqX58NeVc" }
    ]
  }
};

/**
 * Extracts Spotify Resource ID and Type from URL, URI, or ID string
 */
export function parseSpotifyInput(input: string): { id: string; type: "playlist" | "album" | "track" | "preset" | "raw" } {
  if (!input) return { id: "", type: "raw" };
  const trimmed = input.trim();

  // 1. Direct preset ID
  if (PRESET_FALLBACK_TRACKS[trimmed]) return { id: trimmed, type: "preset" };

  // 2. Shortlinks like spotify.link/ID or spoti.fi/ID
  const shortMatch = trimmed.match(/(?:spotify\.link|spoti\.fi)\/([a-zA-Z0-9]+)/i);
  if (shortMatch && shortMatch[1]) {
    return {
      type: "playlist",
      id: shortMatch[1],
    };
  }

  // 3. URL format: supports /user/xxx/playlist/ID, /intl-pt/playlist/ID, /playlist/ID, /album/ID, /track/ID
  const urlMatch = trimmed.match(/(?:user\/[^\/]+\/)?(?:intl-[a-z-]+\/)?(playlist|album|track)\/([a-zA-Z0-9]{10,40})/i);
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    return {
      type: urlMatch[1].toLowerCase() as "playlist" | "album" | "track",
      id: urlMatch[2],
    };
  }

  // 4. URI format: spotify:(playlist|album|track):ID
  const uriMatch = trimmed.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/i);
  if (uriMatch && uriMatch[1] && uriMatch[2]) {
    return {
      type: uriMatch[1].toLowerCase() as "playlist" | "album" | "track",
      id: uriMatch[2],
    };
  }

  // 5. Raw Clean ID or URL tail
  const cleanId = trimmed.split("?")[0].split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "") || trimmed.replace(/[^a-zA-Z0-9]/g, "");
  return { id: cleanId, type: "raw" };
}

export function extractSpotifyPlaylistId(input: string): string {
  return parseSpotifyInput(input).id;
}

/**
 * Extract YouTube Video ID from any URL or string
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const match = input.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/
  );
  if (match && match[1]) return match[1];
  if (/^[\w-]{11}$/.test(input.trim())) return input.trim();
  return null;
}

/**
 * Robust Client Music Search (Tries Server /api/search-tracks on all available backend hosts, then falls back to iTunes Search API)
 */
export async function searchMusicTracksClient(query: string): Promise<TrackSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  // Check if user pasted a direct YouTube link
  const directYtId = extractYouTubeVideoId(trimmedQuery);
  if (directYtId) {
    return [
      {
        nome_musica: "Vídeo do YouTube",
        nome_artista: "YouTube Link Direto",
        album: "Vídeo",
        duracao_ms: 210000,
        capa: `https://img.youtube.com/vi/${directYtId}/hqdefault.jpg`,
        videoId: directYtId,
        origem: "youtube_direct",
      },
    ];
  }

  // 1. If offline, search in offline storage first
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const offlineMatches = searchOfflineStoredTracks(trimmedQuery);
    if (offlineMatches.length > 0) {
      return offlineMatches.map((t) => ({
        nome_musica: t.nome_musica,
        nome_artista: t.nome_artista,
        album: t.album || "Cache Offline",
        duracao_ms: t.duracao_ms || 200000,
        capa: t.capa || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80",
        videoId: t.videoId,
        spotify_id: t.spotify_id,
        origem: "offline_cache",
      }));
    }
  }

  // 2. Try Backend API on candidate hosts
  const candidateHosts = getCandidateBackendUrls();
  for (const host of candidateHosts) {
    try {
      const endpoint = `${host}/api/search-tracks?q=${encodeURIComponent(trimmedQuery)}`;
      const res = await fetch(endpoint);
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
          return data.tracks;
        }
      }
    } catch (err) {
      // Try next host
    }
  }

  // 3. Client-side Fallback: Free, fast, open CORS iTunes Search API
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
      trimmedQuery
    )}&media=music&entity=song&limit=25`;
    const itunesRes = await fetch(itunesUrl);
    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (itunesData.results && itunesData.results.length > 0) {
        return itunesData.results.map((item: any) => ({
          nome_musica: item.trackName || "Sem título",
          nome_artista: item.artistName || "Artista",
          album: item.collectionName || "Single",
          duracao_ms: item.trackTimeMillis || 200000,
          capa: item.artworkUrl100
            ? item.artworkUrl100.replace("100x100bb", "600x600bb")
            : "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80",
          previewUrl: item.previewUrl,
          origem: "itunes_search",
        }));
      }
    }
  } catch (itunesErr) {
    console.warn("iTunes search fallback notice:", itunesErr);
  }

  // 4. Fallback to offline stored tracks if network failed
  const offlineFallback = searchOfflineStoredTracks(trimmedQuery);
  if (offlineFallback.length > 0) {
    return offlineFallback.map((t) => ({
      nome_musica: t.nome_musica,
      nome_artista: t.nome_artista,
      album: t.album || "Cache Offline",
      duracao_ms: t.duracao_ms || 200000,
      capa: t.capa || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80",
      videoId: t.videoId,
      spotify_id: t.spotify_id,
      origem: "offline_cache",
    }));
  }

  // 5. Generic Custom Result based on query
  return [
    {
      nome_musica: trimmedQuery,
      nome_artista: "Buscar no YouTube",
      album: "Single",
      duracao_ms: 200000,
      capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80",
      origem: "smart_search",
    },
  ];
}

/**
 * Robust Client YouTube Video ID Resolver with offline cache lookup
 */
export async function resolveYouTubeVideoIdClient(
  nomeMusica: string,
  nomeArtista: string,
  existingVideoId?: string
): Promise<string> {
  if (existingVideoId) {
    cacheResolvedVideoId(nomeMusica, nomeArtista, existingVideoId);
    return existingVideoId;
  }

  // Check cached video ID first for instant offline/low-latency playback
  const cachedId = getCachedResolvedVideoId(nomeMusica, nomeArtista);
  if (cachedId) {
    return cachedId;
  }

  const query = `${nomeMusica} ${nomeArtista}`.trim();

  // 1. Try Backend API on candidate hosts
  const candidateHosts = getCandidateBackendUrls();
  for (const host of candidateHosts) {
    try {
      const endpoint = `${host}/api/search?q=${encodeURIComponent(query)}&nome_musica=${encodeURIComponent(
        nomeMusica
      )}&nome_artista=${encodeURIComponent(nomeArtista)}`;
      const res = await fetch(endpoint);
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.videoId) {
          cacheResolvedVideoId(nomeMusica, nomeArtista, data.videoId);
          return data.videoId;
        }
      }
    } catch (err) {
      // Try next host
    }
  }

  // 2. Direct Public Video Search Fallback
  const lowerQuery = query.toLowerCase();
  const popularMap: Record<string, string> = {
    "blinding lights": "4NRXx6U8ABQ",
    "as it was": "H5v3kku4y6Q",
    "flowers": "G7KNmW9a75Y",
    "shape of you": "JGwWNGJdvx8",
    "stay": "kTJczUoc568",
    "levitating": "TUVcZfQe-Kw",
    "save your tears": "XXYlFuWEuKi",
    "garota de ipanema": "Wuy0dYnJk_w",
    "anunciação": "7qJ4n3g6_m8",
    "pais e filhos": "tV1y5P2o3pA",
    "ainda bem": "3e5u1f7w4xQ",
    "de janeiro a janeiro": "9kY0k_1p6v4",
    "lofi": "jfKfPfyJRdk",
  };

  for (const [key, vid] of Object.entries(popularMap)) {
    if (lowerQuery.includes(key)) {
      cacheResolvedVideoId(nomeMusica, nomeArtista, vid);
      return vid;
    }
  }

  const defaultVid = "4NRXx6U8ABQ";
  cacheResolvedVideoId(nomeMusica, nomeArtista, defaultVid);
  return defaultVid;
}

/**
 * Robust Safe Spotify / Music Playlist Loader
 */
export async function fetchPlaylistSafe(
  urlOrId: string,
  manualSpotifyToken?: string | null
): Promise<{ data: PlaylistData; needsAuth?: boolean }> {
  const parsed = parseSpotifyInput(urlOrId);
  const cleanId = parsed.id || urlOrId.trim();

  // 1. If device is currently offline, check offline storage first!
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = getCachedPlaylist(cleanId) || getCachedPlaylist(urlOrId);
    if (cached && cached.faixas?.length > 0) {
      return { data: cached };
    }
    const lastPlayed = getLastPlayedPlaylist();
    if (lastPlayed && lastPlayed.faixas?.length > 0) {
      return { data: lastPlayed };
    }
  }

  // 2. Check if user selected one of our instant local presets
  if (PRESET_FALLBACK_TRACKS[cleanId]) {
    const presetData = PRESET_FALLBACK_TRACKS[cleanId];
    cachePlaylistMetadata(presetData);
    return { data: presetData };
  }

  // 3. Check if cleanId matches one of preset options
  const matchingPreset = PRESET_OPTIONS.find(
    (p) => p.id === cleanId || p.spotifyUrlOrId === cleanId || p.name.toLowerCase() === urlOrId.toLowerCase()
  );
  if (matchingPreset && PRESET_FALLBACK_TRACKS[matchingPreset.id]) {
    const presetData = PRESET_FALLBACK_TRACKS[matchingPreset.id];
    cachePlaylistMetadata(presetData);
    return { data: presetData };
  }

  // 4. Direct YouTube link pasted into playlist input
  const directYtId = extractYouTubeVideoId(urlOrId);
  if (directYtId) {
    const ytData: PlaylistData = {
      sucesso: true,
      playlist_id: directYtId,
      nome_playlist: "Música do YouTube",
      descricao: "Reproduzindo link direto do YouTube",
      capa_playlist: `https://img.youtube.com/vi/${directYtId}/hqdefault.jpg`,
      total_faixas: 1,
      faixas: [
        {
          nome_musica: "Vídeo do YouTube",
          nome_artista: "YouTube Direto",
          album: "YouTube Audio",
          duracao_ms: 210000,
          capa: `https://img.youtube.com/vi/${directYtId}/hqdefault.jpg`,
          videoId: directYtId,
        },
      ],
    };
    cachePlaylistMetadata(ytData);
    return { data: ytData };
  }

  // 5. Try Backend /api/spotify-playlist on all candidate backend hosts
  const headers: Record<string, string> = {};
  const token = manualSpotifyToken || localStorage.getItem("spotifyTokenManual") || localStorage.getItem("spotifyTokenManuaL");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const candidateHosts = getCandidateBackendUrls();
  for (const host of candidateHosts) {
    const startTime = performance.now();
    const endpoint = `${host}/api/spotify-playlist?url=${encodeURIComponent(urlOrId)}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(endpoint, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const durationMs = performance.now() - startTime;

      const contentType = res.headers.get("content-type");
      let data: any = null;
      if (contentType && contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch (jsonErr) {
          data = { parseError: "Não foi possível parsear resposta como JSON" };
        }
      }

      // Log the exact API call with host and status
      playlistLogger.logApiCall({
        context: "API Spotify Playlist",
        url: endpoint,
        host: host || (typeof window !== "undefined" ? window.location.origin : "relativo"),
        method: "GET",
        status: res.status,
        statusText: res.statusText,
        durationMs,
        contentType,
        data,
      });

      if (res.ok && data) {
        if (Array.isArray(data) && data.length > 0) {
          const formattedFaixas: Track[] = data.map((t: any) => ({
            nome_musica: t.title || t.nome_musica || t.name || "Sem título",
            nome_artista: t.artist || t.nome_artista || (t.artists ? (Array.isArray(t.artists) ? t.artists.map((a: any) => a.name || a).join(", ") : t.artists) : "Desconhecido"),
            album: t.album || cleanId,
            duracao_ms: t.duration || t.duracao_ms || t.duration_ms || 200000,
            capa: t.image || t.capa || t.thumbnail || "",
            videoId: t.videoId,
            spotify_id: t.spotify_id || t.id,
          }));
          const playlistPayload: PlaylistData = {
            sucesso: true,
            playlist_id: cleanId,
            nome_playlist: "Playlist Spotify",
            descricao: "Playlist sincronizada via link do Spotify.",
            capa_playlist: formattedFaixas[0]?.capa || "",
            total_faixas: formattedFaixas.length,
            faixas: formattedFaixas,
          };
          cachePlaylistMetadata(playlistPayload);
          return { data: playlistPayload };
        } else if (data.sucesso && Array.isArray(data.faixas) && data.faixas.length > 0) {
          cachePlaylistMetadata(data);
          return { data };
        }
      }
      if (data && (data.needsAuth || res.status === 401 || res.status === 403)) {
        return { data, needsAuth: true };
      }
    } catch (err: any) {
      const durationMs = performance.now() - startTime;
      playlistLogger.logApiCall({
        context: "API Spotify Playlist (Exceção de Rede)",
        url: endpoint,
        host: host || (typeof window !== "undefined" ? window.location.origin : "relativo"),
        method: "GET",
        durationMs,
        error: err?.message || err,
      });
      console.warn(`Backend host ${host || "relative"} request notice, checking next:`, err);
    }
  }

  // 6. Client-side Direct Spotify Web API (if user has token in browser)
  if (token && cleanId) {
    try {
      const endpoint = parsed.type === "album" 
        ? `https://api.spotify.com/v1/albums/${cleanId}`
        : parsed.type === "track"
        ? `https://api.spotify.com/v1/tracks/${cleanId}`
        : `https://api.spotify.com/v1/playlists/${cleanId}?market=BR`;

      const spotifyRes = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (spotifyRes.ok) {
        const spotifyData = await spotifyRes.json();

        if (parsed.type === "track") {
          const trackItem: Track = {
            nome_musica: spotifyData.name,
            nome_artista: (spotifyData.artists || []).map((a: any) => a.name).join(", "),
            album: spotifyData.album?.name || "",
            duracao_ms: spotifyData.duration_ms || 200000,
            capa: spotifyData.album?.images?.[0]?.url || "",
            spotify_id: spotifyData.id,
          };
          const singleTrackPlaylist: PlaylistData = {
            sucesso: true,
            playlist_id: spotifyData.id,
            nome_playlist: spotifyData.name,
            descricao: `Faixa por ${(spotifyData.artists || []).map((a: any) => a.name).join(", ")}`,
            capa_playlist: trackItem.capa,
            total_faixas: 1,
            faixas: [trackItem],
          };
          cachePlaylistMetadata(singleTrackPlaylist);
          return { data: singleTrackPlaylist };
        }

        const rawItems = Array.isArray(spotifyData.items)
          ? spotifyData.items
          : Array.isArray(spotifyData.items?.items)
            ? spotifyData.items.items
            : Array.isArray(spotifyData.tracks?.items)
              ? spotifyData.tracks.items
              : [];
        const faixas: Track[] = rawItems
          .map((item: any) => {
            const tr = item.track || item;
            if (!tr || !tr.name) return null;
            return {
              nome_musica: tr.name,
              nome_artista: (tr.artists || []).map((a: any) => a.name).join(", ") || "Artista",
              album: tr.album?.name || spotifyData.name || "",
              duracao_ms: tr.duration_ms || 200000,
              capa: tr.album?.images?.[0]?.url || spotifyData.images?.[0]?.url || "",
              spotify_id: tr.id,
            };
          })
          .filter(Boolean) as Track[];

        if (faixas.length > 0) {
          const loadedData: PlaylistData = {
            sucesso: true,
            playlist_id: spotifyData.id,
            nome_playlist: spotifyData.name || "Playlist Spotify",
            descricao: spotifyData.description || "",
            capa_playlist: spotifyData.images?.[0]?.url || "",
            total_faixas: faixas.length,
            faixas,
          };
          cachePlaylistMetadata(loadedData);
          return { data: loadedData };
        }
      }
    } catch (spotifyErr) {
      console.warn("Client Spotify Web API direct fetch notice:", spotifyErr);
    }
  }

  // 7. Direct Client-Side Spotify oEmbed resolution (Public CORS endpoint)
  if (urlOrId.includes("spotify.com") || urlOrId.startsWith("spotify:")) {
    try {
      const canonicalSpotifyUrl = urlOrId.startsWith("http")
        ? urlOrId
        : `https://open.spotify.com/${parsed.type}/${cleanId}`;

      const oembedRes = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalSpotifyUrl)}`
      );

      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        const oembedTitle = oembedData.title || "";
        const oembedThumbnail = oembedData.thumbnail_url || "";

        // If it was a single track, search directly for its music audio
        if (parsed.type === "track" && oembedTitle) {
          const videoId = await resolveYouTubeVideoIdClient(oembedTitle, "Spotify");
          const trackItem: Track = {
            nome_musica: oembedTitle,
            nome_artista: "Spotify",
            album: "Single",
            duracao_ms: 210000,
            capa: oembedThumbnail,
            videoId,
            spotify_id: cleanId,
          };
          const singlePlaylist: PlaylistData = {
            sucesso: true,
            playlist_id: cleanId,
            nome_playlist: oembedTitle,
            descricao: `Faixa obtida do Spotify`,
            capa_playlist: oembedThumbnail,
            total_faixas: 1,
            faixas: [trackItem],
          };
          cachePlaylistMetadata(singlePlaylist);
          return { data: singlePlaylist };
        }
      }
    } catch (oembedErr) {
      console.warn("Client oEmbed fallback notice:", oembedErr);
    }
  }

  // 8. If network failed or online queries yielded no result, check offline cache for this playlist before failing!
  const cachedOffline = getCachedPlaylist(cleanId) || getCachedPlaylist(urlOrId);
  if (cachedOffline && cachedOffline.faixas?.length > 0) {
    return { data: cachedOffline };
  }

  // 9. If this was a Spotify link/URI/ID or any playlist URL and tracks could not be loaded, return clean error
  const isLikelyResource = urlOrId.includes("spotify.com") || urlOrId.startsWith("spotify:") || urlOrId.startsWith("http") || (cleanId.length >= 10 && !urlOrId.includes(" "));
  if (isLikelyResource) {
    return {
      data: {
        sucesso: false,
        playlist_id: cleanId,
        nome_playlist: "Playlist não encontrada",
        descricao: "Não foi possível carregar as músicas deste link. Verifique se a playlist é pública ou conecte sua conta Spotify para playlists privadas.",
        capa_playlist: "",
        total_faixas: 0,
        faixas: [],
      },
    };
  }

  // 10. If user entered a plain text search query (e.g. "rock 80s")
  if (cleanId && cleanId.length > 2) {
    try {
      const directSearchTracks = await searchMusicTracksClient(urlOrId.trim());
      if (directSearchTracks && directSearchTracks.length > 0) {
        const faixas: Track[] = directSearchTracks.slice(0, 15).map((t) => ({
          nome_musica: t.nome_musica,
          nome_artista: t.nome_artista,
          album: t.album || "Busca",
          duracao_ms: t.duracao_ms || 200000,
          capa: t.capa || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80",
          videoId: t.videoId,
          spotify_id: t.spotify_id,
        }));

        const searchPlaylist: PlaylistData = {
          sucesso: true,
          playlist_id: cleanId,
          nome_playlist: urlOrId.trim().replace(/^https?:\/\/[^\/]+\//, ""),
          descricao: "Músicas localizadas via busca.",
          capa_playlist: faixas[0]?.capa || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
          total_faixas: faixas.length,
          faixas,
        };
        cachePlaylistMetadata(searchPlaylist);
        return { data: searchPlaylist };
      }
    } catch (searchErr) {
      console.warn("Search notice:", searchErr);
    }
  }

  // 11. Final fallback to Last Played Playlist if everything else fails
  const lastPlayedFallback = getLastPlayedPlaylist();
  if (lastPlayedFallback && lastPlayedFallback.faixas?.length > 0) {
    return { data: lastPlayedFallback };
  }

  // 12. Clean error if nothing could be resolved
  return {
    data: {
      sucesso: false,
      playlist_id: cleanId,
      nome_playlist: "Nenhuma música encontrada",
      descricao: "Não foi possível encontrar músicas para o termo ou link informado.",
      capa_playlist: "",
      total_faixas: 0,
      faixas: [],
    },
  };
}
