import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Track, PlaylistData, CloudTrackItem, CloudPlaylistItem } from '../types';

const CLOUD_TRACKS_COL = 'cloud_tracks';
const CLOUD_PLAYLISTS_COL = 'cloud_playlists';
const SESSION_CACHE_KEY = 'pobremusic_active_session_v2';
const SAVED_TRACKS_LOCAL_CACHE = 'pobremusic_saved_track_ids';

// Sanitize Firestore Document ID safely (no invalid characters, no slash, no percent-escapes)
export const sanitizeDocId = (str: string): string => {
  const clean = String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (clean || `doc_${Date.now()}`).slice(0, 100);
};

// CRITICAL: Firestore setDoc strictly forbids `undefined` values.
// This sanitizer cleans any track object into clean primitives.
export function cleanTrackForFirestore(t: Partial<Track>): Track {
  return {
    nome_musica: String(t.nome_musica || 'Música').trim(),
    nome_artista: String(t.nome_artista || 'Artista Desconhecido').trim(),
    album: String(t.album || '').trim(),
    duracao_ms: Number.isFinite(t.duracao_ms) ? Number(t.duracao_ms) : 180000,
    capa: String(t.capa || '').trim(),
    videoId: String(t.videoId || '').trim(),
    videoTitle: String(t.videoTitle || '').trim(),
    hasError: Boolean(t.hasError)
  };
}

// Check if a track is considered saved (by unique key)
export function getTrackUniqueKey(t: { nome_musica: string; nome_artista?: string; videoId?: string }): string {
  const name = sanitizeDocId(t.nome_musica);
  const artist = sanitizeDocId(t.nome_artista || '');
  return `${name}_${artist}`;
}

// -------------------------------------------------------------
// CLOUD TRACKS (Salvar Músicas Favoritas / Individuais na Nuvem)
// -------------------------------------------------------------

export async function saveTrackToCloud(rawTrack: Track): Promise<CloudTrackItem> {
  const track = cleanTrackForFirestore(rawTrack);
  if (!track.nome_musica) throw new Error('Nome da música inválido');

  const id = sanitizeDocId(`trk_${track.nome_musica}_${track.nome_artista}`);
  const item: CloudTrackItem = {
    id,
    nome_musica: track.nome_musica,
    nome_artista: track.nome_artista,
    album: track.album || '',
    capa: track.capa || '',
    videoId: track.videoId || '',
    duracao: track.duracao_ms ? Math.round(track.duracao_ms / 1000) : 210,
    createdAt: new Date().toISOString()
  };

  try {
    const docRef = doc(db, CLOUD_TRACKS_COL, id);
    await setDoc(docRef, item);
  } catch (err: any) {
    console.error('Erro ao salvar no Firestore:', err);
    // Fallback: save to localStorage cache so the user never loses it
    saveTrackToLocalCache(item);
  }

  return item;
}

export async function getCloudTracks(): Promise<CloudTrackItem[]> {
  try {
    const colRef = collection(db, CLOUD_TRACKS_COL);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: CloudTrackItem[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        nome_musica: String(data.nome_musica || ''),
        nome_artista: String(data.nome_artista || ''),
        album: String(data.album || ''),
        capa: String(data.capa || ''),
        videoId: String(data.videoId || ''),
        duracao: Number(data.duracao || 210),
        createdAt: String(data.createdAt || new Date().toISOString())
      });
    });

    if (list.length > 0) {
      try {
        localStorage.setItem(SAVED_TRACKS_LOCAL_CACHE, JSON.stringify(list));
      } catch {}
    }
    return list;
  } catch (error) {
    console.warn('Erro ao buscar músicas da nuvem, usando cache local:', error);
    try {
      const cached = localStorage.getItem(SAVED_TRACKS_LOCAL_CACHE);
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  }
}

export async function removeTrackFromCloud(trackId: string): Promise<void> {
  try {
    const docRef = doc(db, CLOUD_TRACKS_COL, trackId);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Erro ao remover track da nuvem:', e);
  }
}

function saveTrackToLocalCache(item: CloudTrackItem) {
  try {
    const current = localStorage.getItem(SAVED_TRACKS_LOCAL_CACHE);
    const list: CloudTrackItem[] = current ? JSON.parse(current) : [];
    const filtered = list.filter(t => t.id !== item.id);
    filtered.unshift(item);
    localStorage.setItem(SAVED_TRACKS_LOCAL_CACHE, JSON.stringify(filtered.slice(0, 300)));
  } catch {}
}

// -------------------------------------------------------------
// CLOUD PLAYLISTS (Playlists Salvas na Nuvem • 0 MB no Celular)
// -------------------------------------------------------------

export async function getCloudPlaylists(): Promise<CloudPlaylistItem[]> {
  try {
    const colRef = collection(db, CLOUD_PLAYLISTS_COL);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: CloudPlaylistItem[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      const rawFaixas = Array.isArray(data.faixas) ? data.faixas : [];
      const cleanFaixas = rawFaixas.map(f => cleanTrackForFirestore(f));
      list.push({
        id: d.id,
        nome_playlist: String(data.nome_playlist || 'Playlist Sem Nome'),
        capa_playlist: String(data.capa_playlist || cleanFaixas[0]?.capa || ''),
        total_faixas: cleanFaixas.length,
        faixas: cleanFaixas,
        createdAt: String(data.createdAt || new Date().toISOString())
      });
    });
    return list;
  } catch (error) {
    console.warn('Erro ao buscar playlists da nuvem:', error);
    return [];
  }
}

export async function createCloudPlaylist(name: string, initialTracks: Track[] = []): Promise<CloudPlaylistItem> {
  const trimmed = name.trim() || 'Nova Playlist';
  const id = sanitizeDocId(`pl_${Date.now()}_${trimmed}`);
  const cleanFaixas = initialTracks.map(t => cleanTrackForFirestore(t));

  const item: CloudPlaylistItem = {
    id,
    nome_playlist: trimmed,
    capa_playlist: cleanFaixas[0]?.capa || '',
    total_faixas: cleanFaixas.length,
    faixas: cleanFaixas,
    createdAt: new Date().toISOString()
  };

  const docRef = doc(db, CLOUD_PLAYLISTS_COL, id);
  await setDoc(docRef, item);
  return item;
}

export async function savePlaylistToCloud(playlist: PlaylistData): Promise<CloudPlaylistItem> {
  if (!playlist.nome_playlist) throw new Error('Playlist sem nome');

  const id = sanitizeDocId(`pl_${playlist.nome_playlist}_${playlist.playlist_id || 'imported'}`);
  const cleanFaixas = (playlist.faixas || []).map(t => cleanTrackForFirestore(t));

  const item: CloudPlaylistItem = {
    id,
    nome_playlist: playlist.nome_playlist,
    capa_playlist: playlist.capa_playlist || cleanFaixas[0]?.capa || '',
    total_faixas: cleanFaixas.length,
    faixas: cleanFaixas,
    createdAt: new Date().toISOString()
  };

  const docRef = doc(db, CLOUD_PLAYLISTS_COL, id);
  await setDoc(docRef, item);
  return item;
}

export async function addTracksToCloudPlaylist(playlistId: string, newTracks: Track[]): Promise<CloudPlaylistItem | null> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const current = snap.data() as CloudPlaylistItem;
  const currentFaixas = (current.faixas || []).map(t => cleanTrackForFirestore(t));

  const existingKeys = new Set(currentFaixas.map(t => getTrackUniqueKey(t)));
  const toAdd = newTracks
    .map(t => cleanTrackForFirestore(t))
    .filter(t => !existingKeys.has(getTrackUniqueKey(t)));

  const updatedFaixas = [...currentFaixas, ...toAdd];
  const updated: CloudPlaylistItem = {
    id: playlistId,
    nome_playlist: current.nome_playlist || 'Playlist',
    faixas: updatedFaixas,
    total_faixas: updatedFaixas.length,
    capa_playlist: current.capa_playlist || updatedFaixas[0]?.capa || '',
    createdAt: current.createdAt || new Date().toISOString()
  };

  await setDoc(docRef, updated);
  return updated;
}

export async function removeTrackFromCloudPlaylist(playlistId: string, trackIndex: number): Promise<CloudPlaylistItem | null> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const current = snap.data() as CloudPlaylistItem;
  const currentFaixas = (current.faixas || []).map(t => cleanTrackForFirestore(t));
  const updatedFaixas = currentFaixas.filter((_, i) => i !== trackIndex);

  const updated: CloudPlaylistItem = {
    id: playlistId,
    nome_playlist: current.nome_playlist || 'Playlist',
    faixas: updatedFaixas,
    total_faixas: updatedFaixas.length,
    capa_playlist: updatedFaixas[0]?.capa || '',
    createdAt: current.createdAt || new Date().toISOString()
  };

  await setDoc(docRef, updated);
  return updated;
}

export async function removeMultipleTracksFromCloudPlaylist(playlistId: string, trackIndices: number[]): Promise<CloudPlaylistItem | null> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const current = snap.data() as CloudPlaylistItem;
  const currentFaixas = (current.faixas || []).map(t => cleanTrackForFirestore(t));
  const removeSet = new Set(trackIndices);
  const updatedFaixas = currentFaixas.filter((_, i) => !removeSet.has(i));

  const updated: CloudPlaylistItem = {
    id: playlistId,
    nome_playlist: current.nome_playlist || 'Playlist',
    faixas: updatedFaixas,
    total_faixas: updatedFaixas.length,
    capa_playlist: updatedFaixas[0]?.capa || '',
    createdAt: current.createdAt || new Date().toISOString()
  };

  await setDoc(docRef, updated);
  return updated;
}

export async function renameCloudPlaylist(playlistId: string, newName: string): Promise<CloudPlaylistItem | null> {
  const trimmed = newName.trim();
  if (!trimmed) return null;

  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const current = snap.data() as CloudPlaylistItem;
  const cleanFaixas = (current.faixas || []).map(t => cleanTrackForFirestore(t));
  const updated: CloudPlaylistItem = {
    id: playlistId,
    nome_playlist: trimmed,
    capa_playlist: current.capa_playlist || cleanFaixas[0]?.capa || '',
    total_faixas: cleanFaixas.length,
    faixas: cleanFaixas,
    createdAt: current.createdAt || new Date().toISOString()
  };

  await setDoc(docRef, updated);
  return updated;
}

export async function deleteCloudPlaylist(playlistId: string): Promise<void> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  await deleteDoc(docRef);
}

// -------------------------------------------------------------
// SPOTIFY-LIKE PERSISTENCE (Sessão Ativa & Auto-Save ao Importar)
// -------------------------------------------------------------

export interface ActiveSessionState {
  playlist: PlaylistData | null;
  tracks: Track[];
  index: number | null;
  time?: number;
  timestamp: number;
}

// Salva o estado atual da fila e playlist no cache do navegador para restauração instantânea no F5/refresh
export function saveSessionState(state: { playlist: PlaylistData | null; tracks: Track[]; index: number | null; time?: number }): void {
  if (typeof window === 'undefined') return;
  try {
    const cleanTracks = (state.tracks || []).slice(0, 250).map(cleanTrackForFirestore);
    const cleanPl: PlaylistData | null = state.playlist ? {
      sucesso: true,
      playlist_id: String(state.playlist.playlist_id || 'active'),
      nome_playlist: String(state.playlist.nome_playlist || 'Playlist Ativa'),
      capa_playlist: String(state.playlist.capa_playlist || cleanTracks[0]?.capa || ''),
      total_faixas: cleanTracks.length,
      faixas: cleanTracks
    } : null;

    const data: ActiveSessionState = {
      playlist: cleanPl,
      tracks: cleanTracks,
      index: state.index,
      time: state.time || 0,
      timestamp: Date.now()
    };
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Erro ao salvar sessão local:', e);
  }
}

// Restaura a playlist e a fila ao recarregar a página (F5)
export function loadSessionState(): ActiveSessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed: ActiveSessionState = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
      return {
        playlist: parsed.playlist,
        tracks: parsed.tracks.map(cleanTrackForFirestore),
        index: parsed.index,
        time: parsed.time || 0,
        timestamp: parsed.timestamp || Date.now()
      };
    }
  } catch (e) {
    console.warn('Erro ao restaurar sessão local:', e);
  }
  return null;
}
