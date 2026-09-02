export interface Track {
  nome_musica: string;
  nome_artista: string;
  duracao_ms?: number;
  album?: string;
  capa?: string;
  spotify_id?: string;
  spotify_url?: string;
  videoId?: string;
  videoTitle?: string;
  audioUrl?: string;
  audioBlobUrl?: string;
  isOffline?: boolean;
  isDownloading?: boolean;
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
  error?: string;
}

export type PlaybackStatus = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued' | 'error';
export type AppTab = 'search' | 'queue' | 'playlists' | 'cloud' | 'downloads';

export interface CustomPlaylist {
  id: string;
  nome_playlist: string;
  capa_playlist?: string;
  total_faixas: number;
  faixas: Track[];
  createdAt: string;
  updatedAt?: string;
}

export interface CloudTrackItem {
  id: string;
  nome_musica: string;
  nome_artista: string;
  album?: string;
  capa?: string;
  videoId: string;
  duracao?: number;
  createdAt: string;
}

export interface CloudPlaylistItem {
  id: string;
  nome_playlist: string;
  capa_playlist?: string;
  total_faixas: number;
  faixas: Track[];
  createdAt: string;
}
