import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  savePlaylistToCloud,
  cleanTrackForFirestore,
  getTrackUniqueKey,
  saveSessionState,
  loadSessionState
} from './lib/cloudStorage';
import { testFirebaseConnection } from './firebase';
import {
  startBackgroundAudioKeeper,
  pauseBackgroundAudioKeeper,
  requestScreenWakeLock,
  releaseScreenWakeLock,
  toggleScreenWakeLock,
  SILENT_WAV
} from './lib/backgroundKeeper';
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

  // Queue & Track Lists (Spotify-like persistence & 100% Cloud Library)
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [cloudTracks, setCloudTracks] = useState<CloudTrackItem[]>([]);
  const [cloudPlaylists, setCloudPlaylists] = useState<CloudPlaylistItem[]>([]);
  const [selectedCloudPlaylistId, setSelectedCloudPlaylistId] = useState<string | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [isWakeLockOn, setIsWakeLockOn] = useState(false);

  // Multi-Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  // Cloud Playlist Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalTab, setCreateModalTab] = useState<'name' | 'link'>('name');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [importPlaylistLink, setImportPlaylistLink] = useState('');
  const [isImportingLink, setIsImportingLink] = useState(false);
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
  const [audioSourceType, setAudioSourceType] = useState<'html5' | 'yt'>('html5');

  // User Play Intent & Audio Engine Refs
  const userWantsPlayRef = useRef(false);
  const ytPlayerRef = useRef<any>(null);
  const isYtReadyRef = useRef(false);
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioSourceRef = useRef<'native' | 'yt'>('native');
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

  // Fast set lookup for saved tracks in the cloud library
  const savedTrackKeys = useMemo(() => {
    return new Set(cloudTracks.map(t => getTrackUniqueKey(t)));
  }, [cloudTracks]);

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

  // Restore session from cache so page refresh (F5) restores active playlist and queue immediately
  useEffect(() => {
    const session = loadSessionState();
    if (session && session.tracks && session.tracks.length > 0) {
      setTracks(session.tracks);
      if (session.playlist) setPlaylist(session.playlist);
      if (session.index !== null && session.index >= 0 && session.index < session.tracks.length) {
        setIndex(session.index);
      }
      if (session.time) setTime(session.time);
      setActiveTab('queue');
    }
    refreshCloud();
    testFirebaseConnection();
  }, [refreshCloud]);

  // Auto-sync session state whenever tracks or current track change
  useEffect(() => {
    if (tracks.length > 0) {
      saveSessionState({ playlist, tracks, index, time });
    }
  }, [tracks, playlist, index, time]);

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
          { src: track.capa, sizes: '96x96', type: 'image/jpeg' },
          { src: track.capa, sizes: '128x128', type: 'image/jpeg' },
          { src: track.capa, sizes: '192x192', type: 'image/jpeg' },
          { src: track.capa, sizes: '256x256', type: 'image/jpeg' },
          { src: track.capa, sizes: '384x384', type: 'image/jpeg' },
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

    audio.onloadedmetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration) && audio.duration > 1) {
        setDuration(audio.duration);
      }
    };

    audio.onplay = () => {
      setStatus('playing');
      setAudioSourceType('html5');
      userWantsPlayRef.current = true;
      startBackgroundAudioKeeper();
      requestScreenWakeLock().then(on => setIsWakeLockOn(on));
      try { navigator.mediaSession.playbackState = 'playing'; } catch {}
    };
    audio.onpause = () => {
      if (!userWantsPlayRef.current) {
        setStatus('paused');
        pauseBackgroundAudioKeeper();
        setIsWakeLockOn(false);
        try { navigator.mediaSession.playbackState = 'paused'; } catch {}
      }
    };
    audio.onended = () => {
      nextTrack();
    };
    audio.ontimeupdate = () => {
      if (activeAudioSourceRef.current === 'native') {
        const cur = audio.currentTime;
        setTime(cur);
        if (audio.duration && Number.isFinite(audio.duration)) {
          const dur = audio.duration;
          setDuration(dur);
          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            try {
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: audio.playbackRate || 1,
                position: Math.min(cur, dur)
              });
            } catch {}
          }
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
                // 1 = PLAYING
                setStatus('playing');
                userWantsPlayRef.current = true;
                startBackgroundAudioKeeper();
                requestScreenWakeLock().then(on => setIsWakeLockOn(on));
                try { navigator.mediaSession.playbackState = 'playing'; } catch {}
              } else if (event.data === 2) {
                // 2 = PAUSED
                // Check if pause was caused by backgrounding or OS screen lock
                const isHidden = typeof document !== 'undefined' && (document.visibilityState === 'hidden' || !document.hasFocus());
                if (userWantsPlayRef.current && isHidden) {
                  // Phone screen locked or tab backgrounded: keep audio keeper alive!
                  startBackgroundAudioKeeper();
                  setTimeout(() => {
                    if (userWantsPlayRef.current && ytPlayerRef.current?.playVideo) {
                      ytPlayerRef.current.playVideo();
                    }
                  }, 250);
                } else if (!userWantsPlayRef.current) {
                  setStatus('paused');
                  pauseBackgroundAudioKeeper();
                  setIsWakeLockOn(false);
                  try { navigator.mediaSession.playbackState = 'paused'; } catch {}
                }
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
          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && d > 0) {
            try {
              navigator.mediaSession.setPositionState({
                duration: d,
                playbackRate: 1,
                position: Math.min(t, d)
              });
            } catch {}
          }
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

  // Background pre-fetcher for the next track in the playlist
  // Ensures zero-delay continuous playback across songs in mobile background / lockscreen
  const prefetchNextTrack = (currentIndex: number, currentList: Track[]) => {
    const nextIdx = currentIndex + 1 < currentList.length ? currentIndex + 1 : (repeat === 'all' ? 0 : -1);
    if (nextIdx >= 0 && currentList[nextIdx]) {
      const nextT = currentList[nextIdx];
      if (!nextT.audioUrl && !nextT.audioBlobUrl) {
        fetch(`${getApiBase()}/api/search?nome_musica=${encodeURIComponent(nextT.nome_musica)}&nome_artista=${encodeURIComponent(nextT.nome_artista)}`, { cache: 'no-store' })
          .then(r => safeFetchJson(r))
          .then(res => {
            if (res?.sucesso && res.audioUrl) {
              nextT.audioUrl = res.audioUrl;
              if (res.duracao) nextT.duracao_ms = res.duracao * 1000;
              if (res.capa && !nextT.capa) nextT.capa = res.capa;
            }
          })
          .catch(() => {});
      }
    }
  };

  // Main playback switcher (Prioritizes 100% Mobile Background & Lockscreen HTML5 Native Audio)
  const playIndex = useCallback(async (i: number) => {
    const list = tracksRef.current;
    if (i < 0 || i >= list.length) return;
    const track = list[i];
    if (!track) return;

    userWantsPlayRef.current = true;
    startBackgroundAudioKeeper();
    requestScreenWakeLock().then(on => setIsWakeLockOn(on));

    setIndex(i);
    setMetadata(track);
    setTime(0);
    setDuration(track.duracao_ms ? Math.round(track.duracao_ms / 1000) : 0);

    // Stop YouTube video if it was playing
    if (ytPlayerRef.current?.stopVideo) {
      try { ytPlayerRef.current.stopVideo(); } catch {}
    }

    // Synchronously prime the native audio element within the user gesture window
    // This unlocks playback on mobile iOS Safari and Android Chrome without being blocked!
    if (nativeAudioRef.current) {
      if (!nativeAudioRef.current.src || nativeAudioRef.current.src === '') {
        nativeAudioRef.current.src = SILENT_WAV;
      }
      nativeAudioRef.current.play().catch(() => {});
    }

    // Helper: Identify and reject stale 30s preview links
    const is30sPreview = (u?: string, durMs?: number) => {
      if (!u) return false;
      if (u.includes('dzcdn.net') || u.includes('preview') || u.includes('apple.com')) return true;
      if (durMs && durMs <= 45000) return true;
      return false;
    };

    // Cleanse any old cached 30s preview URLs
    if (track.audioUrl && is30sPreview(track.audioUrl, track.duracao_ms)) {
      delete track.audioUrl;
      track.duracao_ms = undefined;
    }

    // Engine 1: Direct Audio URL or Blob (Instant HTML5 Native Audio - Full Tracks only)
    if (track.audioBlobUrl || (track.audioUrl && !is30sPreview(track.audioUrl, track.duracao_ms))) {
      activeAudioSourceRef.current = 'native';
      setAudioSourceType('html5');
      const url = track.audioBlobUrl || track.audioUrl!;
      if (nativeAudioRef.current) {
        nativeAudioRef.current.src = url;
        nativeAudioRef.current.volume = muted ? 0 : volume / 100;
        try {
          await nativeAudioRef.current.play();
          startBackgroundAudioKeeper();
          requestScreenWakeLock().then(on => setIsWakeLockOn(on));
          prefetchNextTrack(i, list);
        } catch {
          setStatus('paused');
        }
      }
      return;
    }

    // Engine 1.5: Query HTML5 Full Audio stream (Full length, no 30s previews)
    // Ensures full track playback in background and lockscreen
    try {
      setStatus('buffering');
      showToast(`Carregando faixa completa de "${track.nome_musica}"...`);
      const r = await fetch(
        `${getApiBase()}/api/search?nome_musica=${encodeURIComponent(track.nome_musica)}&nome_artista=${encodeURIComponent(track.nome_artista)}`,
        { cache: 'no-store' }
      );
      const result = await safeFetchJson(r);
      if (r.ok && result.sucesso) {
        if (result.audioUrl && !is30sPreview(result.audioUrl, result.duracao * 1000)) {
          track.audioUrl = result.audioUrl;
        }
        if (result.videoId && !track.videoId) {
          track.videoId = result.videoId;
        }
        if (result.capa && !track.capa) {
          track.capa = result.capa;
        }
        if (result.duracao) {
          track.duracao_ms = result.duracao * 1000;
          setDuration(result.duracao);
        }
        setTracks([...list]);
        setMetadata(track);

        // If direct HTML5 full audio stream is found, play it with native audio engine
        if (result.audioUrl && !is30sPreview(result.audioUrl, result.duracao * 1000) && nativeAudioRef.current) {
          activeAudioSourceRef.current = 'native';
          setAudioSourceType('html5');
          nativeAudioRef.current.src = result.audioUrl;
          nativeAudioRef.current.volume = muted ? 0 : volume / 100;
          try {
            await nativeAudioRef.current.play();
            startBackgroundAudioKeeper();
            requestScreenWakeLock().then(on => setIsWakeLockOn(on));
            prefetchNextTrack(i, list);
            return;
          } catch (playErr) {
            console.warn('Native audio play error, falling back to YouTube:', playErr);
          }
        }

        // Fallback to YouTube engine if HTML5 stream not available
        if (result.videoId) {
          activeAudioSourceRef.current = 'yt';
          setAudioSourceType('yt');
          if (ytPlayerRef.current?.loadVideoById) {
            ytPlayerRef.current.loadVideoById(result.videoId);
            ytPlayerRef.current.setVolume(muted ? 0 : volume);
            ytPlayerRef.current.playVideo();
          }
          return;
        }
      }
    } catch (e) {
      console.warn('HTML5 search failed, checking existing videoId', e);
    }

    // Engine 2: Existing YouTube VideoId Fallback
    if (track.videoId) {
      activeAudioSourceRef.current = 'yt';
      setAudioSourceType('yt');
      if (ytPlayerRef.current?.loadVideoById) {
        ytPlayerRef.current.loadVideoById(track.videoId);
        ytPlayerRef.current.setVolume(muted ? 0 : volume);
        ytPlayerRef.current.playVideo();
      }
      return;
    }

    showToast(`Áudio não disponível para "${track.nome_musica}". Indo para próxima...`);
    nextTrack();
  }, [muted, volume, nextTrack, setMetadata]);

  // MediaSession Action Handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safe = (action: MediaSessionAction, fn: () => void) => {
      try { ms.setActionHandler(action, fn); } catch {}
    };

    safe('play', () => {
      userWantsPlayRef.current = true;
      startBackgroundAudioKeeper();
      requestScreenWakeLock().then(on => setIsWakeLockOn(on));
      if (activeAudioSourceRef.current === 'native' && nativeAudioRef.current) {
        nativeAudioRef.current.play();
      } else if (ytPlayerRef.current?.playVideo) {
        ytPlayerRef.current.playVideo();
      } else if (indexRef.current !== null) {
        playIndex(indexRef.current);
      }
    });
    safe('pause', () => {
      userWantsPlayRef.current = false;
      pauseBackgroundAudioKeeper();
      setIsWakeLockOn(false);
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

    try {
      (ms as any).setActionHandler('seekto', (details: any) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          seekAudio(details.seekTime);
        }
      });
    } catch {}

    return () => {
      ['play','pause','nexttrack','previoustrack','seekbackward','seekforward','seekto'].forEach(name => {
        try { ms.setActionHandler(name as any, null); } catch {}
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
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: Math.min(seconds, duration)
        });
      } catch {}
    }
  };

  const togglePlayPause = () => {
    if (indexRef.current === null) {
      const first = tracksRef.current.findIndex(t => !!t.videoId || !!t.audioBlobUrl || !!t.audioUrl);
      if (first >= 0) playIndex(first);
      return;
    }

    if (activeAudioSourceRef.current === 'native' && nativeAudioRef.current) {
      if (status === 'playing') {
        userWantsPlayRef.current = false;
        nativeAudioRef.current.pause();
        pauseBackgroundAudioKeeper();
        setIsWakeLockOn(false);
      } else {
        userWantsPlayRef.current = true;
        startBackgroundAudioKeeper();
        requestScreenWakeLock().then(on => setIsWakeLockOn(on));
        nativeAudioRef.current.play();
      }
    } else {
      const p = ytPlayerRef.current;
      if (status === 'playing') {
        userWantsPlayRef.current = false;
        pauseBackgroundAudioKeeper();
        setIsWakeLockOn(false);
        p?.pauseVideo?.();
      } else {
        userWantsPlayRef.current = true;
        startBackgroundAudioKeeper();
        requestScreenWakeLock().then(on => setIsWakeLockOn(on));
        p?.playVideo?.();
      }
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
        setQuery('');
        setActiveTab('cloud_playlists');

        // Auto-save to Cloud Firestore (0 MB no celular, persistido na nuvem)
        try {
          const savedPl = await savePlaylistToCloud(ytPlaylistData);
          setCloudPlaylists(prev => [savedPl, ...prev.filter(p => p.id !== savedPl.id)]);
          setSelectedCloudPlaylistId(savedPl.id);
          refreshCloud();
        } catch (saveErr) {
          console.warn('Erro ao auto-salvar playlist na nuvem:', saveErr);
        }

        // Auto-save to session state (persistente contra F5 / recarregar página)
        saveSessionState({ playlist: ytPlaylistData, tracks: ytPlaylistData.faixas, index: null });

        showToast(`✔ Playlist "${ytPlaylistData.nome_playlist}" salva na Nuvem! Toque em ▶ Tocar quando desejar.`);
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
        setTracks(base);
        setQuery('');
        setActiveTab('cloud_playlists');

        // Auto-save immediately to Cloud Firestore (0 MB no celular, igual ao Spotify!)
        try {
          const savedPl = await savePlaylistToCloud(data);
          setCloudPlaylists(prev => [savedPl, ...prev.filter(p => p.id !== savedPl.id)]);
          setSelectedCloudPlaylistId(savedPl.id);
          refreshCloud();
          showToast(`☁ "${data.nome_playlist}" salva na Nuvem (0 MB no celular)!`);
        } catch (saveErr) {
          console.warn('Erro ao auto-salvar playlist:', saveErr);
        }

        // Auto-save to session state (permanece ao recarregar a página)
        saveSessionState({ playlist: data, tracks: base, index: null });
        setLoading(false); // Unblock the UI immediately so the user can import more playlists

        // Background stream resolver: pre-resolve audio in background
        const resolved = [...base];
        let done = 0;
        for (let i = 0; i < resolved.length; i += 4) {
          const batch = resolved.slice(i, i + 4);
          await Promise.all(batch.map(async (track, j) => {
            try {
              const r = await fetch(`${getApiBase()}/api/search?nome_musica=${encodeURIComponent(track.nome_musica)}&nome_artista=${encodeURIComponent(track.nome_artista)}`, { cache: 'no-store' });
              const result = await safeFetchJson(r);
              resolved[i + j] = r.ok && (result.audioUrl || result.videoId)
                ? {
                    ...track,
                    audioUrl: result.audioUrl || track.audioUrl,
                    videoId: result.videoId || track.videoId,
                    videoTitle: result.titulo,
                    capa: track.capa || result.capa,
                    duracao_ms: track.duracao_ms || (result.duracao ? result.duracao * 1000 : undefined),
                    hasError: false
                  }
                : { ...track, hasError: true };
            } catch {
              resolved[i + j] = { ...track, hasError: true };
            } finally {
              done++;
              setProgress(Math.round((done / Math.max(base.length, 1)) * 100));
            }
          }));
          setTracks([...resolved]);
          saveSessionState({ playlist: data, tracks: resolved, index: indexRef.current });
        }
        setTracks(resolved);
        saveSessionState({ playlist: data, tracks: resolved, index: indexRef.current });

        // Update Cloud Firestore playlist document with resolved tracks
        try {
          await savePlaylistToCloud({ ...data, faixas: resolved });
          refreshCloud();
        } catch {}

        showToast('Playlist pronta para ouvir! Toque em ▶ Tocar para iniciar quando desejar.');
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
      if (!r.ok || (!result.audioUrl && !result.videoId)) throw new Error(result?.error || 'Música não encontrada.');

      const newTrack: Track = {
        nome_musica: result.titulo || val,
        nome_artista: result.canal || 'Artista',
        audioUrl: result.audioUrl || undefined,
        videoId: result.videoId || undefined,
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

  const handleImportPlaylistFromLink = async (rawLink: string) => {
    const val = rawLink.trim();
    if (!val) {
      showToast('Por favor, cole um link válido do Spotify ou YouTube.');
      return;
    }
    const detected = detectInputType(val);
    if (detected.kind !== 'spotify' && detected.kind !== 'youtube_playlist') {
      showToast('Link não reconhecido como playlist do Spotify ou YouTube.');
      return;
    }

    try {
      setIsImportingLink(true);
      showToast('☁ Conectando e extraindo playlist...');
      let plData: PlaylistData | null = null;

      if (detected.kind === 'youtube_playlist') {
        plData = await resolveYouTubePlaylist(detected.listId, detected.url);
      } else if (detected.kind === 'spotify') {
        try {
          const response = await fetch(`${getApiBase()}/api/public-playlist?url=${encodeURIComponent(val)}`, { cache: 'no-store' });
          if (response.ok) {
            plData = await safeFetchJson<PlaylistData>(response);
          }
        } catch {}
        if (!plData || !plData.sucesso || !plData.faixas?.length) {
          plData = await extractSpotifyDirectly(val);
        }
      }

      if (!plData || !plData.faixas || plData.faixas.length === 0) {
        throw new Error('Nenhuma música encontrada neste link de playlist.');
      }

      showToast(`☁ Salvando "${plData.nome_playlist}" na Nuvem (0 MB)...`);
      const saved = await savePlaylistToCloud(plData);
      await refreshCloud();
      setSelectedCloudPlaylistId(saved.id);
      setActiveTab('cloud_playlists');
      setIsCreateModalOpen(false);
      setImportPlaylistLink('');
      showToast(`✔ Playlist "${saved.nome_playlist}" (${saved.total_faixas} faixas) salva com sucesso!`);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao importar playlist.');
    } finally {
      setIsImportingLink(false);
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

  // Cloud persistence helper (100% Firebase Firestore • 0 MB no celular)
  const handleSaveTrackToCloud = async (rawTrack: Track) => {
    const track = cleanTrackForFirestore(rawTrack);
    if (!track.nome_musica) return;

    const trackKey = getTrackUniqueKey(track);
    const isAlreadySaved = savedTrackKeys.has(trackKey);

    if (isAlreadySaved) {
      const existing = cloudTracks.find(t => getTrackUniqueKey(t) === trackKey);
      if (existing) {
        showToast(`Removendo "${track.nome_musica}" da Nuvem...`);
        try {
          await removeTrackFromCloud(existing.id);
          setCloudTracks(prev => prev.filter(t => t.id !== existing.id));
          showToast(`Removida da Nuvem: "${track.nome_musica}"`);
        } catch {
          showToast('Erro ao remover da nuvem.');
        }
        return;
      }
    }

    try {
      showToast(`☁ Salvando "${track.nome_musica}" na Nuvem (0 MB)...`);
      // Optimistic instant badge update
      const tempItem: CloudTrackItem = {
        id: `trk_${Date.now()}`,
        nome_musica: track.nome_musica,
        nome_artista: track.nome_artista,
        album: track.album || '',
        capa: track.capa || '',
        videoId: track.videoId || '',
        duracao: track.duracao_ms ? Math.round(track.duracao_ms / 1000) : 210,
        createdAt: new Date().toISOString()
      };
      setCloudTracks(prev => [tempItem, ...prev.filter(t => getTrackUniqueKey(t) !== trackKey)]);

      const saved = await saveTrackToCloud(track);
      setCloudTracks(prev => [saved, ...prev.filter(t => t.id !== tempItem.id && getTrackUniqueKey(t) !== trackKey)]);
      showToast(`✔ "${track.nome_musica}" salva na Nuvem (0 MB no celular)!`);
    } catch (e: any) {
      console.error('Erro ao salvar na nuvem:', e);
      await refreshCloud();
      showToast(e?.message || 'Erro ao salvar na nuvem.');
    }
  };

  const handleSavePlaylistToCloud = async (plDataOverride?: PlaylistData) => {
    const plToSave = plDataOverride || (playlist ? { ...playlist, faixas: tracks } : null);
    if (!plToSave || !plToSave.faixas || !plToSave.faixas.length) {
      showToast('Nenhuma playlist ativa para salvar.');
      return;
    }
    try {
      showToast(`☁ Salvando "${plToSave.nome_playlist}" na Nuvem (0 MB)...`);
      const saved = await savePlaylistToCloud(plToSave);
      setCloudPlaylists(prev => [saved, ...prev.filter(p => p.id !== saved.id)]);
      refreshCloud();
      showToast(`✔ "${plToSave.nome_playlist}" salva na Nuvem (0 MB no celular)!`);
    } catch (e: any) {
      console.error('Erro ao salvar playlist:', e);
      showToast(e?.message || 'Erro ao salvar playlist na nuvem.');
    }
  };

  const handleToggleWakeLock = async () => {
    const active = await toggleScreenWakeLock();
    setIsWakeLockOn(active);
    if (active) {
      showToast('🔒 Modo Segundo Plano ATIVO: A tela não desligará e o áudio continuará.');
    } else {
      showToast('Modo Segundo Plano desativado.');
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
              <div className="brand-title">PobreMusic</div>
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
            <button
              className="tab-btn"
              style={{
                borderColor: isWakeLockOn ? '#00f0ff' : 'rgba(0, 240, 255, 0.3)',
                background: isWakeLockOn ? 'rgba(0, 240, 255, 0.18)' : 'transparent',
                color: isWakeLockOn ? '#00f0ff' : '#9d8db8',
                fontWeight: 700
              }}
              onClick={handleToggleWakeLock}
              title="Modo Segundo Plano: Mantém a tela acordada e o áudio tocando no celular"
            >
              {isWakeLockOn ? '🔒 2º Plano: Ligado' : '📱 2º Plano'}
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
                  <p>{playlist.total_faixas} músicas carregadas • ☁ Sincronizada na Nuvem (0 MB)</p>
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

            {/* Background Audio Mode Notice / Quick Toggle */}
            <div style={{
              background: 'rgba(38, 26, 71, 0.55)',
              border: isWakeLockOn ? '1px solid rgba(0, 240, 255, 0.45)' : '1px solid rgba(157, 78, 221, 0.25)',
              borderRadius: 14,
              padding: '10px 14px',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{isWakeLockOn ? '🔒' : '📱'}</span>
                <div>
                  <b style={{ fontSize: 13, color: isWakeLockOn ? '#00f0ff' : '#fff' }}>
                    {isWakeLockOn ? 'Modo Segundo Plano: Ativo (Tela acordada)' : 'Música em Segundo Plano'}
                  </b>
                  <p style={{ margin: 0, fontSize: 11, color: '#9d8db8' }}>
                    {isWakeLockOn
                      ? 'O celular não desligará a tela e o pipeline de áudio está protegido.'
                      : 'Ative para evitar que celulares Android/iOS pausem o som ao apagar a tela.'}
                  </p>
                </div>
              </div>
              <button
                className={`pill-btn ${isWakeLockOn ? 'primary' : ''}`}
                style={{ fontSize: 11, padding: '5px 12px' }}
                onClick={handleToggleWakeLock}
              >
                {isWakeLockOn ? '✔ Tela Ativa' : 'Manter Tela Ativa'}
              </button>
            </div>

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
                    {(() => {
                      const isSaved = savedTrackKeys.has(getTrackUniqueKey(track));
                      return (
                        <button
                          className="action-btn"
                          title={isSaved ? "Música salva na Nuvem (0 MB) - Toque para remover" : "Salvar na Nuvem (0 MB no celular)"}
                          style={{
                            color: isSaved ? '#00f0ff' : '#6d5d88',
                            textShadow: isSaved ? '0 0 10px rgba(0, 240, 255, 0.7)' : 'none'
                          }}
                          onClick={() => handleSaveTrackToCloud(track)}
                        >
                          {isSaved ? '☁✔' : '☁'}
                        </button>
                      );
                    })()}

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
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="pill-btn"
                      onClick={refreshCloud}
                      disabled={loadingCloud}
                    >
                      {loadingCloud ? 'Atualizando…' : '🔄 Atualizar'}
                    </button>
                    <button
                      className="pill-btn"
                      onClick={() => {
                        setTracksToAddToPlaylist(null);
                        setCreateModalTab('link');
                        setIsCreateModalOpen(true);
                      }}
                    >
                      ☁ Importar Playlist (Link)
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        setTracksToAddToPlaylist(null);
                        setCreateModalTab('name');
                        setIsCreateModalOpen(true);
                      }}
                    >
                      + Criar Playlist
                    </button>
                  </div>
                </div>

                {cloudPlaylists.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6d5d88', background: 'rgba(22,15,43,0.4)', borderRadius: 18, border: '1px dashed rgba(0,240,255,0.3)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>☁</div>
                    <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Nenhuma playlist na Nuvem ainda</p>
                    <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
                      Crie ou importe suas playlists para a Nuvem! Ficam salvas com segurança no servidor sem gastar espaço do seu celular.
                    </p>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn-primary"
                        onClick={() => {
                          setTracksToAddToPlaylist(null);
                          setCreateModalTab('name');
                          setIsCreateModalOpen(true);
                        }}
                      >
                        + Criar Playlist na Nuvem
                      </button>
                      <button
                        className="pill-btn"
                        onClick={() => {
                          setTracksToAddToPlaylist(null);
                          setCreateModalTab('link');
                          setIsCreateModalOpen(true);
                        }}
                      >
                        ☁ Importar por Link (Spotify / YouTube)
                      </button>
                    </div>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <button
                      className="pill-btn"
                      onClick={() => {
                        setSelectedCloudPlaylistId(null);
                        setIsSelectionMode(false);
                        setSelectedIndices([]);
                      }}
                    >
                      ← Voltar para Playlists na Nuvem
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="pill-btn"
                        onClick={() => {
                          setTracksToAddToPlaylist(null);
                          setCreateModalTab('link');
                          setIsCreateModalOpen(true);
                        }}
                      >
                        ☁ Importar Outra Playlist
                      </button>
                      <button
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: 13 }}
                        onClick={() => {
                          setTracksToAddToPlaylist(null);
                          setCreateModalTab('name');
                          setIsCreateModalOpen(true);
                        }}
                      >
                        + Nova Playlist
                      </button>
                    </div>
                  </div>

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <small style={{ fontSize: 11, color: '#9d8db8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {current?.nome_artista || 'Toque para abrir o player'}
                </small>
                {current && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: audioSourceType === 'html5' ? 'rgba(0,240,255,0.15)' : 'rgba(255,64,129,0.15)',
                      color: audioSourceType === 'html5' ? '#00f0ff' : '#ff4081',
                      border: `1px solid ${audioSourceType === 'html5' ? 'rgba(0,240,255,0.4)' : 'rgba(255,64,129,0.4)'}`,
                      whiteSpace: 'nowrap'
                    }}
                    title={audioSourceType === 'html5' ? 'Áudio Nativo HTML5: Permite ouvir com a tela bloqueada ou em segundo plano' : 'Vídeo YouTube'}
                  >
                    {audioSourceType === 'html5' ? '⚡ Faixa Completa' : '📺 YT'}
                  </span>
                )}
              </div>
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
                {(() => {
                  const isSaved = savedTrackKeys.has(getTrackUniqueKey(current));
                  return (
                    <button
                      style={{
                        color: isSaved ? '#00f0ff' : '#6d5d88',
                        fontSize: 16,
                        textShadow: isSaved ? '0 0 10px rgba(0, 240, 255, 0.7)' : 'none'
                      }}
                      title={isSaved ? "Música salva na Nuvem (0 MB) - Toque para remover" : "Salvar na Nuvem (0 MB no celular)"}
                      onClick={() => handleSaveTrackToCloud(current)}
                    >
                      {isSaved ? '☁✔' : '☁'}
                    </button>
                  );
                })()}
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

      {/* Modal: Create or Import Cloud Playlist */}
      {isCreateModalOpen && (
        <div className="simple-modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="simple-modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
              {tracksToAddToPlaylist ? 'Nova Playlist com Músicas Selecionadas' : 'Playlist na Nuvem'}
            </h3>
            <p style={{ fontSize: 12, color: '#00f0ff', marginBottom: 14 }}>
              ☁ Armazenada 100% no Firebase • 0 MB de consumo de memória no celular.
            </p>

            {/* Tab selector if not creating from selected tracks */}
            {!tracksToAddToPlaylist && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 10 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    background: createModalTab === 'name' ? 'linear-gradient(135deg, #7928ca, #ff0080)' : 'transparent',
                    color: createModalTab === 'name' ? '#fff' : '#a093b8'
                  }}
                  onClick={() => setCreateModalTab('name')}
                >
                  ✏ Criar Vazia
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    background: createModalTab === 'link' ? 'linear-gradient(135deg, #00f0ff, #7928ca)' : 'transparent',
                    color: createModalTab === 'link' ? '#070314' : '#a093b8'
                  }}
                  onClick={() => setCreateModalTab('link')}
                >
                  ☁ Importar por Link
                </button>
              </div>
            )}

            {tracksToAddToPlaylist && (
              <div style={{ padding: '8px 12px', background: 'rgba(0,240,255,0.1)', borderRadius: 10, border: '1px solid rgba(0,240,255,0.3)', marginBottom: 14, fontSize: 12, color: '#00f0ff' }}>
                Adicionando <b>{tracksToAddToPlaylist.length}</b> música(s) a esta nova playlist
              </div>
            )}

            {createModalTab === 'name' || tracksToAddToPlaylist ? (
              <div>
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
            ) : (
              <div>
                <input
                  autoFocus
                  value={importPlaylistLink}
                  onChange={e => setImportPlaylistLink(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isImportingLink && handleImportPlaylistFromLink(importPlaylistLink)}
                  placeholder="Cole o link da playlist (Spotify ou YouTube)..."
                  style={{
                    width: '100%',
                    background: '#100a20',
                    border: '1px solid rgba(0, 240, 255, 0.4)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    color: '#fff',
                    fontSize: 13,
                    marginBottom: 10,
                    outline: 'none'
                  }}
                />
                <p style={{ fontSize: 11, color: '#a093b8', marginBottom: 18 }}>
                  💡 Suporta links de playlists públicas do <b>Spotify</b> e do <b>YouTube</b>. Todas as faixas são importadas para sua biblioteca na nuvem.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="pill-btn"
                    onClick={() => setIsCreateModalOpen(false)}
                    disabled={isImportingLink}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => handleImportPlaylistFromLink(importPlaylistLink)}
                    disabled={!importPlaylistLink.trim() || isImportingLink}
                  >
                    {isImportingLink ? 'Importando Faixas…' : '☁ Importar Playlist (0 MB)'}
                  </button>
                </div>
              </div>
            )}
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
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{playlist?.nome_playlist || 'PobreMusic'}</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                style={{ fontSize: 20, color: '#c77dff' }}
                title="Adicionar à Playlist na Nuvem"
                onClick={() => current && setTracksToAddToPlaylist([current])}
              >
                +♫
              </button>
              {(() => {
                const isSaved = current ? savedTrackKeys.has(getTrackUniqueKey(current)) : false;
                return (
                  <button
                    style={{
                      fontSize: 20,
                      color: isSaved ? '#00f0ff' : '#9d8db8',
                      textShadow: isSaved ? '0 0 10px rgba(0, 240, 255, 0.7)' : 'none'
                    }}
                    title={isSaved ? "Música salva na Nuvem (0 MB) - Toque para remover" : "Salvar na Nuvem (0 MB)"}
                    onClick={() => current && handleSaveTrackToCloud(current)}
                  >
                    {isSaved ? '☁✔' : '☁'}
                  </button>
                );
              })()}
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
            <p style={{ fontSize: 14, color: '#9d8db8', marginBottom: 8 }}>
              {current?.nome_artista || 'PobreMusic Player'}
            </p>
            {current && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: audioSourceType === 'html5' ? 'rgba(0,240,255,0.12)' : 'rgba(255,64,129,0.12)', border: `1px solid ${audioSourceType === 'html5' ? 'rgba(0,240,255,0.3)' : 'rgba(255,64,129,0.3)'}`, padding: '4px 14px', borderRadius: 999 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: audioSourceType === 'html5' ? '#00f0ff' : '#ff4081' }}>
                  {audioSourceType === 'html5' ? '⚡ Faixa Completa • Segundo Plano e Tela Bloqueada' : '📺 Transmissão YouTube • Faixa Completa'}
                </span>
              </div>
            )}
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

          {/* Background Audio Mode inside Player */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              className="pill-btn"
              style={{
                fontSize: 12,
                borderColor: isWakeLockOn ? '#00f0ff' : 'rgba(0, 240, 255, 0.3)',
                background: isWakeLockOn ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                color: isWakeLockOn ? '#00f0ff' : '#9d8db8',
                padding: '6px 16px'
              }}
              onClick={handleToggleWakeLock}
            >
              {isWakeLockOn ? '🔒 Modo Segundo Plano ATIVO (Tela não apaga)' : '📱 Ativar Segundo Plano (Manter Tela Ativa)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
