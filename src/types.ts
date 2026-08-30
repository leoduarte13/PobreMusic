export interface SpotifyUser { id:string; display_name:string; email?:string; images?:{url:string;height?:number;width?:number}[]; product?:string; }
export interface UserPlaylistSummary { id:string; name:string; description?:string; isPrivate:boolean; isCollaborative:boolean; trackCount:number; cover?:string; ownerName?:string; }
export interface Track { nome_musica:string; nome_artista:string; duracao_ms?:number; album?:string; capa?:string; spotify_id?:string; spotify_url?:string; videoId?:string; audioUrl?:string; previewUrl?:string; soundcloud_id?:string; soundcloud_url?:string; audius_id?:string; sourceUrl?:string; origem?:string; isStreamable?:boolean; isLoadingVideo?:boolean; hasError?:boolean; }
export interface PlaylistData { sucesso:boolean; playlist_id:string; nome_playlist:string; descricao?:string; capa_playlist?:string; total_faixas:number; faixas:Track[]; modo?:string; aviso?:string; isPrivate?:boolean; autenticado?:boolean; error?:string; }
export interface YouTubeSearchResult { sucesso:boolean; query:string; videoId:string; titulo?:string; canal?:string; origem?:string; }
export interface ConfigStatus { spotifyConfigured:boolean; youtubeConfigured:boolean; message?:string; appUrl?:string; devCallbackUrl?:string; prodCallbackUrl?:string; }
export type PlaybackStatus='unstarted'|'ended'|'playing'|'paused'|'buffering'|'cued'|'error';
export interface GoogleUserProfile { uid:string; displayName:string|null; email:string|null; photoURL:string|null; }
export interface SavedPlaylist { id:string; userId?:string; name:string; description?:string; cover?:string; tracks:Track[]; createdAt:number; updatedAt:number; isCloud?:boolean; }
export interface TrackSearchResult { nome_musica:string; nome_artista:string; duracao_ms?:number; album?:string; capa?:string; spotify_id?:string; videoId?:string; audioUrl?:string; previewUrl?:string; soundcloud_id?:string; soundcloud_url?:string; origem?:string; }
export interface EqualizerPreset { id:string; name:string; bands:number[]; bassBoost?:number; surround?:boolean; }
export interface EqualizerState { enabled:boolean; preset:string; bands:number[]; bassBoost:number; surround:boolean; }
