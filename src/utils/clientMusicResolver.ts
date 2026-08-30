import { PlaylistData, Track, TrackSearchResult } from "../types";
import { cachePlaylistMetadata, getCachedPlaylist, getLastPlayedPlaylist } from "./offlineStorage";

const PRESET_PLAYLISTS_CLIENT: Record<string, any> = {
  top_hits: {
    id: "top_hits",
    name: "Global Top Hits 2026",
    description: "Os maiores sucessos mundiais do momento para você curtir.",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    tracks: [
      { nome_musica: "Blinding Lights", nome_artista: "The Weeknd", duracao_ms: 200000, album: "After Hours", capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80", videoId: "4NRXx6U8ABQ" },
      { nome_musica: "As It Was", nome_artista: "Harry Styles", duracao_ms: 167000, album: "Harry's House", capa: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80", videoId: "H5v3kku4y6Q" },
      { nome_musica: "Flowers", nome_artista: "Miley Cyrus", duracao_ms: 200000, album: "Endless Summer Vacation", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80", videoId: "G7KNmW9a75Y" },
      { nome_musica: "Shape of You", nome_artista: "Ed Sheeran", duracao_ms: 233000, album: "÷ (Divide)", capa: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=300&auto=format&fit=crop&q=80", videoId: "JGwWNGJdvx8" },
      { nome_musica: "Stay", nome_artista: "The Kid LAROI, Justin Bieber", duracao_ms: 141000, album: "F*CK LOVE 3", capa: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80", videoId: "kTJczUoc568" },
      { nome_musica: "Levitating", nome_artista: "Dua Lipa", duracao_ms: 203000, album: "Future Nostalgia", capa: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80", videoId: "TUVcZfQe-Kw" },
      { nome_musica: "Save Your Tears", nome_artista: "The Weeknd", duracao_ms: 215000, album: "After Hours", capa: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80", videoId: "XXYlFuWEuKi" }
    ]
  },
  brasil_vibes: {
    id: "brasil_vibes",
    name: "Brasil Pop & MPB Acústico",
    description: "Grandes clássicos e novidades da música brasileira.",
    cover: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&auto=format&fit=crop&q=80",
    tracks: [
      { nome_musica: "Garota de Ipanema", nome_artista: "Tom Jobim, Vinicius de Moraes", duracao_ms: 194000, album: "Antologia Bossa Nova", capa: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80", videoId: "Wuy0dYnJk_w" },
      { nome_musica: "Anunciação", nome_artista: "Alceu Valença", duracao_ms: 280000, album: "Anjo Avesso", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80", videoId: "4Mkx4k0mK3o" },
      { nome_musica: "Pais e Filhos", nome_artista: "Legião Urbana", duracao_ms: 308000, album: "As Quatro Estações", capa: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80", videoId: "oZ6s-O8u1Z8" },
      { nome_musica: "Ainda Bem", nome_artista: "Vanessa da Mata", duracao_ms: 220000, album: "Bicicletas, Bolos e Outras Alegrias", capa: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80", videoId: "wPqR9_d1iK8" },
      { nome_musica: "De Janeiro a Janeiro", nome_artista: "Roberta Campos, Nando Reis", duracao_ms: 192000, album: "Varrendo a Lua", capa: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80", videoId: "7_tK7U5k2_U" }
    ]
  },
  lofi_study: {
    id: "lofi_study",
    name: "Lofi Focus & Study Beats",
    description: "Batidas relaxantes e instrumentais para foco e trabalho.",
    cover: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
    tracks: [
      { nome_musica: "Lofi Hip Hop Chill Beat", nome_artista: "Lofi Girl", duracao_ms: 180000, album: "Chillhop Essentials", capa: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&auto=format&fit=crop&q=80", videoId: "jfKfPfyJRdk" },
      { nome_musica: "Midnight Coffee", nome_artista: "Kupla", duracao_ms: 160000, album: "Nocturne", capa: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80", videoId: "jfKfPfyJRdk" },
      { nome_musica: "Rainy Afternoon Study", nome_artista: "Idealism", duracao_ms: 150000, album: "Rainy Days", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80", videoId: "jfKfPfyJRdk" },
      { nome_musica: "Warm Breeze", nome_artista: "Saib", duracao_ms: 175000, album: "Bebop Lofi", capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80", videoId: "jfKfPfyJRdk" }
    ]
  }
};

export function getCandidateBackendUrls(): string[] {
  const urls: string[] = [""]; // Empty string = relative path (current origin)
  try {
    const custom = localStorage.getItem("custom_backend_url");
    if (custom && custom.startsWith("http")) {
      urls.push(custom.replace(/\/+$/, ""));
    }
  } catch {}
  return [...new Set(urls)];
}

export function extractYouTubeVideoId(input: string): string | null {
  const m = input?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
  return m?.[1] || (/^[\w-]{11}$/.test(input?.trim() || "") ? input.trim() : null);
}

export function parseSpotifyInput(input: string): { id: string; type: "playlist" | "album" | "track" | "preset" | "raw" } {
  const value = input.trim();
  if (PRESET_PLAYLISTS_CLIENT[value]) {
    return { type: "preset", id: value };
  }
  const m = value.match(/(?:spotify\.com\/(?:intl-[a-z-]+\/)?(?:user\/[^\/]+\/)?)(playlist|album|track)\/([A-Za-z0-9]+)/i) ||
            value.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  if (m) return { type: m[1].toLowerCase() as any, id: m[2] };
  return { type: "raw", id: value.split("?")[0].split("/").pop()?.replace(/[^A-Za-z0-9_-]/g, "") || value };
}

export function extractSpotifyPlaylistId(input: string) {
  return parseSpotifyInput(input).id;
}

async function audiusRequest(params: string): Promise<any> {
  const candidateUrls = getCandidateBackendUrls();
  for (const base of candidateUrls) {
    try {
      const url = `${base}/api/audius${params}`;
      const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (r.ok) {
        return await r.json().catch(() => ({}));
      }
    } catch {}
  }
  return { tracks: [] };
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchScore(c: any, title: string, artist: string) {
  const ct = normalizeText(c?.nome_musica);
  const ca = normalizeText(c?.nome_artista);
  const wt = normalizeText(title);
  const wa = normalizeText(artist);
  let s = 0;
  if (ct === wt) s += 100;
  else if (ct.includes(wt) || wt.includes(ct)) s += 55;
  if (wa && ca === wa) s += 100;
  else if (wa && (ca.includes(wa) || wa.includes(ca))) s += 60;
  for (const w of wt.split(" ").filter(Boolean)) {
    if (w.length > 2 && ct.includes(w)) s += 5;
  }
  return s;
}

export async function resolveJamendoTrack(nomeMusica: string, nomeArtista: string): Promise<Track | null> {
  const candidateUrls = getCandidateBackendUrls();
  for (const base of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const url = `${base}/api/jamendo-search?nome_musica=${encodeURIComponent(nomeMusica)}&nome_artista=${encodeURIComponent(nomeArtista)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        if (d?.sucesso && d?.audioUrl) {
          return {
            nome_musica: d.nome_musica || nomeMusica,
            nome_artista: d.nome_artista || nomeArtista,
            duracao_ms: d.duracao_ms || 180000,
            album: d.album || "Jamendo",
            capa: d.capa || "",
            audioUrl: d.audioUrl,
            origem: "jamendo",
            sourceUrl: d.sourceUrl,
            isStreamable: true,
          };
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

export async function resolveDirectAudioTrack(nomeMusica: string, nomeArtista: string): Promise<Track | null> {
  // 1. Try Audius first (popular catalogue)
  try {
    const audiusTrack = await Promise.race([
      resolveAudiusTrack(nomeMusica, nomeArtista),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
    ]);
    if (audiusTrack?.audioUrl) return audiusTrack;
  } catch {}

  // 2. Try Jamendo
  try {
    const jamendoTrack = await Promise.race([
      resolveJamendoTrack(nomeMusica, nomeArtista),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (jamendoTrack?.audioUrl) return jamendoTrack;
  } catch {}

  return null;
}

export async function resolveAudiusTrack(nomeMusica: string, nomeArtista: string): Promise<Track | null> {
  const queries = [`${nomeMusica} ${nomeArtista}`, nomeMusica].filter((q, i, a) => q.trim() && a.indexOf(q) === i);
  const all: any[] = [];
  for (const q of queries) {
    try {
      const d = await audiusRequest(`?q=${encodeURIComponent(q)}`);
      if (Array.isArray(d?.tracks)) all.push(...d.tracks);
    } catch {}
  }
  if (!all.length) return null;
  const best = all.sort((a, b) => matchScore(b, nomeMusica, nomeArtista) - matchScore(a, nomeMusica, nomeArtista))[0];
  if (!best || !best.audioUrl) return null;
  const score = matchScore(best, nomeMusica, nomeArtista);
  // Strict matching only: avoid picking random indie music for commercial tracks
  if (score < 150) return null;
  return best as Track;
}

export async function searchMusicTracksClient(query: string): Promise<TrackSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // 1. Query server search-tracks endpoint (Spotify API + Innertube YouTube Music)
  const candidateUrls = getCandidateBackendUrls();
  for (const base of candidateUrls) {
    try {
      const r = await fetch(`${base}/api/search-tracks?q=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        if (Array.isArray(d?.tracks) && d.tracks.length > 0) {
          return d.tracks;
        }
      }
    } catch {}
  }

  // 2. Direct client-side Innertube Search fallback
  try {
    const directRes = await fetch("https://www.youtube.com/youtubei/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${q} music audio`,
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20230509.01.00",
            hl: "pt",
            gl: "BR",
          },
        },
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (directRes.ok) {
      const data: any = await directRes.json();
      const sectionList = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const tracks: TrackSearchResult[] = [];
      for (const sec of sectionList) {
        const items = sec.itemSectionRenderer?.contents || [];
        for (const item of items) {
          if (item.videoRenderer?.videoId) {
            const v = item.videoRenderer;
            const rawTitle = v.title?.runs?.[0]?.text || v.title?.simpleText || q;
            const cleanTitle = rawTitle.replace(/(\(Official.*?\)|\[Official.*?\]|Official Music Video|Official Audio|Clipe Oficial|Áudio Oficial)/gi, "").trim();
            const channel = v.ownerText?.runs?.[0]?.text?.replace(/ - Topic|VEVO/g, "").trim() || "Música";
            const thumb = v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url || "";
            const durText = v.lengthText?.simpleText || "3:30";
            const parts = durText.split(":").map(Number);
            const durMs = parts.length === 2 ? (parts[0] * 60 + parts[1]) * 1000 : 210000;

            tracks.push({
              nome_musica: cleanTitle || rawTitle,
              nome_artista: channel,
              album: "YouTube Music",
              duracao_ms: durMs,
              capa: thumb,
              videoId: v.videoId,
              origem: "youtube",
            });
          }
        }
      }
      if (tracks.length > 0) return tracks;
    }
  } catch {}

  return [];
}

export async function fetchPlaylistSafe(urlOrId: string, spotifyToken?: string | null): Promise<{ data: PlaylistData; needsAuth?: boolean }> {
  const value = urlOrId.trim();

  // 1. Direct Presets Match
  if (PRESET_PLAYLISTS_CLIENT[value]) {
    const p = PRESET_PLAYLISTS_CLIENT[value];
    const presetData: PlaylistData = {
      sucesso: true,
      playlist_id: p.id,
      nome_playlist: p.name,
      descricao: p.description,
      capa_playlist: p.cover,
      total_faixas: p.tracks.length,
      faixas: p.tracks,
      modo: "preset",
    };
    cachePlaylistMetadata(presetData);
    return { data: presetData };
  }

  // 2. If client is completely offline, immediately attempt local cache
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = getCachedPlaylist(value) || getLastPlayedPlaylist();
    if (cached && Array.isArray(cached.faixas) && cached.faixas.length > 0) {
      return {
        data: {
          ...cached,
          modo: "offline_cached",
          aviso: "Modo Offline: Lista de faixas carregada da memória local.",
        },
      };
    }
  }

  const isSpotify = /spotify\.com|spotify:|spoti\.fi|spotify\.link/i.test(value);
  const isLikelySpotifyId = /^[A-Za-z0-9]{15,}$/.test(value);

  if (isSpotify || isLikelySpotifyId) {
    const candidateUrls = getCandidateBackendUrls();
    let lastError: string | null = null;

    for (const base of candidateUrls) {
      const endpoints = [
        `${base}/api/spotify-playlist?url=${encodeURIComponent(value)}`,
        `${base}/api/public-playlist?url=${encodeURIComponent(value)}`,
        `${base}/api/playlist?url=${encodeURIComponent(value)}`,
      ];

      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        try {
          const headers: Record<string, string> = { Accept: "application/json" };
          if (spotifyToken) {
            headers.Authorization = `Bearer ${spotifyToken}`;
          }

          const r = await fetch(endpoint, { headers, cache: "no-store", signal: controller.signal });
          clearTimeout(timeoutId);

          if (!r.ok) {
            if (r.status === 401 || r.status === 403) {
              return {
                data: {
                  sucesso: false,
                  playlist_id: value,
                  nome_playlist: "Playlist Privada",
                  descricao: "Esta playlist é privada ou restrita. Conecte sua conta do Spotify para acessá-la.",
                  total_faixas: 0,
                  faixas: [],
                  modo: "auth_required",
                  error: "Autenticação Spotify necessária.",
                },
                needsAuth: true,
              };
            }
            continue;
          }

          const d = await r.json().catch(() => ({}));
          if (d?.sucesso && Array.isArray(d.faixas) && d.faixas.length > 0) {
            const normalizedFaixas: Track[] = d.faixas.map((t: any) => ({
              ...t,
              origem: "spotify",
              isStreamable: true,
            }));

            const resultData: PlaylistData = {
              ...d,
              faixas: normalizedFaixas,
              total_faixas: normalizedFaixas.length,
              modo: d.modo || "spotify_embed_extractor",
              aviso: "Playlist carregada com sucesso!",
            };

            // Cache in local storage for offline access
            cachePlaylistMetadata(resultData);

            return { data: resultData };
          }
        } catch (e: any) {
          clearTimeout(timeoutId);
          lastError = e?.message || String(e);
        }
      }
    }

    // If it was explicitly a Spotify link/ID and failed, return an honest error rather than returning random songs!
    return {
      data: {
        sucesso: false,
        playlist_id: value,
        nome_playlist: "Playlist não encontrada",
        descricao: "Não foi possível carregar as faixas deste link do Spotify. Verifique se o link está correto ou se a playlist é pública.",
        total_faixas: 0,
        faixas: [],
        modo: "error",
        error: "Playlist do Spotify não encontrada ou inacessível.",
      },
    };
  }

  // 3. Search query (when user types song or artist name)
  try {
    const tracksFound = await searchMusicTracksClient(value);
    if (tracksFound.length > 0) {
      const tracks: Track[] = tracksFound.slice(0, 30).map((t) => ({ ...t, origem: "youtube", isStreamable: true }));
      const searchResultData: PlaylistData = {
        sucesso: true,
        playlist_id: value,
        nome_playlist: `Músicas: ${value}`,
        descricao: `Resultados encontrados para "${value}"`,
        capa_playlist: tracks[0]?.capa || "",
        total_faixas: tracks.length,
        faixas: tracks,
        modo: "search_results",
        aviso: "Resultados de pesquisa carregados com sucesso.",
      };
      cachePlaylistMetadata(searchResultData);
      return { data: searchResultData };
    }
  } catch (e: any) {
    console.warn("Search fallback error:", e);
  }

  // 4. Offline / Cached recovery fallback before returning error
  const cachedFallback = getCachedPlaylist(value) || getLastPlayedPlaylist();
  if (cachedFallback && Array.isArray(cachedFallback.faixas) && cachedFallback.faixas.length > 0) {
    return {
      data: {
        ...cachedFallback,
        modo: "offline_cached",
        aviso: "Modo Offline: Faixas recuperadas da persistência local (cache).",
      },
    };
  }

  // 5. Fallback error with actionable message
  return {
    data: {
      sucesso: false,
      playlist_id: value,
      nome_playlist: "Não foi possível carregar",
      descricao: "Verifique o link ou nome informado. Para playlists privadas, conecte sua conta Spotify no menu superior.",
      total_faixas: 0,
      faixas: [],
      modo: "error",
      error: "Playlist não encontrada ou link indisponível.",
    },
  };
}

const clientVideoIdCache = new Map<string, string>();

export async function resolveYouTubeVideoIdClient(nomeMusica: string, nomeArtista: string, existingVideoId?: string): Promise<string> {
  if (existingVideoId && /^[\w-]{11}$/.test(existingVideoId)) {
    return existingVideoId;
  }

  const query = `${nomeMusica} ${nomeArtista}`.trim();
  const cacheKey = query.toLowerCase();
  if (clientVideoIdCache.has(cacheKey)) {
    return clientVideoIdCache.get(cacheKey)!;
  }

  const candidateUrls = getCandidateBackendUrls();

  for (const base of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const url = `${base}/api/search?nome_musica=${encodeURIComponent(nomeMusica)}&nome_artista=${encodeURIComponent(nomeArtista)}&q=${encodeURIComponent(query)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        if (data?.videoId && typeof data.videoId === "string" && data.videoId.length === 11) {
          clientVideoIdCache.set(cacheKey, data.videoId);
          return data.videoId;
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }
  }

  // Direct client-side Innertube Search fallback
  try {
    const directRes = await fetch("https://www.youtube.com/youtubei/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${nomeMusica} ${nomeArtista} official audio`,
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20230509.01.00",
            hl: "pt",
            gl: "BR",
          },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (directRes.ok) {
      const d: any = await directRes.json();
      const sectionList = d.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      for (const sec of sectionList) {
        const items = sec.itemSectionRenderer?.contents || [];
        for (const item of items) {
          if (item.videoRenderer?.videoId) {
            const vid = item.videoRenderer.videoId;
            clientVideoIdCache.set(cacheKey, vid);
            return vid;
          }
        }
      }
    }
  } catch {}

  return existingVideoId || "";
}
