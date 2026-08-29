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

function soundCloudUrl(value: string): string | null {
  return /(?:^https?:\/\/)?(?:www\.)?soundcloud\.com\//i.test(value.trim()) ? value.trim() : null;
}

async function soundCloudRequest(params: string) {
  const response = await fetch(`${BACKEND}/api/soundcloud${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `SoundCloud ${response.status}`);
  return data;
}

export async function fetchSoundCloudPlaylist(input: string): Promise<PlaylistData> {
  const url = soundCloudUrl(input);
  if (!url) throw new Error("Cole um link válido do SoundCloud.");
  const data = await soundCloudRequest(`?url=${encodeURIComponent(url)}`);
  if (!data?.sucesso || !Array.isArray(data.faixas) || !data.faixas.length) throw new Error(data?.error || "Nenhuma faixa reproduzível foi encontrada no SoundCloud.");
  return data as PlaylistData;
}

export async function resolveSoundCloudTrack(nomeMusica: string, nomeArtista: string): Promise<Track> {
  const data = await soundCloudRequest(`?q=${encodeURIComponent(`${nomeMusica} ${nomeArtista}`)}`);
  const track = Array.isArray(data?.tracks) ? data.tracks[0] : null;
  if (!track?.audioUrl) throw new Error(`SoundCloud não encontrou áudio para ${nomeMusica} — ${nomeArtista}`);
  return track as Track;
}

export async function searchMusicTracksClient(query: string): Promise<TrackSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (soundCloudUrl(q)) {
    const data = await fetchSoundCloudPlaylist(q);
    return data.faixas.map((t) => ({ ...t, origem: "soundcloud" }));
  }
  const data = await soundCloudRequest(`?q=${encodeURIComponent(q)}`);
  return Array.isArray(data?.tracks) ? data.tracks : [];
}

export async function fetchPlaylistSafe(urlOrId: string): Promise<{ data: PlaylistData; needsAuth?: boolean }> {
  const value = urlOrId.trim();
  if (soundCloudUrl(value)) {
    try {
      const data = await fetchSoundCloudPlaylist(value);
      return { data };
    } catch (error: any) {
      return { data: { sucesso: false, playlist_id: value, nome_playlist: "SoundCloud", descricao: error?.message || "Não foi possível carregar a playlist do SoundCloud.", total_faixas: 0, faixas: [], modo: "soundcloud", error: error?.message || String(error) } };
    }
  }
  if (value && !value.includes("/") && !value.includes("http")) {
    try {
      const data = await searchMusicTracksClient(value);
      const tracks: Track[] = data.slice(0, 25).map((t) => ({ ...t, origem: "soundcloud" }));
      if (tracks.length) return { data: { sucesso: true, playlist_id: value, nome_playlist: `SoundCloud: ${value}`, descricao: "Resultados encontrados no SoundCloud", capa_playlist: tracks[0]?.capa || "", total_faixas: tracks.length, faixas: tracks, modo: "soundcloud", aviso: "Reprodução de áudio pelo SoundCloud." } };
    } catch {}
  }
  return { data: { sucesso: false, playlist_id: value, nome_playlist: "Link não suportado", descricao: "Use um link de playlist ou faixa do SoundCloud.", total_faixas: 0, faixas: [], modo: "soundcloud" } };
}

export async function resolveYouTubeVideoIdClient(nomeMusica: string, nomeArtista: string, existingVideoId?: string): Promise<string> {
  if (existingVideoId) return existingVideoId;
  throw new Error(`YouTube desativado nesta versão. Use SoundCloud: ${nomeMusica} — ${nomeArtista}`);
}
