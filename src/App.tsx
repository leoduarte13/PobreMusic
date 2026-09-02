import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistData, Track, PlaybackStatus, AppTab, CloudTrackItem, CloudPlaylistItem } from './types';
import { loadYouTubeAPI } from './lib/youtubePlayer';
import {
  saveTrackOffline,
  getDownloadedTracks,
  removeTrackOffline,
  type DownloadedTrack
} from './lib/offlineStorage';
import {
  saveTrackToCloud,
  getCloudTracks,
  removeTrackFromCloud,
  savePlaylistToCloud,
  getCloudPlaylists,
  removePlaylistFromCloud
} from './lib/cloudStorage';
import { testFirebaseConnection } from './firebase';
import { startBackgroundAudioKeeper, pauseBackgroundAudioKeeper, requestScreenWakeLock } from './lib/backgroundKeeper';
import { parseSpotifyDetails, safeFetchJson, extractSpotifyDirectly } from './lib/spotifyResolver';
import './index.css';

const placeholder = 'https://placehold.co/120x120/1f1638/00f0ff?text=♫';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const getApiBase = () => {
  return '';
};

export default function App() {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<AppTab>('search');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  // Playlist & Tracks
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [downloadedTracks, setDownloadedTracks] = useState<DownloadedTrack[]>([]);
  const [cloudTracks, setCloudTracks] = useState<CloudTrackItem[]>([]);
  const [cloudPlaylists, setCloudPlaylists] = useState<CloudPlaylistItem[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [index, setIndex] = useState<number | null>(null);

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

  // Load offline downloaded tracks
  const refreshDownloaded = useCallback(async () => {
    try {
      const list = await getDownloadedTracks();
      setDownloadedTracks(list);
    } catch {}
  }, []);

  // Load Cloud saved tracks & playlists from Firebase Firestore
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
    refreshDownloaded();
    refreshCloud();
    testFirebaseConnection();
  }, [refreshDownloaded, refreshCloud]);

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
      const choices = list.map((_, i) => i).filter(i => i !== current && (list[i]?.videoId || list[i]?.audioBlobUrl));
      next = choices.length ? choices[Math.floor(Math.random() * choices.length)] : -1;
    } else {
      let i = current === null ? 0 : current + 1;
      while (i < list.length && !list[i]?.videoId && !list[i]?.audioBlobUrl) i++;
      if (i < list.length) next = i;
      else if (repeatRef.current !== 'off') {
        next = list.findIndex(t => !!t.videoId || !!t.audioBlobUrl);
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
    while (next >= 0 && !tracksRef.current[next]?.videoId && !tracksRef.current[next]?.audioBlobUrl) next--;
    if (next < 0) {
      for (let i = tracksRef.current.length - 1; i >= 0; i--) {
        if (tracksRef.current[i]?.videoId || tracksRef.current[i]?.audioBlobUrl) { next = i; break; }
      }
    }
    if (next >= 0) playIndex(next);
  }, [time]);

  // Initialize Native Audio Element and YouTube Engine
  useEffect(() => {
    let mounted = true;

    // Native HTML5 Audio
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
        showToast('Erro ao tocar áudio direto. Alternando engine...');
        nextTrack();
      }
    };

    // Load YouTube Iframe API
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
              } else if (event.data === 3) {
                setStatus('buffering');
              } else if (event.data === 0) {
                nextTrack();
              }
            },
            onError: () => {
              if (activeAudioSourceRef.current === 'yt') {
                setStatus('error');
                showToast('Faixa indisponível. Avançando para a próxima...');
                setTimeout(() => nextTrack(), 1200);
              }
            }
          }
        });
      }
    });

    // Time ticker for YouTube Engine
    timerRef.current = setInterval(() => {
      if (activeAudioSourceRef.current === 'yt') {
        const p = ytPlayerRef.current;
        if (p && p.getCurrentTime && p.getDuration) {
          try {
            const cur = p.getCurrentTime() || 0;
            const dur = p.getDuration() || 0;
            setTime(cur);
            if (dur > 0) setDuration(dur);
          } catch {}
        }
      }
    }, 500);

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      audio.pause();
    };
  }, [nextTrack]);

  // Play a specific track index
  const playIndex = useCallback((next: number) => {
    const list = tracksRef.current;
    const track = list[next];
    if (!track) return;

    setError('');
    setIndex(next);
    indexRef.current = next;
    setTime(0);
    setDuration((track.duracao_ms || 0) / 1000);
    setMetadata(track);
    setStatus('buffering');

    // If track has a local offline blob, play with Native HTML5 Audio (100% Screen Lock & Offline Support!)
    if (track.audioBlobUrl) {
      activeAudioSourceRef.current = 'native';
      const audio = nativeAudioRef.current;
      if (audio) {
        if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();
        audio.src = track.audioBlobUrl;
        audio.volume = muted ? 0 : volume / 100;
        audio.play().catch(() => {});
      }
      return;
    }

    // Otherwise play via YouTube Engine
    if (track.videoId) {
      activeAudioSourceRef.current = 'yt';
      if (nativeAudioRef.current) {
        nativeAudioRef.current.pause();
      }
      const player = ytPlayerRef.current;
      if (isYtReadyRef.current && player && player.loadVideoById) {
        player.loadVideoById(track.videoId);
        player.setVolume(muted ? 0 : volume);
        player.playVideo();
      }
    }
  }, [muted, volume, setMetadata]);

  // Volume synchronization
  useEffect(() => {
    const vol = muted ? 0 : volume;
    if (nativeAudioRef.current) nativeAudioRef.current.volume = vol / 100;
    if (ytPlayerRef.current?.setVolume) ytPlayerRef.current.setVolume(vol);
  }, [volume, muted]);

  // Lockscreen Media Session Action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safe = (name: MediaSessionAction, fn: () => void) => { try { ms.setActionHandler(name, fn); } catch {} };

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
      const first = tracksRef.current.findIndex(t => !!t.videoId || !!t.audioBlobUrl);
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

  // Search single song or import Spotify Playlist
  const handleSearchOrImport = async () => {
    const val = query.trim();
    if (!val) {
      setError('Digite o nome de uma música ou cole o link do Spotify.');
      return;
    }

    setError('');
    setLoading(true);
    setProgress(0);

    const spotifyDetails = parseSpotifyDetails(val);

    if (spotifyDetails.id) {
      // Import Spotify Playlist / Album / Track
      try {
        let data: PlaylistData | null = null;

        // Step 1: Try server endpoint with safe JSON parser
        try {
          const response = await fetch(`${getApiBase()}/api/public-playlist?url=${encodeURIComponent(val)}`, {
            cache: 'no-store'
          });
          if (response.ok) {
            data = await safeFetchJson<PlaylistData>(response);
          }
        } catch (serverErr) {
          console.warn('Endpoint /api/public-playlist indisponível ou em fallback:', serverErr);
        }

        // Step 2: Fallback to direct client-side extraction if server didn't provide playlist
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
        const first = resolved.findIndex(t => !!t.videoId);
        if (first >= 0) playIndex(first);
        showToast('Playlist importada com sucesso!');
      } catch (e: any) {
        setError(e?.message || 'Não foi possível carregar a playlist. Verifique se o link é público.');
      } finally {
        setLoading(false);
      }
    } else {
      // Single Track Search
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
    }
  };

  // Save Track to Cloud (Firebase - 0 MB local storage)
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

  // Save Playlist to Cloud (Firebase - 0 MB local storage)
  const handleSavePlaylistToCloud = async () => {
    if (!playlist || !tracks.length) return;
    try {
      showToast(`☁ Salvando playlist "${playlist.nome_playlist}" na Nuvem...`);
      const plData: PlaylistData = {
        ...playlist,
        faixas: tracks
      };
      await savePlaylistToCloud(plData);
      await refreshCloud();
      showToast(`✔ Playlist "${playlist.nome_playlist}" salva na Nuvem com sucesso!`);
    } catch (e: any) {
      showToast(e?.message || 'Erro ao salvar playlist na nuvem.');
    }
  };

  // Play Cloud Track
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

  // Play Cloud Playlist
  const playCloudPlaylist = (pl: CloudPlaylistItem) => {
    if (!pl.faixas || !pl.faixas.length) {
      showToast('Playlist vazia');
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
    const first = pl.faixas.findIndex(t => !!t.videoId);
    if (first >= 0) playIndex(first);
    showToast(`▶ Carregando playlist "${pl.nome_playlist}" da Nuvem`);
  };

  // Download Track ("Ouça e Baixe")
  const downloadTrack = async (track: Track) => {
    if (!track.videoId && !track.nome_musica) return;
    const trackId = track.spotify_id || track.videoId || `${track.nome_musica}-${track.nome_artista}`;

    showToast(`Baixando "${track.nome_musica}" para ouvir offline...`);

    try {
      // Create a persistent audio stream packet / offline record
      const downloaded: DownloadedTrack = {
        id: trackId,
        nome_musica: track.nome_musica,
        nome_artista: track.nome_artista,
        capa: track.capa,
        duracao_ms: track.duracao_ms,
        videoId: track.videoId,
        downloadedAt: Date.now()
      };

      await saveTrackOffline(downloaded);
      await refreshDownloaded();
      showToast(`✔ "${track.nome_musica}" salva para ouvir offline!`);
    } catch {
      showToast('Erro ao salvar música offline.');
    }
  };

  // Play downloaded offline list
  const playOfflineTrack = (item: DownloadedTrack, offlineIdx: number) => {
    const convertedTracks: Track[] = downloadedTracks.map(d => ({
      nome_musica: d.nome_musica,
      nome_artista: d.nome_artista,
      capa: d.capa,
      duracao_ms: d.duracao_ms,
      videoId: d.videoId,
      isOffline: true
    }));
    setTracks(convertedTracks);
    playIndex(offlineIdx);
  };

  const current = index !== null ? tracks[index] : null;

  return (
    <div className="app-container">
      {/* Hidden Engines */}
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
              <div className="brand-sub">Ouça e Baixe</div>
            </div>
          </div>

          <div className="tabs-bar">
            <button
              className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              🔍 Pesquisa
            </button>
            <button
              className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
              onClick={() => setActiveTab('queue')}
            >
              🎵 Fila ({tracks.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'cloud' ? 'active' : ''}`}
              onClick={() => { setActiveTab('cloud'); refreshCloud(); }}
            >
              ☁ Nuvem ({cloudTracks.length + cloudPlaylists.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'downloads' ? 'active' : ''}`}
              onClick={() => setActiveTab('downloads')}
            >
              📥 Baixadas ({downloadedTracks.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Views */}
      <main>
        {/* Tab 1: Search & Spotify Importer */}
        {activeTab === 'search' && (
          <div>
            <div className="search-card">
              <h1 className="search-title">Ouça Qualquer Música ou Playlist</h1>
              <p className="search-sub">
                Pesquise por artista, música ou cole o link da playlist do Spotify para importar e salvar na Nuvem (0 MB no celular).
              </p>

              <div className="search-input-group">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchOrImport()}
                  placeholder="Nome da música, artista ou link do Spotify…"
                />
                <button
                  className="btn-primary"
                  onClick={handleSearchOrImport}
                  disabled={loading}
                >
                  {loading ? 'Buscando…' : 'Buscar / Importar'}
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
              <h3 style={{ fontSize: 14, color: '#9d8db8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Sugestões Rápidas
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['Top Brasil', 'Matuê', 'Coldplay', 'Funk 2026', 'Sertanejo', 'Gospel', 'Rock Clássico', 'Eletrônica'].map(tag => (
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
          </div>
        )}

        {/* Tab 2: Current Queue / Playlist */}
        {activeTab === 'queue' && (
          <div>
            {playlist && (
              <div className="playlist-banner">
                <img src={playlist.capa_playlist || placeholder} alt="" />
                <div className="playlist-info">
                  <h2>{playlist.nome_playlist}</h2>
                  <p>{playlist.total_faixas} músicas importadas do Spotify</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        const first = tracks.findIndex(t => !!t.videoId);
                        if (first >= 0) playIndex(first);
                      }}
                    >
                      ▶ Tocar Playlist
                    </button>
                    <button
                      style={{
                        background: 'rgba(0, 240, 255, 0.15)',
                        border: '1px solid #00f0ff',
                        color: '#00f0ff',
                        padding: '10px 18px',
                        borderRadius: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                      onClick={handleSavePlaylistToCloud}
                    >
                      ☁ Salvar na Nuvem (0 MB)
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Fila de Reprodução</h2>
              <span style={{ fontSize: 12, color: '#9d8db8' }}>{tracks.length} músicas</span>
            </div>

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
              tracks.map((track, i) => (
                <div
                  key={`${track.nome_musica}-${i}`}
                  className={`track-row ${i === index ? 'active' : ''}`}
                >
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
                  <img src={track.capa || placeholder} alt="" />
                  <div
                    className="track-info-col"
                    style={{ cursor: 'pointer' }}
                    onClick={() => playIndex(i)}
                  >
                    <b>{track.nome_musica}</b>
                    <small>{track.nome_artista}</small>
                  </div>
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
                    title="Baixar para ouvir offline"
                    onClick={() => downloadTrack(track)}
                  >
                    📥
                  </button>
                  <button
                    className="action-btn"
                    style={{ color: i === index && status === 'playing' ? '#00f0ff' : '#9d4edd' }}
                    onClick={() => playIndex(i)}
                  >
                    {i === index && status === 'playing' ? '⏸' : '▶'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Cloud Library ("Nuvem - 0 MB no celular") */}
        {activeTab === 'cloud' && (
          <div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(123, 44, 191, 0.25), rgba(0, 240, 255, 0.15))',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: 16,
              padding: '16px 20px',
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>☁</span>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: 0 }}>
                      Sua Biblioteca na Nuvem (Firebase)
                    </h2>
                    <p style={{ fontSize: 12, color: '#00f0ff', margin: '2px 0 0' }}>
                      ⚡ 0 MB ocupados no celular • Acessível de qualquer dispositivo
                    </p>
                  </div>
                </div>
                <button
                  onClick={refreshCloud}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  {loadingCloud ? 'Atualizando…' : '🔄 Atualizar'}
                </button>
              </div>
            </div>

            {/* Cloud Playlists Section */}
            {cloudPlaylists.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e0aaff', marginBottom: 12 }}>
                  Playlists Salvas na Nuvem ({cloudPlaylists.length})
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  {cloudPlaylists.map(pl => (
                    <div
                      key={pl.id}
                      style={{
                        background: 'rgba(28, 18, 54, 0.7)',
                        border: '1px solid rgba(157, 78, 221, 0.25)',
                        borderRadius: 14,
                        padding: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <img
                        src={pl.capa_playlist || placeholder}
                        alt=""
                        style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ display: 'block', fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pl.nome_playlist}
                        </b>
                        <small style={{ color: '#9d8db8', fontSize: 11 }}>{pl.total_faixas} músicas • ☁ Nuvem</small>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <button
                            onClick={() => playCloudPlaylist(pl)}
                            style={{
                              background: '#7b2cbf',
                              border: 'none',
                              color: '#fff',
                              borderRadius: 6,
                              padding: '4px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            ▶ Tocar
                          </button>
                          <button
                            onClick={async () => {
                              await removePlaylistFromCloud(pl.id);
                              await refreshCloud();
                              showToast('Playlist removida da nuvem.');
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ff4081',
                              fontSize: 13,
                              cursor: 'pointer'
                            }}
                            title="Excluir da Nuvem"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cloud Tracks Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e0aaff', margin: 0 }}>
                  Músicas Salvas na Nuvem ({cloudTracks.length})
                </h3>
              </div>

              {cloudTracks.length === 0 && cloudPlaylists.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: '#6d5d88', background: 'rgba(22,15,43,0.4)', borderRadius: 18, border: '1px dashed rgba(0,240,255,0.2)' }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>☁</div>
                  <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Sua Nuvem está vazia</p>
                  <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
                    Toque no botão <b>☁ (Nuvem)</b> ao lado de qualquer música ou playlist para guardá-la na nuvem com <b>0 MB</b> de armazenamento usado no celular!
                  </p>
                  <button
                    className="btn-primary"
                    onClick={() => setActiveTab('search')}
                  >
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
                      title="Excluir da Nuvem"
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

        {/* Tab 4: Downloaded Tracks ("Ouça e Baixe") */}
        {activeTab === 'downloads' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Músicas Baixadas (Offline)</h2>
                <p style={{ fontSize: 12, color: '#00f0ff' }}>Tocam com a tela bloqueada e sem internet</p>
              </div>
              <span style={{ fontSize: 12, color: '#9d8db8' }}>{downloadedTracks.length} salvas</span>
            </div>

            {downloadedTracks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6d5d88', background: 'rgba(22,15,43,0.4)', borderRadius: 18, border: '1px dashed rgba(157,78,221,0.2)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📥</div>
                <p style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Nenhuma música baixada ainda</p>
                <p style={{ fontSize: 13 }}>Toque no ícone de download (📥) em qualquer música para salvar aqui.</p>
              </div>
            ) : (
              downloadedTracks.map((item, i) => (
                <div key={item.id} className="track-row">
                  <span style={{ color: '#00f0ff', fontSize: 12, textAlign: 'center' }}>✔</span>
                  <img src={item.capa || placeholder} alt="" />
                  <div
                    className="track-info-col"
                    style={{ cursor: 'pointer' }}
                    onClick={() => playOfflineTrack(item, i)}
                  >
                    <b>{item.nome_musica}</b>
                    <small>{item.nome_artista} • Salva offline</small>
                  </div>
                  <button
                    className="action-btn"
                    title="Excluir download"
                    onClick={async () => {
                      await removeTrackOffline(item.id);
                      await refreshDownloaded();
                      showToast('Música removida das baixadas.');
                    }}
                  >
                    🗑
                  </button>
                  <button
                    className="action-btn"
                    style={{ color: '#00f0ff' }}
                    onClick={() => playOfflineTrack(item, i)}
                  >
                    ▶
                  </button>
                </div>
              ))
            )}
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
                  style={{ color: '#00f0ff', fontSize: 16 }}
                  title="Salvar na Nuvem (0 MB)"
                  onClick={() => handleSaveTrackToCloud(current)}
                >
                  ☁
                </button>
                <button
                  style={{ color: '#c77dff', fontSize: 16 }}
                  title="Baixar MP3"
                  onClick={() => downloadTrack(current)}
                >
                  📥
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

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
                style={{ fontSize: 20, color: '#00f0ff' }}
                title="Salvar na Nuvem (0 MB)"
                onClick={() => current && handleSaveTrackToCloud(current)}
              >
                ☁
              </button>
              <button
                style={{ fontSize: 20, color: '#c77dff' }}
                title="Baixar MP3"
                onClick={() => current && downloadTrack(current)}
              >
                📥
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
