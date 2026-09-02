import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistData, Track, PlaybackStatus, AppTab, CloudTrackItem, CloudPlaylistItem } from './types';
import { loadYouTubeAPI } from './lib/youtubePlayer';
import {
  saveTrackToCloud,
  getCloudTracks,
  removeTrackFromCloud,
  getCloudPlaylists,
  createCloudPlaylist,
  addTracksToCloudPlaylist,
  removeTrackFromCloudPlaylist,
  removeMultipleTracksFromCloudPlaylist,
  renameCloudPlaylist,
  deleteCloudPlaylist,
  savePlaylistToCloud
} from './lib/cloudStorage';
import { testFirebaseConnection } from './firebase';
import { startBackgroundAudioKeeper, pauseBackgroundAudioKeeper, requestScreenWakeLock } from './lib/backgroundKeeper';
import { safeFetchJson, extractSpotifyDirectly } from './lib/spotifyResolver';
import { detectInputType, resolveYouTubeVideo, resolveYouTubePlaylist } from './lib/universalLinkResolver';
import './index.css';

const placeholder = 'https://placehold.co/120x120/1f1638/00f0ff?text=♫';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const getApiBase = () => '';

export default function App() {
  // Navigation & Tabs: 100% Cloud-Focused
  const [activeTab, setActiveTab] = useState<'search' | 'queue' | 'cloud_playlists' | 'cloud_tracks'>('search');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  // Queue & Track Lists (Transient runtime state, 0 MB on disk)
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [cloudTracks, setCloudTracks] = useState<CloudTrackItem[]>([]);
  const [cloudPlaylists, setCloudPlaylists] = useState<CloudPlaylistItem[]>([]);
  const [selectedCloudPlaylistId, setSelectedCloudPlaylistId] = useState<string | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [index, setIndex] = useState<number | null>(null);

  // Multi-Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  // Cloud Playlist Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [tracksToAddToPlaylist, setTracksToAddToPlaylist] = useState<Track[] | null>(null);

  // Playback State
  const [status, setStatus] = useState<PlaybackStatus>('unstarted');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Audio Engine Refs
  const ytPlayerRef = useRef<any>(null);
  const isYtReadyRef = useRef(false);
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioSourceRef = useRef<'native' | 'yt'>('yt');
  const timerRef = useRef<any>(null);

  // Synchronized state refs for callbacks
  const tracksRef = useRef<Track[]>([]);
  const indexRef = useRef<number | null>(null);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  // Load Cloud saved tracks & playlists from Firebase Firestore (0 MB on phone)
  const refreshCloud = useCallback(async () => {
    setLoadingCloud(true);
    try {
      const [tList, pList] = await Promise.all([
        getCloudTracks(),
        getCloudPlaylists()
      ]);
      setCloudTracks(tList);
      setCloudPlaylists(pList);
    } catch (e) {
      console.warn('Erro ao carregar dados da nuvem:', e);
    } finally {
      setLoadingCloud(false);
    }
  }, []);

  useEffect(() => {
    refreshCloud();
    testFirebaseConnection();
  }, [refreshCloud]);

  // Toast notification helper
  const showToast = (msg: string) => {
    setNotification(msg);
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.showToast) {
      try { (window as any).AndroidBridge.showToast(msg); } catch {}
    }
    setTimeout(() => setNotification(''), 3500);
  };

  // MediaSession Lockscreen integration
  const setMetadata = useCallback((track: Track | null) => {
    if (!track) return;
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.updateTrackInfo) {
      try {
        (window as any).AndroidBridge.updateTrackInfo(track.nome_musica, track.nome_artista, track.capa || '');
      } catch {}
    }
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.nome_musica,
        artist: track.nome_artista,
        album: track.album || playlist?.nome_playlist || 'Probe Music',
        artwork: track.capa ? [
          { src: track.capa, sizes: '300x300', type: 'image/jpeg' },
          { src: track.capa, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });
    } catch {}
  }, [playlist?.nome_playlist]);

  // Play next track
  const nextTrack = useCallback(() => {
    const list = tracksRef.current;
    const current = indexRef.current;
    if (!list.length) return;
    if (repeatRef.current === 'one' && current !== null) {
      playIndex(current);
      return;
    }

    let next = -1;
    if (shuffleRef.current) {
      const choices = list.map((_, i) => i).filter(i => i !== current && (list[i]?.videoId || list[i]?.audioBlobUrl || list[i]?.audioUrl));
      next = choices.length ? choices[Math.floor(Math.random() * choices.length)] : -1;
    } else {
      let i = current === null ? 0 : current + 1;
      while (i < list.length && !list[i]?.videoId && !list[i]?.audioBlobUrl && !list[i]?.audioUrl) i++;
      if (i < list.length) next = i;
      else if (repeatRef.current !== 'off') {
        next = list.findIndex(t => !!t.videoId || !!t.audioBlobUrl || !!t.audioUrl);
      }
    }
    if (next >= 0) playIndex(next);
    else setStatus('ended');
  }, []);

  // Play previous track
  const prevTrack = useCallback(() => {
    const current = indexRef.current;
    if (current === null) return;
    if (time > 3) {
      seekAudio(0);
      return;
    }
    let next = current - 1;
    while (next >= 0 && !tracksRef.current[next]?.videoId && !tracksRef.current[next]?.audioBlobUrl && !tracksRef.current[next]?.audioUrl) next--;
    if (next < 0) {
      for (let i = tracksRef.current.length - 1; i >= 0; i--) {
        if (tracksRef.current[i]?.videoId || tracksRef.current[i]?.audioBlobUrl || tracksRef.current[i]?.audioUrl) { next = i; break; }
      }
    }
    if (next >= 0) playIndex(next);
  }, [time]);

  // Initialize Native Audio Element and YouTube Engine
  useEffect(() => {
    let mounted = true;

    // Native HTML5 Audio (audio-only, ultra lightweight)
    const audio = new Audio();
    audio.preload = 'auto';
    nativeAudioRef.current = audio;

    audio.onplay = () => {
      setStatus('playing');
      startBackgroundAudioKeeper();
      requestScreenWakeLock();
      try { navigator.mediaSession.playbackState = 'playing'; } catch {}
    };
    audio.onpause = () => {
      setStatus('paused');
      pauseBackgroundAudioKeeper();
      try { navigator.mediaSession.playbackState = 'paused'; } catch {}
    };
    audio.onended = () => {
      nextTrack();
    };
    audio.ontimeupdate = () => {
      if (activeAudioSourceRef.current === 'native') {
        setTime(audio.currentTime);
        if (audio.duration && Number.isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      }
    };
    audio.onerror = () => {
      if (activeAudioSourceRef.current === 'native') {
        setStatus('error');
        showToast('Erro no áudio. Tentando próxima faixa...');
        nextTrack();
      }
    };

    // Load YouTube Iframe API (1x1px background audio-only engine)
    loadYouTubeAPI().then(() => {
      if (!mounted) return;
      if (window.YT && window.YT.Player && !ytPlayerRef.current) {
        ytPlayerRef.current = new window.YT.Player('myt-yt-engine', {
          height: '1',
          width: '1',
          videoId: 'dQw4w9WgXcQ',
          playerVars: {
            autoplay: 0,
            controls: 0,
            playsinline: 1,
            disablekb: 1,
            origin: window.location.origin
          },
          events: {
            onReady: () => {
              isYtReadyRef.current = true;
            },
            onStateChange: (event: any) => {
              if (activeAudioSourceRef.current !== 'yt') return;
              if (event.data === 1) {
                setStatus('playing');
                startBackgroundAudioKeeper();
                requestScreenWakeLock();
                try { navigator.mediaSession.playbackState = 'playing'; } catch {}
              } else if (event.data === 2) {
                setStatus('paused');
                pauseBackgroundAudioKeeper();
                try { navigator.mediaSession.playbackState = 'paused'; } catch {}
              } else if (event.data === 0) {
                nextTrack();
              } else if (event.data === 3) {
                setStatus('buffering');
              }
            },
            onError: (err: any) => {
              console.warn('YouTube engine error code:', err.data);
              if (activeAudioSourceRef.current === 'yt') {
                setStatus('error');
                showToast('Erro ao tocar faixa do YouTube. Indo para a próxima...');
                nextTrack();
              }
            }
          }
        });
      }
    });

    // YouTube polling ticker
    timerRef.current = setInterval(() => {
      if (activeAudioSourceRef.current === 'yt' && ytPlayerRef.current?.getCurrentTime) {
        try {
          const t = ytPlayerRef.current.getCurrentTime() || 0;
          const d = ytPlayerRef.current.getDuration() || 0;
          setTime(t);
          setDuration(d);
        } catch {}
      }
    }, 500);

    return () => {
      mounted = false;
      clearInterval(timerRef.current);
      audio.pause();
      audio.src = '';
    };
  }, [nextTrack]);

  // Main playback switcher
  const playIndex = useCallback(async (i: number) => {
    const list = tracksRef.current;
    if (i < 0 || i >= list.length) return;
    const track = list[i];
    if (!track) return;

    setIndex(i);
    setMetadata(track);
    setTime(0);
    setDuration(track.duracao_ms ? Math.round(track.duracao_ms / 1000) : 0);

    // Stop both engines before switching
    if (nativeAudioRef.current) {
      nativeAudioRef.current.pause();
      nativeAudioRef.current.removeAttribute('src');
      nativeAudioRef.current.load();
    }
    if (ytPlayerRef.current?.stopVideo) {
      ytPlayerRef.current.stopVideo();
    }

    // Engine 1: Direct Audio URL or Blob
    if (track.audioBlobUrl || track.audioUrl) {
      activeAudioSourceRef.current = 'native';
      const url = track.audioBlobUrl || track.audioUrl!;
      if (nativeAudioRef.current) {
        nativeAudioRef.current.src = url;
        nativeAudioRef.current.volume = muted ? 0 : volume / 100;
        try {
          await nativeAudioRef.current.play();
        } catch {
          setStatus('paused');
        }
      }
      return;
    }

    // Engine 2: YouTube Audio Stream via VideoId
    if (track.videoId) {
      activeAudioSourceRef.current = 'yt';
      if (ytPlayerRef.current?.loadVideoById) {
        ytPlayerRef.current.loadVideoById(track.videoId);
        ytPlayerRef.current.setVolume(muted ? 0 : volume);
        ytPlayerRef.current.playVideo();
      }
      return;
    }

    // If track doesn't have videoId or audioUrl yet, search online
    try {
      setStatus('buffering');
      showToast(`Buscando áudio de "${track.nome_musica}"...`);
      const r = await fetch(`${getApiBase()}/api/search?nome_musica=${encodeURIComponent(track.nome_musica)}&nome_artista=${encodeURIComponent(track.nome_artista)}`, { cache: 'no-store' });
      const result = await safeFetchJson(r);
      if (r.ok && result.videoId) {
        track.videoId = result.videoId;
        track.videoTitle = result.titulo;
        setTracks([...list]);
        activeAudioSourceRef.current = 'yt';
        if (ytPlayerRef.current?.loadVideoById) {
          ytPlayerRef.current.loadVideoById(result.videoId);
          ytPlayerRef.current.setVolume(muted ? 0 : volume);
          ytPlayerRef.current.playVideo();
        }
      } else {
        throw new Error('Áudio não localizado');
      }
    } catch {
      showToast(`Áudio não disponível para "${track.nome_musica}".`);
      nextTrack();
    }
  }, [muted, volume, nextTrack, setMetadata]);

  // MediaSession Action Handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safe = (action: MediaSessionAction, fn: () => void) => {
      try { ms.setActionHandler(action, fn); } catch {}
    };

    safe('play', () => {
      if (activeAudioSourceRef.current === 'native' && nativeAudioRef.current) {
        nativeAudioRef.current.play();
      } else if (ytPlayerRef.current?.playVideo) {
        ytPlayerRef.current.playVideo();
      } else if (indexRef.current !== null) {
        playIndex(indexRef.current);
      }
    });
    safe('pause', () => {
      if (activeAudioSourceRef.current === 'native' && nativeAudioRef.current) {
        nativeAudioRef.current.pause();
      } else {
        ytPlayerRef.current?.pauseVideo?.();
      }
    });
    safe('nexttrack', nextTrack);
    safe('previoustrack', prevTrack);
    safe('seekbackward', () => seekAudio(Math.max(0, time - 10)));
    safe('seekforward', () => seekAudio(time + 10));

    return () => {
      ['play','pause','nexttrack','previoustrack','seekbackward','seekforward'].forEach(name => {
        try { ms.setActionHandler(name as MediaSessionAction, null); } catch {}
      });
    };
  }, [nextTrack, prevTrack, playIndex, time]);

  const seekAudio = (seconds: number) => {
    setTime(seconds);
    if (activeAudioSourceRef.current === 'native' && nativeAudioRef.current) {
      nativeAudioRef.current.currentTime = seconds;
    } else if (ytPlayerRef.current?.seekTo) {
      ytPlayerRef.current.seekTo(seconds, true);
    }
  };

  const togglePlayPause = () => {
    if (indexRef.current === null) {
      const first = tracksRef.current.findIndex(t => !!t.videoId || !!t.audioBlobUrl || !!t.audioUrl);
      if (first >= 0) playIndex(first);
      return;
    }

    if (activeAudioSourceRef.current === 'native' && nativeAudioRef.current) {
      if (status === 'playing') nativeAudioRef.current.pause();
      else nativeAudioRef.current.play();
    } else {
      const p = ytPlayerRef.current;
      if (status === 'playing') p?.pauseVideo?.();
      else p?.playVideo?.();
    }
  };

  // Universal Search / Link Importer (Spotify, YouTube, Direct MP3, Search Query)
  const handleSearchOrImport = async () => {
    const val = query.trim();
    if (!val) {
      setError('Digite o nome de uma música ou cole o link do Spotify, YouTube ou áudio.');
      return;
    }

    setError('');
    setLoading(true);
    setProgress(0);

    const detected = detectInputType(val);

    // 1. DIRECT AUDIO FILE (.mp3, .m4a, .wav)
    if (detected.kind === 'direct_audio') {
      try {
        const directTrack: Track = {
          nome_musica: detected.filename,
          nome_artista: 'Web Audio',
          audioUrl: detected.audioUrl,
          duracao_ms: 180000,
          capa: placeholder
        };
        const updated = [directTrack, ...tracks];
        setTracks(updated);
        setActiveTab('queue');
        playIndex(0);
        showToast('Áudio da Web carregado com sucesso!');
      } catch (e: any) {
        setError(e?.message || 'Não foi possível carregar o arquivo de áudio.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 2. YOUTUBE SINGLE VIDEO / SHORTS / MUSIC LINK
    if (detected.kind === 'youtube_video') {
      try {
        showToast('Carregando áudio do YouTube...');
        const ytTrack = await resolveYouTubeVideo(detected.videoId, detected.url);
        const updated = [ytTrack, ...tracks.filter(t => t.videoId !== ytTrack.videoId)];
        setTracks(updated);
        setActiveTab('queue');
        playIndex(0);
        showToast(`▶ Tocando "${ytTrack.nome_musica}" (Apenas Áudio)`);
      } catch (e: any) {
        setError(e?.message || 'Erro ao processar vídeo do YouTube.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. YOUTUBE PLAYLIST LINK (Do NOT auto-play; wait for manual trigger)
    if (detected.kind === 'youtube_playlist') {
      try {
        showToast('Importando playlist do YouTube...');
        const ytPlaylistData = await resolveYouTubePlaylist(detected.listId, detected.url);

        if (!ytPlaylistData || !ytPlaylistData.faixas || ytPlaylistData.faixas.length === 0) {
          throw new Error('Nenhuma faixa encontrada nesta playlist do YouTube.');
        }

        setPlaylist(ytPlaylistData);
        setTracks(ytPlaylistData.faixas);
        setActiveTab('queue');
        showToast(`Playlist "${ytPlaylistData.nome_playlist}" carregada! Toque em ▶ Tocar quando quiser.`);
      } catch (e: any) {
        setError(e?.message || 'Não foi possível carregar a playlist do YouTube. Verifique se é pública.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 4. SPOTIFY PLAYLIST / ALBUM / TRACK (Do NOT auto-play; wait for manual trigger)
    if (detected.kind === 'spotify') {
      try {
        let data: PlaylistData | null = null;

        // Step 1: Server endpoint
        try {
          const response = await fetch(`${getApiBase()}/api/public-playlist?url=${encodeURIComponent(val)}`, {
            cache: 'no-store'
          });
          if (response.ok) {
            data = await safeFetchJson<PlaylistData>(response);
          }
        } catch (serverErr) {
          console.warn('Fallback para extração direta do Spotify:', serverErr);
        }

        // Step 2: Direct browser extraction fallback
        if (!data || !data.sucesso || !data.faixas || data.faixas.length === 0) {
          data = await extractSpotifyDirectly(val);
        }

        if (!data || !data.faixas || data.faixas.length === 0) {
          throw new Error('Nenhuma faixa encontrada no link fornecido. Verifique se a playlist é pública no Spotify.');
        }

        setPlaylist(data);

        const base = data.faixas || [];
        const resolved = [...base];
        let done = 0;
        for (let i = 0; i < resolved.length; i += 4) {
          const batch = resolved.slice(i, i + 4);
          await Promise.all(batch.map(async (track, j) => {
            try {
              const r = await fetch(`${getApiBase()}/api/search?nome_musica=${encodeURIComponent(track.nome_musica)}&nome_artista=${encodeURIComponent(track.nome_artista)}`, { cache: 'no-store' });
              const result = await safeFetchJson(r);
              resolved[i + j] = r.ok && result.videoId
                ? { ...track, videoId: result.videoId, videoTitle: result.titulo, hasError: false }
                : { ...track, hasError: true };
            } catch {
              resolved[i + j] = { ...track, hasError: true };
            } finally {
              done++;
              setProgress(Math.round((done / Math.max(base.length, 1)) * 100));
            }
          }));
          setTracks([...resolved]);
        }
        setTracks(resolved);
        setActiveTab('queue');
        showToast('Playlist importada com sucesso! Toque em ▶ Tocar para iniciar quando desejar.');
      } catch (e: any) {
        setError(e?.message || 'Não foi possível carregar a playlist. Verifique se o link é público.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 5. STANDARD TEXT SEARCH (Single Song)
    try {
      const r = await fetch(`${getApiBase()}/api/search?nome_musica=${encodeURIComponent(val)}`, { cache: 'no-store' });
      const result = await safeFetchJson(r);
      if (!r.ok || !result.videoId) throw new Error(result?.error || 'Música não encontrada.');

      const newTrack: Track = {
        nome_musica: result.titulo || val,
        nome_artista: result.canal || 'Artista',
        videoId: result.videoId,
        duracao_ms: (result.duracao || 180) * 1000,
        capa: result.capa || placeholder
      };

      const updated = [newTrack, ...tracks.filter(t => t.videoId !== newTrack.videoId)];
      setTracks(updated);
      setActiveTab('queue');
      playIndex(0);
      showToast('Música adicionada à fila!');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível encontrar essa música.');
    } finally {
      setLoading(false);
    }
  };

  // --- 100% CLOUD PLAYLIST MANAGEMENT (Firebase Firestore • 0 MB no Celular) ---

  const handleCreateCloudPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      showToast(`☁ Criando playlist "${newPlaylistName}" na Nuvem (0 MB)...`);
      const newPl = await createCloudPlaylist(newPlaylistName, tracksToAddToPlaylist || []);
      await refreshCloud();
      setIsCreateModalOpen(false);
      setNewPlaylistName('');
      setTracksToAddToPlaylist(null);
      showToast(`✔ Playlist "${newPl.nome_playlist}" salva na Nuvem (0 MB no celular)!`);
    } catch (e: any) {
      showToast(e?.message || 'Erro ao criar playlist na nuvem.');
    }
  };

  const handleAddSelectedToCloudPlaylist = async (plId: string) => {
    const activePl = selectedCloudPlaylistId
      ? cloudPlaylists.find(p => p.id === selectedCloudPlaylistId)
      : null;

    const listToUse = activePl ? (activePl.faixas || []) : tracks;

    const tracksToAdd = tracksToAddToPlaylist || (selectedIndices.length > 0
      ? selectedIndices.map(i => listToUse[i]).filter(Boolean)
      : []);

    if (!tracksToAdd.length) {
      showToast('Nenhuma música selecionada.');
      return;
    }

    try {
      showToast(`☁ Salvando ${tracksToAdd.length} música(s) na Nuvem...`);
      const updated = await addTracksToCloudPlaylist(plId, tracksToAdd);
      await refreshCloud();
      setTracksToAddToPlaylist(null);
      setIsSelectionMode(false);
      setSelectedIndices([]);
      if (updated) {
        showToast(`✔ ${tracksToAdd.length} música(s) adicionada(s) à "${updated.nome_playlist}" na Nuvem!`);
      }
    } catch (e: any) {
      showToast(e?.message || 'Erro ao adicionar músicas à playlist na nuvem.');
    }
  };

  const handleRemoveTrackFromActiveCloudPlaylist = async (plId: string, trackIdx: number) => {
    try {
      await removeTrackFromCloudPlaylist(plId, trackIdx);
      await refreshCloud();
      showToast('Música removida da playlist na Nuvem.');
    } catch (e: any) {
      showToast(e?.message || 'Erro ao remover música.');
    }
  };

  const handleRemoveSelectedFromCurrent = async () => {
    if (selectedCloudPlaylistId) {
      // Remove from Cloud Playlist (Firestore)
      try {
        await removeMultipleTracksFromCloudPlaylist(selectedCloudPlaylistId, selectedIndices);
        await refreshCloud();
        showToast(`${selectedIndices.length} música(s) removida(s) da playlist na Nuvem.`);
      } catch (e: any) {
        showToast(e?.message || 'Erro ao remover músicas na nuvem.');
      }
    } else {
      // Remove from active queue
      const removeSet = new Set(selectedIndices);
      const newTracks = tracks.filter((_, i) => !removeSet.has(i));
      setTracks(newTracks);
      showToast(`${selectedIndices.length} música(s) removida(s) da fila.`);
    }
    setIsSelectionMode(false);
    setSelectedIndices([]);
  };

  const handleDeleteCloudPlaylist = async (plId: string, plName: string) => {
    if (confirm(`Tem certeza que deseja excluir a playlist "${plName}" da Nuvem? (0 MB no celular)`)) {
      try {
        await deleteCloudPlaylist(plId);
        await refreshCloud();
        if (selectedCloudPlaylistId === plId) setSelectedCloudPlaylistId(null);
        showToast('Playlist excluída da Nuvem.');
      } catch (e: any) {
        showToast(e?.message || 'Erro ao excluir playlist.');
      }
    }
  };

  const handleRenameCloudPlaylist = async () => {
    if (!renameTarget || !renameTarget.name.trim()) return;
    try {
      await renameCloudPlaylist(renameTarget.id, renameTarget.name);
      await refreshCloud();
      setRenameTarget(null);
      showToast('Playlist renomeada na Nuvem!');
    } catch (e: any) {
      showToast(e?.message || 'Erro ao renomear playlist.');
    }
  };

  const playCloudPlaylist = (pl: CloudPlaylistItem) => {
    if (!pl.faixas || !pl.faixas.length) {
      showToast('Playlist vazia.');
      return;
    }
    setPlaylist({
      sucesso: true,
      playlist_id: pl.id,
      nome_playlist: pl.nome_playlist,
      capa_playlist: pl.capa_playlist,
      total_faixas: pl.total_faixas,
      faixas: pl.faixas
    });
    setTracks(pl.faixas);
    setActiveTab('queue');
    const first = pl.faixas.findIndex(t => !!t.videoId || !!t.audioBlobUrl || !!t.audioUrl);
    if (first >= 0) playIndex(first);
    showToast(`▶ Tocando playlist "${pl.nome_playlist}"`);
  };

  // Toggle selection for an index
  const toggleSelectIndex = (i: number) => {
    setSelectedIndices(prev =>
      prev.includes(i) ? prev.filter(idx => idx !== i) : [...prev, i]
    );
  };

  // Select all or deselect all
  const toggleSelectAll = (total: number) => {
    if (selectedIndices.length === total) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(Array.from({ length: total }, (_, i) => i));
    }
  };

  // Cloud persistence helper
  const handleSaveTrackToCloud = async (track: Track) => {
    if (!track.videoId && !track.nome_musica) return;
    try {
      showToast(`☁ Salvando "${track.nome_musica}" na Nuvem (0 MB)...`);
      await saveTrackToCloud(track);
      await refreshCloud();
      showToast(`✔ "${track.nome_musica}" salva na Nuvem (0 MB no celular)!`);
    } catch (e: any) {
      showToast(e?.message || 'Erro ao salvar na nuvem.');
    }
  };

  const handleSavePlaylistToCloud = async (plDataOverride?: PlaylistData) => {
    const plToSave = plDataOverride || (playlist ? { ...playlist, faixas: tracks } : null);
    if (!plToSave || !plToSave.faixas.length) {
      showToast('Nenhuma playlist ativa para salvar.');
      return;
    }
    try {
      showToast(`☁ Salvando "${plToSave.nome_playlist}" na Nuvem (0 MB)...`);
      await savePlaylistToCloud(plToSave);
      await refreshCloud();
      showToast(`✔ "${plToSave.nome_playlist}" salva na Nuvem (0 MB no celular)!`);
    } catch (e: any) {
      showToast(e?.message || 'Erro ao salvar playlist na nuvem.');
    }
  };

  const playCloudTrack = (item: CloudTrackItem) => {
    const tr: Track = {
      nome_musica: item.nome_musica,
      nome_artista: item.nome_artista,
      album: item.album,
      capa: item.capa,
      videoId: item.videoId,
      duracao_ms: (item.duracao || 210) * 1000
    };
    setTracks([tr, ...tracks.filter(t => t.videoId !== tr.videoId)]);
    playIndex(0);
    showToast(`▶ Tocando "${item.nome_musica}" da Nuvem`);
  };

  const current = index !== null ? tracks[index] : null;
  const activeCloudPlaylist = selectedCloudPlaylistId
    ? cloudPlaylists.find(p => p.id === selectedCloudPlaylistId)
    : null;

  return (
    <div className="app-container">
      {/* Hidden YouTube Engine - Audio Only (1x1 px) */}
      <div id="myt-yt-engine" style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, pointerEvents: 'none' }} />

      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #7b2cbf, #00f0ff)',
          color: '#070414',
          padding: '10px 20px',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 13,
          zIndex: 1000,
          boxShadow: '0 8px 25px rgba(0,0,0,0.6)'
        }}>
          {notification}
        </div>
      )}

      {/* Header */}
      <header className="myt-header">
        <div className="myt-header-content">
          <div className="brand-badge">
            <div className="brand-icon-box">
              <div className="brand-icon-inner">P</div>
            </div>
            <div>
              <div className="brand-title">Probe Music</div>
              <div className="brand-sub" style={{ color: '#00f0ff' }}>☁ 100% Na Nuvem • 0 MB no Celular</div>
            </div>
          </div>

          <div className="tabs-bar">
            <button
              className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => { setActiveTab('search'); setSelectedCloudPlaylistId(null); setIsSelectionMode(false); }}
            >
              🔍 Buscar
            </button>
            <button
              className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
              onClick={() => { setActiveTab('queue'); setSelectedCloudPlaylistId(null); setIsSelectionMode(false); }}
            >
              🎵 Fila ({tracks.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'cloud_playlists' ? 'active' : ''}`}
              onClick={() => { setActiveTab('cloud_playlists'); refreshCloud(); setIsSelectionMode(false); }}
            >
              ☁ Playlists ({cloudPlaylists.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'cloud_tracks' ? 'active' : ''}`}
              onClick={() => { setActiveTab('cloud_tracks'); refreshCloud(); setSelectedCloudPlaylistId(null); setIsSelectionMode(false); }}
            >
              ☁ Músicas ({cloudTracks.length})
            </button>
          </div>
        </div>
      </header>

      {/* Cloud Guarantee Top Banner */}
      <div style={{
        background: 'rgba(0, 240, 255, 0.08)',
        borderBottom: '1px solid rgba(0, 240, 255, 0.18)',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 12,
        color: '#00f0ff',
        fontWeight: 600
      }}>
        <span>☁ Armazenamento 100% na Nuvem (Firebase)</span>
        <span style={{ color: '#9d8db8' }}>•</span>
        <span>0 MB ocupados no seu dispositivo</span>
      </div>

      {/* Main Content Area */}
      <main>
        {/* TAB 1: SEARCH & UNIVERSAL LINK IMPORTER */}
        {activeTab === 'search' && (
          <div>
            <div className="search-card">
              <h1 className="search-title">Ouça Qualquer Música ou Playlist</h1>
              <p className="search-sub">
                Cole links do <b>Spotify</b>, <b>YouTube</b>, links diretos de <b>áudio MP3</b> ou digite o nome de qualquer música/artista.
              </p>

              <div className="search-input-group">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchOrImport()}
                  placeholder="Nome, artista, link do Spotify ou YouTube..."
                />
                <button
                  className="btn-primary"
                  onClick={handleSearchOrImport}
                  disabled={loading}
                >
                  {loading ? 'Processando…' : 'Buscar / Importar'}
                </button>
              </div>

              {loading && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ height: 4, background: '#1c1236', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #9d4edd, #00f0ff)', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#00f0ff', marginTop: 6, textAlign: 'right' }}>
                    {progress}% processado
                  </div>
                </div>
              )}

              {error && (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#290f1d', border: '1px solid #ff4081', color: '#ffb4d2', fontSize: 13 }}>
                  {error}
                </div>
              )}
            </div>

            {/* Quick Suggestions */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, color: '#9d8db8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Sugestões Rápidas
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Top Brasil', 'Matuê', 'Coldplay', 'Funk 2026', 'Sertanejo', 'Gospel', 'Rock Clássico', 'Eletrônica', 'Trap BR', 'Hits Internacionais'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => { setQuery(tag); }}
                    style={{
                      background: 'rgba(38, 26, 71, 0.6)',
                      border: '1px solid rgba(157, 78, 221, 0.3)',
                      color: '#e0aaff',
                      padding: '6px 14px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600
                    }}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Links Types Info Card */}
            <div style={{
              background: 'rgba(22, 15, 43, 0.4)',
              border: '1px solid rgba(157, 78, 221, 0.2)',
              borderRadius: 16,
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16
            }}>
              <div>
                <b style={{ color: '#00f0ff', fontSize: 13, display: 'block', marginBottom: 4 }}>🎵 Links do Spotify</b>
                <p style={{ color: '#9d8db8', fontSize: 12, margin: 0 }}>Playlists, álbuns ou músicas públicas.</p>
              </div>
              <div>
                <b style={{ color: '#ff4081', fontSize: 13, display: 'block', marginBottom: 4 }}>▶ Links do YouTube</b>
                <p style={{ color: '#9d8db8', fontSize: 12, margin: 0 }}>Vídeos ou playlists completas (Áudio super leve, sem vídeo).</p>
              </div>
              <div>
                <b style={{ color: '#c77dff', fontSize: 13, display: 'block', marginBottom: 4 }}>☁ Nuvem 0 MB</b>
                <p style={{ color: '#9d8db8', fontSize: 12, margin: 0 }}>Crie e salve playlists inteiras na Nuvem sem gastar memória do celular.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CURRENT QUEUE / PLAYLIST */}
        {activeTab === 'queue' && (
          <div>
            {playlist && (
              <div className="playlist-banner">
                <img src={playlist.capa_playlist || placeholder} alt="" />
                <div className="playlist-info">
                  <h2>{playlist.nome_playlist}</h2>
                  <p>{playlist.total_faixas} músicas carregadas</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        const first = tracks.findIndex(t => !!t.videoId || !!t.audioBlobUrl || !!t.audioUrl);
                        if (first >= 0) playIndex(first);
                      }}
                    >
                      ▶ Tocar Playlist
                    </button>
                    <button
                      className="pill-btn"
                      style={{ background: 'rgba(0, 240, 255, 0.15)', borderColor: '#00f0ff', color: '#00f0ff' }}
                      onClick={() => handleSavePlaylistToCloud()}
                    >
                      ☁ Salvar Playlist na Nuvem (0 MB)
                    </button>
                    <button
                      className="pill-btn"
                      style={{ background: 'rgba(157, 78, 221, 0.25)', borderColor: '#9d4edd' }}
                      onClick={() => {
                        setTracksToAddToPlaylist(tracks);
                      }}
                    >
                      + Adicionar a uma Playlist
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Queue Header & Multi-Selection Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Fila de Reprodução</h2>
                <span style={{ fontSize: 12, color: '#9d8db8' }}>{tracks.length} músicas na fila</span>
              </div>
              {tracks.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`pill-btn ${isSelectionMode ? 'primary' : ''}`}
                    onClick={() => {
                      setIsSelectionMode(!isSelectionMode);
                      setSelectedIndices([]);
                    }}
                  >
                    {isSelectionMode ? '✖ Cancelar Seleção' : '☑ Selecionar Músicas'}
                  </button>
                </div>
              )}
            </div>

            {/* Selection Action Bar (Visible when Selection Mode is active) */}
            {isSelectionMode && (
              <div className="selection-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    className="pill-btn"
                    onClick={() => toggleSelectAll(tracks.length)}
                  >
                    {selectedIndices.length === tracks.length ? '◻ Desmarcar Todas' : '☑ Selecionar Todas'}
                  </button>
                  <span style={{ fontSize: 13, color: '#00f0ff', fontWeight: 700 }}>
                    {selectedIndices.length} de {tracks.length} selecionadas
                  </span>
                </div>

                <div className="selection-actions">
                  <button
                    className="pill-btn primary"
                    disabled={selectedIndices.length === 0}
                    onClick={() => {
                      const selected = selectedIndices.map(i => tracks[i]).filter(Boolean);
                      setTracksToAddToPlaylist(selected);
                    }}
                  >
                    + Adicionar à Playlist na Nuvem
                  </button>
                  <button
                    className="pill-btn danger"
                    disabled={selectedIndices.length === 0}
                    onClick={handleRemoveSelectedFromCurrent}
                  >
                    🗑 Remover da Fila
                  </button>
                </div>
              </div>
            )}

            {/* Track Rows */}
            {tracks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6d5d88' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎵</div>
                <p>Nenhuma música na fila.</p>
                <button
                  className="btn-primary"
                  style={{ margin: '14px auto 0' }}
                  onClick={() => setActiveTab('search')}
                >
                  Pesquisar Músicas
                </button>
              </div>
            ) : (
              tracks.map((track, i) => {
                const isSelected = selectedIndices.includes(i);
                return (
                  <div
                    key={`${track.nome_musica}-${i}`}
                    className={`track-row ${i === index ? 'active' : ''}`}
                    style={isSelected ? { borderColor: '#00f0ff', background: 'rgba(0, 240, 255, 0.12)' } : undefined}
                  >
                    {/* Index / Checkbox / Equalizer */}
                    {isSelectionMode ? (
                      <div
                        className={`custom-checkbox ${isSelected ? 'checked' : ''}`}
                        onClick={() => toggleSelectIndex(i)}
                      >
                        {isSelected && '✓'}
                      </div>
                    ) : (
                      <span style={{ color: '#6d5d88', fontSize: 12, textAlign: 'center' }}>
                        {i === index && status === 'playing' ? (
                          <div className="eq-bars">
                            <div className="eq-bar" />
                            <div className="eq-bar" />
                            <div className="eq-bar" />
                          </div>
                        ) : (
                          i + 1
                        )}
                      </span>
                    )}

                    <img src={track.capa || placeholder} alt="" />
                    <div
                      className="track-info-col"
                      style={{ cursor: 'pointer' }}
                      onClick={() => isSelectionMode ? toggleSelectIndex(i) : playIndex(i)}
                    >
                      <b>{track.nome_musica}</b>
                      <small>{track.nome_artista}</small>
                    </div>

                    {/* Quick Add to Cloud Playlist Button */}
                    <button
                      className="action-btn"
                      title="Adicionar à Playlist na Nuvem"
                      style={{ color: '#c77dff', fontSize: 13, fontWeight: 700 }}
                      onClick={() => setTracksToAddToPlaylist([track])}
                    >
                      +♫
                    </button>

                    {/* Save to Cloud Library */}
                    <button
                      className="action-btn"
                      title="Salvar na Nuvem (0 MB no celular)"
                      style={{ color: '#00f0ff' }}
                      onClick={() => handleSaveTrackToCloud(track)}
                    >
                      ☁
                    </button>

                    <button
                      className="action-btn"
                      style={{ color: i === index && status === 'playing' ? '#00f0ff' : '#9d4edd' }}
                      onClick={() => playIndex(i)}
                    >
                      {i === index && status === 'playing' ? '⏸' : '▶'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: CLOUD PLAYLISTS MANAGER (100% Firebase Firestore • 0 MB no Celular) */}
        {activeTab === 'cloud_playlists' && (
          <div>
            {!selectedCloudPlaylistId ? (
              // Overview of all Cloud Playlists
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>Playlists na Nuvem</h2>
                    <p style={{ fontSize: 12, color: '#00f0ff' }}>
                      ☁ Salvas 100% no Firebase • 0 MB de memória ocupada no celular
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="pill-btn"
                      onClick={refreshCloud}
                      disabled={loadingCloud}
                    >
                      {loadingCloud ? 'Atualizando…' : '🔄 Atualizar'}
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        setTracksToAddToPlaylist(null);
                        setIsCreateModalOpen(true);
                      }}
                    >
                      + Criar Playlist na Nuvem
                    </button>
                  </div>
                </div>

                {cloudPlaylists.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6d5d88', background: 'rgba(22,15,43,0.4)', borderRadius: 18, border: '1px dashed rgba(0,240,255,0.3)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>☁</div>
                    <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Nenhuma playlist na Nuvem ainda</p>
                    <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
                      Crie sua primeira playlist na Nuvem! Todas as músicas ficam salvas no servidor sem gastar espaço do seu celular.
                    </p>
                    <button
                      className="btn-primary"
                      onClick={() => setIsCreateModalOpen(true)}
                    >
                      + Criar Playlist na Nuvem (0 MB)
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                    {cloudPlaylists.map(pl => (
                      <div
                        key={pl.id}
                        style={{
                          background: 'rgba(28, 18, 54, 0.7)',
                          border: '1px solid rgba(0, 240, 255, 0.25)',
                          borderRadius: 16,
                          padding: 14,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          transition: 'all 0.2s'
                        }}
                      >
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                          onClick={() => setSelectedCloudPlaylistId(pl.id)}
                        >
                          <img
                            src={pl.capa_playlist || placeholder}
                            alt=""
                            style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ display: 'block', fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {pl.nome_playlist}
                            </b>
                            <small style={{ color: '#00f0ff', fontSize: 12 }}>
                              {pl.total_faixas} faixas • ☁ 0 MB
                            </small>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="pill-btn primary"
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={() => playCloudPlaylist(pl)}
                            >
                              ▶ Tocar
                            </button>
                            <button
                              className="pill-btn"
                              style={{ padding: '4px 10px', fontSize: 11 }}
                              onClick={() => setSelectedCloudPlaylistId(pl.id)}
                            >
                              Abrir
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="action-btn"
                              title="Renomear Playlist"
                              onClick={() => setRenameTarget({ id: pl.id, name: pl.nome_playlist })}
                            >
                              ✏
                            </button>
                            <button
                              className="action-btn"
                              title="Excluir da Nuvem"
                              style={{ color: '#ff4081' }}
                              onClick={() => handleDeleteCloudPlaylist(pl.id, pl.nome_playlist)}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Detailed View of a Single Cloud Playlist
              activeCloudPlaylist && (
                <div>
                  <button
                    className="pill-btn"
                    style={{ marginBottom: 14 }}
                    onClick={() => {
                      setSelectedCloudPlaylistId(null);
                      setIsSelectionMode(false);
                      setSelectedIndices([]);
                    }}
                  >
                    ← Voltar para Playlists na Nuvem
                  </button>

                  <div className="playlist-banner">
                    <img src={activeCloudPlaylist.capa_playlist || placeholder} alt="" />
                    <div className="playlist-info">
                      <h2>{activeCloudPlaylist.nome_playlist}</h2>
                      <p>{activeCloudPlaylist.total_faixas} músicas salvas na Nuvem (0 MB no celular)</p>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                        <button
                          className="btn-primary"
                          onClick={() => playCloudPlaylist(activeCloudPlaylist)}
                        >
                          ▶ Tocar Tudo
                        </button>
                        <button
                          className="pill-btn"
                          onClick={() => setRenameTarget({ id: activeCloudPlaylist.id, name: activeCloudPlaylist.nome_playlist })}
                        >
                          ✏ Renomear
                        </button>
                        <button
                          className="pill-btn danger"
                          onClick={() => handleDeleteCloudPlaylist(activeCloudPlaylist.id, activeCloudPlaylist.nome_playlist)}
                        >
                          🗑 Excluir Playlist da Nuvem
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Header with multi-selection toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Faixas da Playlist na Nuvem</h3>
                    {activeCloudPlaylist.faixas.length > 0 && (
                      <button
                        className={`pill-btn ${isSelectionMode ? 'primary' : ''}`}
                        onClick={() => {
                          setIsSelectionMode(!isSelectionMode);
                          setSelectedIndices([]);
                        }}
                      >
                        {isSelectionMode ? '✖ Cancelar Seleção' : '☑ Selecionar Músicas'}
                      </button>
                    )}
                  </div>

                  {/* Multi-selection bar for Cloud Playlist */}
                  {isSelectionMode && (
                    <div className="selection-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                          className="pill-btn"
                          onClick={() => toggleSelectAll(activeCloudPlaylist.faixas.length)}
                        >
                          {selectedIndices.length === activeCloudPlaylist.faixas.length ? '◻ Desmarcar Todas' : '☑ Selecionar Todas'}
                        </button>
                        <span style={{ fontSize: 13, color: '#00f0ff', fontWeight: 700 }}>
                          {selectedIndices.length} de {activeCloudPlaylist.faixas.length} selecionadas
                        </span>
                      </div>

                      <div className="selection-actions">
                        <button
                          className="pill-btn primary"
                          disabled={selectedIndices.length === 0}
                          onClick={() => {
                            const selected = selectedIndices.map(i => activeCloudPlaylist.faixas[i]).filter(Boolean);
                            setTracksToAddToPlaylist(selected);
                          }}
                        >
                          + Copiar para Outra Playlist
                        </button>
                        <button
                          className="pill-btn danger"
                          disabled={selectedIndices.length === 0}
                          onClick={handleRemoveSelectedFromCurrent}
                        >
                          🗑 Remover Selecionadas da Nuvem
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tracks list */}
                  {activeCloudPlaylist.faixas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: '#6d5d88', background: 'rgba(22,15,43,0.4)', borderRadius: 18 }}>
                      <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Esta playlist ainda não tem músicas</p>
                      <p style={{ fontSize: 13, marginBottom: 14 }}>
                        Pesquise músicas ou vá para a Fila e toque em <b>+♫</b> para adicionar faixas aqui.
                      </p>
                      <button className="btn-primary" onClick={() => setActiveTab('search')}>
                        Buscar Músicas para Adicionar
                      </button>
                    </div>
                  ) : (
                    activeCloudPlaylist.faixas.map((track, i) => {
                      const isSelected = selectedIndices.includes(i);
                      return (
                        <div
                          key={`${track.nome_musica}-${i}`}
                          className="track-row"
                          style={isSelected ? { borderColor: '#00f0ff', background: 'rgba(0, 240, 255, 0.12)' } : undefined}
                        >
                          {isSelectionMode ? (
                            <div
                              className={`custom-checkbox ${isSelected ? 'checked' : ''}`}
                              onClick={() => toggleSelectIndex(i)}
                            >
                              {isSelected && '✓'}
                            </div>
                          ) : (
                            <span style={{ color: '#6d5d88', fontSize: 12, textAlign: 'center' }}>{i + 1}</span>
                          )}

                          <img src={track.capa || placeholder} alt="" />
                          <div
                            className="track-info-col"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              if (isSelectionMode) {
                                toggleSelectIndex(i);
                              } else {
                                setTracks(activeCloudPlaylist.faixas);
                                playIndex(i);
                              }
                            }}
                          >
                            <b>{track.nome_musica}</b>
                            <small>{track.nome_artista} • ☁ Nuvem (0 MB)</small>
                          </div>

                          <button
                            className="action-btn"
                            title="Remover desta playlist na Nuvem"
                            style={{ color: '#ff4081' }}
                            onClick={() => handleRemoveTrackFromActiveCloudPlaylist(activeCloudPlaylist.id, i)}
                          >
                            🗑
                          </button>
                          <button
                            className="action-btn"
                            style={{ color: '#00f0ff' }}
                            onClick={() => {
                              setTracks(activeCloudPlaylist.faixas);
                              playIndex(i);
                            }}
                          >
                            ▶
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* TAB 4: CLOUD TRACKS (Firebase Firestore • 0 MB Storage) */}
        {activeTab === 'cloud_tracks' && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(123, 44, 191, 0.25), rgba(0, 240, 255, 0.15))',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: 16,
              padding: '16px 20px',
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>☁</span>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: 0 }}>
                      Músicas Salvas na Nuvem
                    </h2>
                    <p style={{ fontSize: 12, color: '#00f0ff', margin: '2px 0 0' }}>
                      ⚡ 0 MB ocupados no celular • Sincronizado pelo Firebase
                    </p>
                  </div>
                </div>
                <button
                  className="pill-btn"
                  onClick={refreshCloud}
                  disabled={loadingCloud}
                >
                  {loadingCloud ? 'Atualizando…' : '🔄 Atualizar'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e0aaff', margin: 0 }}>
                  Faixas Favoritas ({cloudTracks.length})
                </h3>
              </div>

              {cloudTracks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: '#6d5d88', background: 'rgba(22,15,43,0.4)', borderRadius: 18, border: '1px dashed rgba(0,240,255,0.2)' }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>☁</div>
                  <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Nenhuma música salva individualmente na Nuvem</p>
                  <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
                    Toque no botão <b>☁ (Nuvem)</b> ao lado de qualquer música na Fila ou no Player para guardá-la com <b>0 MB</b> no celular!
                  </p>
                  <button className="btn-primary" onClick={() => setActiveTab('search')}>
                    Buscar Músicas para Salvar
                  </button>
                </div>
              ) : (
                cloudTracks.map(item => (
                  <div key={item.id} className="track-row">
                    <span style={{ color: '#00f0ff', fontSize: 14, textAlign: 'center' }}>☁</span>
                    <img src={item.capa || placeholder} alt="" />
                    <div
                      className="track-info-col"
                      style={{ cursor: 'pointer' }}
                      onClick={() => playCloudTrack(item)}
                    >
                      <b>{item.nome_musica}</b>
                      <small>{item.nome_artista} • Salva na Nuvem (0 MB)</small>
                    </div>
                    <button
                      className="action-btn"
                      title="Adicionar à Playlist na Nuvem"
                      style={{ color: '#c77dff', fontWeight: 700 }}
                      onClick={() => setTracksToAddToPlaylist([{
                        nome_musica: item.nome_musica,
                        nome_artista: item.nome_artista,
                        album: item.album,
                        capa: item.capa,
                        videoId: item.videoId,
                        duracao_ms: (item.duracao || 210) * 1000
                      }])}
                    >
                      +♫
                    </button>
                    <button
                      className="action-btn"
                      title="Excluir da Nuvem"
                      style={{ color: '#ff4081' }}
                      onClick={async () => {
                        await removeTrackFromCloud(item.id);
                        await refreshCloud();
                        showToast('Música removida da nuvem.');
                      }}
                    >
                      🗑
                    </button>
                    <button
                      className="action-btn"
                      style={{ color: '#00f0ff' }}
                      onClick={() => playCloudTrack(item)}
                    >
                      ▶
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Mini-Player */}
      <footer className="floating-player">
        <div className="player-inner">
          <div className="now-playing" onClick={() => setIsModalOpen(true)}>
            <img src={current?.capa || placeholder} alt="" />
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {current?.nome_musica || 'Probe Music'}
              </b>
              <small style={{ display: 'block', fontSize: 11, color: '#9d8db8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {current?.nome_artista || 'Toque para abrir o player'}
              </small>
            </div>
          </div>

          <div className="player-controls">
            <div className="control-buttons">
              <button style={{ color: '#c77dff', fontSize: 16 }} onClick={prevTrack}>⏮</button>
              <button className="play-main-btn" onClick={togglePlayPause}>
                {status === 'playing' ? '⏸' : '▶'}
              </button>
              <button style={{ color: '#c77dff', fontSize: 16 }} onClick={nextTrack}>⏭</button>
            </div>
            <div className="seek-bar-row">
              <span>{formatTime(time)}</span>
              <input
                type="range"
                className="seek-slider"
                min="0"
                max={duration || 1}
                step="1"
                value={Math.min(time, duration || 1)}
                onChange={e => seekAudio(Number(e.target.value))}
              />
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="player-extras">
            <button
              style={{ color: shuffle ? '#00f0ff' : '#6d5d88', fontSize: 15 }}
              onClick={() => setShuffle(s => !s)}
            >
              🔀
            </button>
            <button
              style={{ color: repeat !== 'off' ? '#00f0ff' : '#6d5d88', fontSize: 15 }}
              onClick={() => setRepeat(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
            >
              🔁{repeat === 'one' && <sup style={{ fontSize: 9 }}>1</sup>}
            </button>
            {current && (
              <>
                <button
                  style={{ color: '#c77dff', fontSize: 16 }}
                  title="Adicionar à Playlist na Nuvem"
                  onClick={() => setTracksToAddToPlaylist([current])}
                >
                  +♫
                </button>
                <button
                  style={{ color: '#00f0ff', fontSize: 16 }}
                  title="Salvar na Nuvem (0 MB no celular)"
                  onClick={() => handleSaveTrackToCloud(current)}
                >
                  ☁
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Modal: Add Track(s) to Cloud Playlist */}
      {tracksToAddToPlaylist && (
        <div className="simple-modal-backdrop" onClick={() => setTracksToAddToPlaylist(null)}>
          <div className="simple-modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: 0 }}>
                  Adicionar à Playlist na Nuvem
                </h3>
                <small style={{ color: '#00f0ff', fontSize: 11 }}>☁ Armazenamento 100% na Nuvem (0 MB)</small>
              </div>
              <button
                style={{ fontSize: 18, color: '#9d8db8' }}
                onClick={() => setTracksToAddToPlaylist(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#e0aaff', marginBottom: 16 }}>
              Adicionando {tracksToAddToPlaylist.length} música(s):
            </p>

            <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cloudPlaylists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#9d8db8', fontSize: 13 }}>
                  Você ainda não tem playlists na Nuvem. Crie uma abaixo!
                </div>
              ) : (
                cloudPlaylists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => handleAddSelectedToCloudPlaylist(pl.id)}
                    style={{
                      background: 'rgba(38, 26, 71, 0.6)',
                      border: '1px solid rgba(0, 240, 255, 0.25)',
                      borderRadius: 12,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: '#fff',
                      textAlign: 'left'
                    }}
                  >
                    <div>
                      <b style={{ display: 'block', fontSize: 14 }}>{pl.nome_playlist}</b>
                      <small style={{ color: '#00f0ff', fontSize: 11 }}>{pl.total_faixas} faixas • ☁ Nuvem</small>
                    </div>
                    <span style={{ color: '#00f0ff', fontSize: 13, fontWeight: 700 }}>+ Adicionar</span>
                  </button>
                ))
              )}
            </div>

            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
              onClick={() => {
                setIsCreateModalOpen(true);
              }}
            >
              + Criar Nova Playlist na Nuvem com estas músicas
            </button>
          </div>
        </div>
      )}

      {/* Modal: Create New Cloud Playlist */}
      {isCreateModalOpen && (
        <div className="simple-modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="simple-modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
              Nova Playlist na Nuvem
            </h3>
            <p style={{ fontSize: 12, color: '#00f0ff', marginBottom: 16 }}>
              ☁ Salva 100% no Firebase • 0 MB de consumo de memória no celular.
            </p>
            <input
              autoFocus
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateCloudPlaylist()}
              placeholder="Ex: Treino, Festa, Melhores do Trap..."
              style={{
                width: '100%',
                background: '#100a20',
                border: '1px solid rgba(0, 240, 255, 0.4)',
                borderRadius: 12,
                padding: '12px 14px',
                color: '#fff',
                fontSize: 14,
                marginBottom: 18,
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="pill-btn"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateCloudPlaylist}
                disabled={!newPlaylistName.trim()}
              >
                Criar na Nuvem (0 MB)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rename Cloud Playlist */}
      {renameTarget && (
        <div className="simple-modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="simple-modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Renomear Playlist na Nuvem
            </h3>
            <input
              autoFocus
              value={renameTarget.name}
              onChange={e => setRenameTarget({ ...renameTarget, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleRenameCloudPlaylist()}
              style={{
                width: '100%',
                background: '#100a20',
                border: '1px solid rgba(0, 240, 255, 0.4)',
                borderRadius: 12,
                padding: '12px 14px',
                color: '#fff',
                fontSize: 14,
                marginBottom: 18,
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="pill-btn"
                onClick={() => setRenameTarget(null)}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleRenameCloudPlaylist}
                disabled={!renameTarget.name.trim()}
              >
                Salvar Nome na Nuvem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Glowing Player Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-header">
            <button
              style={{ fontSize: 22, color: '#fff' }}
              onClick={() => setIsModalOpen(false)}
            >
              ⌄
            </button>
            <div style={{ textAlign: 'center' }}>
              <small style={{ color: '#00f0ff', fontSize: 11, fontWeight: 700 }}>TOCANDO AGORA</small>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{playlist?.nome_playlist || 'Probe Music'}</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                style={{ fontSize: 20, color: '#c77dff' }}
                title="Adicionar à Playlist na Nuvem"
                onClick={() => current && setTracksToAddToPlaylist([current])}
              >
                +♫
              </button>
              <button
                style={{ fontSize: 20, color: '#00f0ff' }}
                title="Salvar na Nuvem (0 MB)"
                onClick={() => current && handleSaveTrackToCloud(current)}
              >
                ☁
              </button>
            </div>
          </div>

          <div className="modal-art-box">
            <div className="modal-glow-ring" />
            <img className="modal-art" src={current?.capa || placeholder} alt="" />
          </div>

          <div style={{ textAlign: 'center', margin: '24px 0 16px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
              {current?.nome_musica || 'Nenhuma música'}
            </h2>
            <p style={{ fontSize: 14, color: '#9d8db8' }}>
              {current?.nome_artista || 'Probe Music Player'}
            </p>
          </div>

          {/* Seek Bar */}
          <div style={{ maxWidth: 450, margin: '0 auto 24px', width: '100%' }}>
            <input
              type="range"
              className="seek-slider"
              min="0"
              max={duration || 1}
              step="1"
              value={Math.min(time, duration || 1)}
              onChange={e => seekAudio(Number(e.target.value))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6d5d88', marginTop: 4 }}>
              <span>{formatTime(time)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Big Controls */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, marginBottom: 30 }}>
            <button
              style={{ fontSize: 20, color: shuffle ? '#00f0ff' : '#6d5d88' }}
              onClick={() => setShuffle(s => !s)}
            >
              🔀
            </button>
            <button style={{ fontSize: 26, color: '#fff' }} onClick={prevTrack}>⏮</button>
            <button
              className="play-main-btn"
              style={{ width: 64, height: 64, fontSize: 26 }}
              onClick={togglePlayPause}
            >
              {status === 'playing' ? '⏸' : '▶'}
            </button>
            <button style={{ fontSize: 26, color: '#fff' }} onClick={nextTrack}>⏭</button>
            <button
              style={{ fontSize: 20, color: repeat !== 'off' ? '#00f0ff' : '#6d5d88' }}
              onClick={() => setRepeat(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
            >
              🔁{repeat === 'one' && <sup style={{ fontSize: 9 }}>1</sup>}
            </button>
          </div>

          {/* Volume */}
          <div style={{ maxWidth: 300, margin: 'auto', display: 'flex', alignItems: 'center', gap: 12, color: '#9d8db8' }}>
            <span>🔈</span>
            <input
              type="range"
              className="seek-slider"
              min="0"
              max="100"
              value={muted ? 0 : volume}
              onChange={e => {
                const v = Number(e.target.value);
                setVolume(v);
                setMuted(v === 0);
              }}
            />
            <span>🔊</span>
          </div>
        </div>
      )}
    </div>
  );
}
