import type { CustomPlaylist, Track } from '../types';

const STORAGE_KEY = 'pm_custom_playlists';

export function getCustomPlaylists(): CustomPlaylist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Seed default favorite playlist if none exists
      const initial: CustomPlaylist[] = [
        {
          id: 'favorites',
          nome_playlist: 'Músicas Favoritas',
          capa_playlist: '',
          total_faixas: 0,
          faixas: [],
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAllCustomPlaylists(list: CustomPlaylist[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Erro ao salvar playlists no localStorage:', e);
  }
}

export function createCustomPlaylist(name: string, initialTracks: Track[] = []): CustomPlaylist {
  const trimmed = name.trim() || 'Nova Playlist';
  const playlists = getCustomPlaylists();
  const id = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newPl: CustomPlaylist = {
    id,
    nome_playlist: trimmed,
    capa_playlist: initialTracks[0]?.capa || '',
    total_faixas: initialTracks.length,
    faixas: initialTracks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  playlists.unshift(newPl);
  saveAllCustomPlaylists(playlists);
  return newPl;
}

export function addTracksToPlaylist(playlistId: string, newTracks: Track[]): CustomPlaylist | null {
  const playlists = getCustomPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return null;

  const current = playlists[idx];
  // Filter duplicates based on videoId or nome_musica+nome_artista
  const existingKeys = new Set(current.faixas.map(t => t.videoId || `${t.nome_musica}_${t.nome_artista}`));
  const toAdd = newTracks.filter(t => !existingKeys.has(t.videoId || `${t.nome_musica}_${t.nome_artista}`));

  const updatedFaixas = [...current.faixas, ...toAdd];
  const updated: CustomPlaylist = {
    ...current,
    faixas: updatedFaixas,
    total_faixas: updatedFaixas.length,
    capa_playlist: current.capa_playlist || updatedFaixas[0]?.capa || '',
    updatedAt: new Date().toISOString()
  };

  playlists[idx] = updated;
  saveAllCustomPlaylists(playlists);
  return updated;
}

export function removeTrackFromPlaylist(playlistId: string, trackIndex: number): CustomPlaylist | null {
  const playlists = getCustomPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return null;

  const current = playlists[idx];
  const newFaixas = current.faixas.filter((_, i) => i !== trackIndex);
  const updated: CustomPlaylist = {
    ...current,
    faixas: newFaixas,
    total_faixas: newFaixas.length,
    capa_playlist: newFaixas[0]?.capa || '',
    updatedAt: new Date().toISOString()
  };

  playlists[idx] = updated;
  saveAllCustomPlaylists(playlists);
  return updated;
}

export function removeMultipleTracksFromPlaylist(playlistId: string, trackIndices: number[]): CustomPlaylist | null {
  const playlists = getCustomPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return null;

  const removeSet = new Set(trackIndices);
  const current = playlists[idx];
  const newFaixas = current.faixas.filter((_, i) => !removeSet.has(i));
  const updated: CustomPlaylist = {
    ...current,
    faixas: newFaixas,
    total_faixas: newFaixas.length,
    capa_playlist: newFaixas[0]?.capa || '',
    updatedAt: new Date().toISOString()
  };

  playlists[idx] = updated;
  saveAllCustomPlaylists(playlists);
  return updated;
}

export function renameCustomPlaylist(playlistId: string, newName: string): CustomPlaylist | null {
  const trimmed = newName.trim();
  if (!trimmed) return null;

  const playlists = getCustomPlaylists();
  const idx = playlists.findIndex(p => p.id === playlistId);
  if (idx === -1) return null;

  const updated: CustomPlaylist = {
    ...playlists[idx],
    nome_playlist: trimmed,
    updatedAt: new Date().toISOString()
  };

  playlists[idx] = updated;
  saveAllCustomPlaylists(playlists);
  return updated;
}

export function deleteCustomPlaylist(playlistId: string): void {
  const playlists = getCustomPlaylists().filter(p => p.id !== playlistId);
  saveAllCustomPlaylists(playlists);
}
