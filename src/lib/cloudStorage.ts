import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Track, PlaylistData, CloudTrackItem, CloudPlaylistItem, CustomPlaylist } from '../types';

const CLOUD_TRACKS_COL = 'cloud_tracks';
const CLOUD_PLAYLISTS_COL = 'cloud_playlists';

// Generate safe Firestore document ID
const sanitizeDocId = (str: string) => {
  return encodeURIComponent(str.trim().toLowerCase()).replace(/%/g, '_').slice(0, 120);
};

export async function saveTrackToCloud(track: Track): Promise<CloudTrackItem> {
  if (!track.nome_musica) throw new Error('Música inválida para salvar');

  const id = sanitizeDocId(`${track.nome_musica}_${track.nome_artista}_${track.videoId || 'novideo'}`);
  const item: CloudTrackItem = {
    id,
    nome_musica: track.nome_musica,
    nome_artista: track.nome_artista || 'Artista Desconhecido',
    album: track.album || '',
    capa: track.capa || '',
    videoId: track.videoId || '',
    duracao: track.duracao_ms ? Math.round(track.duracao_ms / 1000) : 210,
    createdAt: new Date().toISOString()
  };

  const docRef = doc(db, CLOUD_TRACKS_COL, id);
  await setDoc(docRef, item);
  return item;
}

export async function getCloudTracks(): Promise<CloudTrackItem[]> {
  try {
    const colRef = collection(db, CLOUD_TRACKS_COL);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: CloudTrackItem[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as CloudTrackItem);
    });
    return list;
  } catch (error) {
    console.warn('Erro ao buscar músicas da nuvem:', error);
    return [];
  }
}

export async function removeTrackFromCloud(trackId: string): Promise<void> {
  const docRef = doc(db, CLOUD_TRACKS_COL, trackId);
  await deleteDoc(docRef);
}

export async function getCloudPlaylists(): Promise<CloudPlaylistItem[]> {
  try {
    const colRef = collection(db, CLOUD_PLAYLISTS_COL);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: CloudPlaylistItem[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as CloudPlaylistItem);
    });
    return list;
  } catch (error) {
    console.warn('Erro ao buscar playlists da nuvem:', error);
    return [];
  }
}

export async function createCloudPlaylist(name: string, initialTracks: Track[] = []): Promise<CloudPlaylistItem> {
  const trimmed = name.trim() || 'Nova Playlist';
  const id = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item: CloudPlaylistItem = {
    id,
    nome_playlist: trimmed,
    capa_playlist: initialTracks[0]?.capa || '',
    total_faixas: initialTracks.length,
    faixas: initialTracks,
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
  const currentFaixas = current.faixas || [];

  const existingKeys = new Set(currentFaixas.map(t => t.videoId || `${t.nome_musica}_${t.nome_artista}`));
  const toAdd = newTracks.filter(t => !existingKeys.has(t.videoId || `${t.nome_musica}_${t.nome_artista}`));

  const updatedFaixas = [...currentFaixas, ...toAdd];
  const updated: CloudPlaylistItem = {
    ...current,
    faixas: updatedFaixas,
    total_faixas: updatedFaixas.length,
    capa_playlist: current.capa_playlist || updatedFaixas[0]?.capa || ''
  };

  await setDoc(docRef, updated);
  return updated;
}

export async function removeTrackFromCloudPlaylist(playlistId: string, trackIndex: number): Promise<CloudPlaylistItem | null> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const current = snap.data() as CloudPlaylistItem;
  const currentFaixas = current.faixas || [];
  const updatedFaixas = currentFaixas.filter((_, i) => i !== trackIndex);

  const updated: CloudPlaylistItem = {
    ...current,
    faixas: updatedFaixas,
    total_faixas: updatedFaixas.length,
    capa_playlist: updatedFaixas[0]?.capa || ''
  };

  await setDoc(docRef, updated);
  return updated;
}

export async function removeMultipleTracksFromCloudPlaylist(playlistId: string, trackIndices: number[]): Promise<CloudPlaylistItem | null> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const current = snap.data() as CloudPlaylistItem;
  const currentFaixas = current.faixas || [];
  const removeSet = new Set(trackIndices);
  const updatedFaixas = currentFaixas.filter((_, i) => !removeSet.has(i));

  const updated: CloudPlaylistItem = {
    ...current,
    faixas: updatedFaixas,
    total_faixas: updatedFaixas.length,
    capa_playlist: updatedFaixas[0]?.capa || ''
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
  const updated: CloudPlaylistItem = {
    ...current,
    nome_playlist: trimmed
  };

  await setDoc(docRef, updated);
  return updated;
}

export async function deleteCloudPlaylist(playlistId: string): Promise<void> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  await deleteDoc(docRef);
}

export async function savePlaylistToCloud(playlist: PlaylistData): Promise<CloudPlaylistItem> {
  if (!playlist.nome_playlist) throw new Error('Playlist sem nome');

  const id = sanitizeDocId(`pl_${playlist.nome_playlist}_${playlist.playlist_id || Date.now()}`);
  const item: CloudPlaylistItem = {
    id,
    nome_playlist: playlist.nome_playlist,
    capa_playlist: playlist.capa_playlist || '',
    total_faixas: playlist.faixas?.length || 0,
    faixas: playlist.faixas || [],
    createdAt: new Date().toISOString()
  };

  const docRef = doc(db, CLOUD_PLAYLISTS_COL, id);
  await setDoc(docRef, item);
  return item;
}

export async function removePlaylistFromCloud(playlistId: string): Promise<void> {
  const docRef = doc(db, CLOUD_PLAYLISTS_COL, playlistId);
  await deleteDoc(docRef);
}

