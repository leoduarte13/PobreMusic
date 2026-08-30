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
  source?: 'piped';
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
