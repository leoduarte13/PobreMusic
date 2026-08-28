export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
  images?: { url: string; height?: number; width?: number }[];
  product?: string;
}

export interface UserPlaylistSummary {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  isCollaborative: boolean;
  trackCount: number;
  cover?: string;
  ownerName?: string;
}

export interface Track {
  nome_musica: string;
  nome_artista: string;
  duracao_ms?: number;
  album?: string;
  capa?: string;
  spotify_id?: string;
  videoId?: string;
  isLoadingVideo?: boolean;
  hasError?: boolean;
}

export interface PlaylistData {
  sucesso: boolean;
  playlist_id: string;
  nome_playlist: string;
  descricao?: string;
  capa_playlist?: string;
  total_faixas: number;
  faixas: Track[];
  modo?: string;
  aviso?: string;
  isPrivate?: boolean;
  autenticado?: boolean;
}

export interface YouTubeSearchResult {
  sucesso: boolean;
  query: string;
  videoId: string;
  titulo?: string;
  canal?: string;
  origem?: string;
}

export interface ConfigStatus {
  spotifyConfigured: boolean;
  youtubeConfigured: boolean;
  message?: string;
  appUrl?: string;
  devCallbackUrl?: string;
  prodCallbackUrl?: string;
}

export type PlaybackStatus = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued' | 'error';

export interface SavedPlaylist {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
  isCloud?: boolean;
}

export interface TrackSearchResult {
  nome_musica: string;
  nome_artista: string;
  duracao_ms?: number;
  album?: string;
  capa?: string;
  spotify_id?: string;
  videoId?: string;
  origem?: string;
}

export interface EqualizerPreset {
  id: string;
  name: string;
  bands: number[]; // 7 frequency bands in dB (-12 to +12)
  bassBoost?: number;
  surround?: boolean;
}

export interface EqualizerState {
  enabled: boolean;
  preset: string;
  bands: number[]; // [60Hz, 170Hz, 350Hz, 1kHz, 3.5kHz, 10kHz, 16kHz]
  bassBoost: number; // 0 to 100
  surround: boolean;
}

