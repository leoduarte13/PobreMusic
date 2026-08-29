import { PlaylistData, Track, TrackSearchResult } from "../types";

const BACKEND = "https://pobremusic.vercel.app";

export function getCandidateBackendUrls(): string[] {
  const urls: string[] = [];
  try {
    const custom = localStorage.getItem("custom_backend_url");
    if (custom?.startsWith("http")) urls.push(custom.replace(/\/+$/, ""));
  } catch {}
  if (typeof window !== "undefined" && window.location?.origin?.startsWith("http")) urls.push(window.location.origin);
  urls.push(BACKEND);
  return [...new Set(urls)];
}

export function extractYouTubeVideoId(input: string): string | null {
  const match = input?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
  return match?.[1] || (/^[\w-]{11}$/.test(input?.trim() || "") ? input.trim() : null);
}

export function parseSpotifyInput(input: string): { id: string; type: "playlist" | "album" | "track" | "preset" | "raw" } {
  const value = input.trim();
  const m = value.match(/(?:spotify\.com\/[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i) || value.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  if (m) return { type: m[1].toLowerCase() as any, id: m[2] };
  return { type: "raw", id: value.split("?")[0].split("/").pop()?.replace(/[^A-Za-z0-9_-]/g, "") || value };
}
export function extractSpotifyPlaylistId(input: string): string { return parseSpotifyInput(input).id; }

async function audiusRequest(params: string) {
  const response = await fetch(`${BACKEND}/api/audius${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Audius ${response.status}`);
  return data;
}

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchScore(candidate: any, title: string, artist: string): number {
  const ct = normalizeText(candidate?.nome_musica);
  const ca = normalizeText(candidate?.nome_artista);
  const wt = normalizeText(title);
  const wa = normalizeText(artist);
  let score = 0;
  if (ct === wt) score += 100;
  else if (ct.includes(wt) || wt.includes(ct)) score += 55;
  if (wa && ca === wa) score += 100;
  else if (wa && (ca.includes(wa) || wa.includes(ca))) score += 60;
  for (const word of wt.split(" ").filter(Boolean)) if (word.length > 2 && ct.includes(word)) score += 5;
  return score;
}

export async function resolveAudiusTrack(nomeMusica: string, nomeArtista: string): Promise<Track> {
  const data = await audiusRequest(`?q=${encodeURIComponent(`${nomeMusica} ${nomeArtista}`)}`);
  const candidates = Array.isArray(data?.tracks) ? data.tracks : [];
  const best = candidates.sort((a: any, b: any) => matchScore(b, nomeMusica, nomeArtista) - matchScore(a, nomeMusica, nomeArtista))[0];
  if (!best?.audioUrl) throw new Error(`Audius não encontrou áudio para ${nomeMusica} — ${nomeArtista}`);
  return best as Track;
}

export async function searchMusicTracksClient(query: string): Promise<TrackSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await audiusRequest(`?q=${encodeURIComponent(q)}`);
  return Array.isArray(data?.tracks) ? data.tracks : [];
}

async function enrichWithAudius(tracks: Track[]): Promise<Track[]> {
  // Keep the playlist metadata from Spotify, but attach a direct Audius stream when an
  // adequately matching public track exists. Limit concurrency to respect Audius Free limits.
  const result = [...tracks];
  let cursor = 0;
  const worker = async () => {
    while (cursor < result.length) {
      const index = cursor++;
      const track = result[index];
      try {
        const match = await resolveAudiusTrack(track.nome_musica, track.nome_artista);
        const score = matchScore(match, track.nome_musica, track.nome_artista);
        if (score >= 80) result[index] = { ...track, audioUrl: match.audioUrl, origem: "audius", audius_id: match.audius_id, sourceUrl: match.sourceUrl, isStreamable: true } as Track;
        else result[index] = { ...track, origem: "spotify", isStreamable: false } as Track;
      } catch {
        result[index] = { ...track, origem: "spotify", isStreamable: false } as Track;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  return result;
}

export async function fetchPlaylistSafe(urlOrId: string, _spotifyToken?: string | null): Promise<{ data: PlaylistData; needsAuth?: boolean }> {
  const value = urlOrId.trim();
  const isSpotify = /spotify\.com|spotify:|spoti\.fi|spotify\.link/i.test(value);

  if (isSpotify || /^[A-Za-z0-9]{15,}$/.test(value)) {
    try {
      const response = await fetch(`${BACKEND}/api/spotify-playlist?url=${encodeURIComponent(value)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const spotifyData = await response.json().catch(() => ({}));
      if (!response.ok || !spotifyData?.sucesso || !Array.isArray(spotifyData.faixas)) {
        return { data: { sucesso: false, playlist_id: value, nome_playlist: "Spotify", descricao: spotifyData?.error || "Não foi possível carregar a playlist pública do Spotify.", total_faixas: 0, faixas: [], modo: "spotify_url_info_public", error: spotifyData?.error } };
      }
      const enriched = await enrichWithAudius(spotifyData.faixas as Track[]);
      const playable = enriched.filter((t) => t.audioUrl);
      return {
        data: {
          ...spotifyData,
          faixas: enriched,
          total_faixas: enriched.length,
          modo: "spotify_metadata_audius_audio",
          aviso: `${playable.length} de ${enriched.length} faixas possuem áudio disponível no Audius.`,
        },
      };
    } catch (error: any) {
      return { data: { sucesso: false, playlist_id: value, nome_playlist: "Spotify", descricao: error?.message || "Não foi possível carregar a playlist.", total_faixas: 0, faixas: [], modo: "spotify_metadata_audius_audio", error: error?.message || String(error) } };
    }
  }

  try {
    const data = await searchMusicTracksClient(value);
    const tracks: Track[] = data.slice(0, 25).map((t) => ({ ...t, origem: "audius" }));
    if (tracks.length) return { data: { sucesso: true, playlist_id: value, nome_playlist: `Audius: ${value}`, descricao: "Resultados encontrados no Audius", capa_playlist: tracks[0]?.capa || "", total_faixas: tracks.length, faixas: tracks, modo: "audius", aviso: "Reprodução de áudio pelo Audius." } };
  } catch (error: any) {
    return { data: { sucesso: false, playlist_id: value, nome_playlist: "Audius", descricao: error?.message || "Não foi possível pesquisar no Audius.", total_faixas: 0, faixas: [], modo: "audius", error: error?.message || String(error) } };
  }

  return { data: { sucesso: false, playlist_id: value, nome_playlist: "Não encontrado", descricao: "Nenhuma faixa encontrada no Audius.", total_faixas: 0, faixas: [], modo: "audius" } };
}

export async function resolveYouTubeVideoIdClient(nomeMusica: string, nomeArtista: string, existingVideoId?: string): Promise<string> {
  if (existingVideoId) return existingVideoId;
  throw new Error(`YouTube desativado. Audius é a fonte de áudio: ${nomeMusica} — ${nomeArtista}`);
}
