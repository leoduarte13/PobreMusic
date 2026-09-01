import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistData, Track, PlaybackStatus, AppTab } from './types';
import { loadYouTubeAPI } from './lib/youtubePlayer';
import {
  saveTrackOffline,
  getDownloadedTracks,
  removeTrackOffline,
  type DownloadedTrack
} from './lib/offlineStorage';
import { startBackgroundAudioKeeper, pauseBackgroundAudioKeeper, requestScreenWakeLock } from './lib/backgroundKeeper';
import './index.css';

const placeholder = 'https://placehold.co/120x120/1f1638/00f0ff?text=♫';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const parseSpotifyId = (input: string) => {
  const value = input.trim();
  const m = value.match(/spotify\.com\/(?:intl-[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i) || value.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  return m?.[2] || '';
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

  // Load offline downloaded tracks on startup
  const refreshDownloaded = useCallback(async () => {
    try {
      const list = await getDownloadedTracks();
      setDownloadedTracks(list);
    } catch {}
  }, []);

  useEffect(() => {
    refreshDownloaded();
  }, [refreshDownloaded]);

  // Toast notification helper
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3500);
  };

  // MediaSession Lockscreen integration
  const setMetadata = useCallback((track: Track | null) => {
    if (!track || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.nome_musica,
        artist: track.nome_artista,
        album: track.album || playlist?.nome_playlist || 'Myt Music',
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

    const spotifyId = parseSpotifyId(val);

    if (spotifyId) {
      // Import Spotify Playlist
      try {
        const response = await fetch(`/api/public-playlist?url=${encodeURIComponent(val)}`, { cache: 'no-store' });
        const data: PlaylistData = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.error || 'Não foi possível carregar a playlist.');
        setPlaylist(data);

        const base = data.faixas || [];
        const resolved = [...base];
        let done = 0;
        for (let i = 0; i < resolved.length; i += 4) {
          const batch = resolved.slice(i, i + 4);
          await Promise.all(batch.map(async (track, j) => {
            try {
              const r = await fetch(`/api/search?nome_musica=${encodeURIComponent(track.nome_musica)}&nome_artista=${encodeURIComponent(track.nome_artista)}`, { cache: 'no-store' });
              const result = await r.json();
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
        setError(e?.message || 'Erro ao importar playlist.');
      } finally {
        setLoading(false);
      }
    } else {
      // Single Track Search
      try {
        const r = await fetch(`/api/search?nome_musica=${encodeURIComponent(val)}`, { cache: 'no-store' });
        const result = await r.json();
        if (!r.ok || !result.videoId) throw new Error(result.error || 'Música não encontrada.');

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
                Pesquise por artista, música ou cole o link da playlist do Spotify para importar.
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
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const first = tracks.findIndex(t => !!t.videoId);
                      if (first >= 0) playIndex(first);
                    }}
                  >
                    ▶ Tocar Playlist
                  </button>
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

        {/* Tab 3: Downloaded Tracks ("Ouça e Baixe") */}
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
                {current?.nome_musica || 'Myt Music'}
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
              <button
                style={{ color: '#00f0ff', fontSize: 16 }}
                title="Baixar MP3"
                onClick={() => downloadTrack(current)}
              >
                📥
              </button>
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
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{playlist?.nome_playlist || 'Myt Music'}</div>
            </div>
            <button
              style={{ fontSize: 20, color: '#c77dff' }}
              onClick={() => current && downloadTrack(current)}
            >
              📥
            </button>
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
              {current?.nome_artista || 'Myt Music Player'}
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
