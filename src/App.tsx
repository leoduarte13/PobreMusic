import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistData, Track, PlaybackStatus } from './types';
import './index.css';

const placeholder = 'https://placehold.co/64x64/222/fff?text=♫';
const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const parseSpotifyId = (input: string) => {
  const value = input.trim();
  const m = value.match(/spotify\.com\/(?:intl-[^/]+\/)?playlist\/([A-Za-z0-9]+)/i) || value.match(/spotify:playlist:([A-Za-z0-9]+)/i);
  return m?.[1] || '';
};

export default function App() {
  const [url, setUrl] = useState('');
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [index, setIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>('unstarted');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('all');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const indexRef = useRef<number | null>(null);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);
  const playRequestRef = useRef(0);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  const setMetadata = useCallback((track: Track | null) => {
    if (!track || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.nome_musica,
        artist: track.nome_artista,
        album: track.album || playlist?.nome_playlist || 'PobreMusic',
        artwork: track.capa ? [{ src: track.capa }] : []
      });
    } catch {}
  }, [playlist?.nome_playlist]);

  // IMPORTANT: the browser must receive play() directly from the user's click.
  // The previous implementation awaited an API request before audio.play(),
  // which caused autoplay policy to reject playback. /api/audio is now a
  // same-origin streaming proxy: setting its URL is synchronous, while the
  // server resolves the signed source in the background.
  const playIndex = useCallback((next: number, autoplay = true) => {
    const list = tracksRef.current;
    const track = list[next];
    if (!track?.videoId || !audioRef.current) return;

    const audio = audioRef.current;
    const request = ++playRequestRef.current;
    setError('');
    setIndex(next);
    indexRef.current = next;
    setTime(0);
    setDuration((track.duracao_ms || 0) / 1000);
    setMetadata(track);

    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio.src = `/api/audio?videoId=${encodeURIComponent(track.videoId)}&v=${Date.now()}`;
    audio.preload = 'auto';
    audio.volume = muted ? 0 : volume / 100;
    setStatus(autoplay ? 'buffering' : 'paused');

    if (!autoplay) return;

    // No await before play(): this call is intentionally made in the same
    // synchronous click/tap event so mobile browsers allow playback.
    const promise = audio.play();
    if (promise) {
      promise.then(() => {
        if (request !== playRequestRef.current) return;
        setStatus('playing');
        try { navigator.mediaSession.playbackState = 'playing'; } catch {}
      }).catch((e: any) => {
        if (request !== playRequestRef.current) return;
        setStatus('error');
        setError(e?.name === 'NotAllowedError'
          ? 'O navegador bloqueou a reprodução. Toque novamente em Reproduzir.'
          : 'Não foi possível iniciar o áudio desta música.');
      });
    }
  }, [muted, volume, setMetadata]);

  const nextTrack = useCallback(() => {
    const list = tracksRef.current;
    const current = indexRef.current;
    if (!list.length) return;
    if (repeatRef.current === 'one' && current !== null) {
      playIndex(current, true);
      return;
    }

    let next = -1;
    if (shuffleRef.current) {
      const choices = list.map((_, i) => i).filter(i => i !== current && !!list[i]?.videoId);
      next = choices.length ? choices[Math.floor(Math.random() * choices.length)] : -1;
    } else {
      let i = current === null ? 0 : current + 1;
      while (i < list.length && !list[i]?.videoId) i++;
      if (i < list.length) next = i;
      else if (repeatRef.current !== 'off') next = list.findIndex(t => !!t.videoId);
    }
    if (next >= 0) playIndex(next, true);
    else setStatus('ended');
  }, [playIndex]);

  const prevTrack = useCallback(() => {
    const current = indexRef.current;
    const audio = audioRef.current;
    if (current === null) return;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    let next = current - 1;
    while (next >= 0 && !tracksRef.current[next]?.videoId) next--;
    if (next < 0) {
      for (let i = tracksRef.current.length - 1; i >= 0; i--) {
        if (tracksRef.current[i]?.videoId) { next = i; break; }
      }
    }
    if (next >= 0) playIndex(next, true);
  }, [playIndex]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const onPlay = () => { setStatus('playing'); try { navigator.mediaSession.playbackState = 'playing'; } catch {} };
    const onPause = () => { setStatus('paused'); try { navigator.mediaSession.playbackState = 'paused'; } catch {} };
    const onWaiting = () => setStatus('buffering');
    const onTime = () => {
      setTime(audio.currentTime || 0);
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onEnded = () => nextTrack();
    const onError = () => {
      const code = audio.error?.code || 0;
      setStatus('error');
      setError(code === 2
        ? 'A fonte de áudio não respondeu. Toque novamente para tentar outra fonte.'
        : 'A fonte de áudio não pôde ser reproduzida. Toque novamente.');
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [nextTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = muted ? 0 : volume / 100;
  }, [volume, muted]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safe = (name: MediaSessionAction, fn: () => void) => { try { ms.setActionHandler(name, fn); } catch {} };
    safe('play', () => { const i = indexRef.current; if (i !== null) playIndex(i, true); });
    safe('pause', () => audioRef.current?.pause());
    safe('nexttrack', nextTrack);
    safe('previoustrack', prevTrack);
    safe('seekbackward', () => { const a = audioRef.current; if (a) a.currentTime = Math.max(0, a.currentTime - 10); });
    safe('seekforward', () => { const a = audioRef.current; if (a) a.currentTime = Math.min(a.duration || Infinity, a.currentTime + 10); });
    safe('seekto', () => {});
    return () => {
      ['play','pause','nexttrack','previoustrack','seekbackward','seekforward','seekto'].forEach(name => {
        try { ms.setActionHandler(name as MediaSessionAction, null); } catch {}
      });
    };
  }, [nextTrack, prevTrack, playIndex]);

  useEffect(() => {
    try {
      const safeTracks = tracks.map(({ audioUrl, ...track }) => track);
      localStorage.setItem('pobremusic_state', JSON.stringify({ url, playlist, tracks: safeTracks, index }));
    } catch {}
  }, [url, playlist, tracks, index]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pobremusic_state') || 'null');
      if (saved?.tracks?.length) {
        const safeTracks = saved.tracks.map((t: Track) => ({ ...t, audioUrl: undefined }));
        setUrl(saved.url || '');
        setPlaylist(saved.playlist || null);
        setTracks(safeTracks);
        setIndex(saved.index ?? null);
        indexRef.current = saved.index ?? null;
      }
    } catch {}
  }, []);

  const importPlaylist = async () => {
    setError(''); setLoading(true); setProgress(0); setTracks([]); setIndex(null); indexRef.current = null; setStatus('unstarted');
    try {
      if (!parseSpotifyId(url)) throw new Error('Cole o link de uma playlist pública do Spotify.');
      const response = await fetch(`/api/public-playlist?url=${encodeURIComponent(url)}`, { cache: 'no-store' });
      const data: PlaylistData = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.error || 'Não foi possível importar a playlist.');
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
              ? { ...track, videoId: result.videoId, videoTitle: result.titulo, audioUrl: undefined, hasError: false }
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
      const first = resolved.findIndex(t => !!t.videoId);
      if (first >= 0) { setIndex(first); indexRef.current = first; setStatus('paused'); }
    } catch (e: any) {
      setError(e?.message || 'Erro ao importar playlist.');
    } finally { setLoading(false); }
  };

  const playPause = () => {
    const first = tracksRef.current.findIndex(t => !!t.videoId);
    if (indexRef.current === null) { if (first >= 0) playIndex(first, true); return; }
    if (status === 'playing') audioRef.current?.pause();
    else playIndex(indexRef.current, true);
  };
  const current = index !== null ? tracks[index] : null;

  return <div className="app">
    <header><div className="brand"><div className="brandIcon">♫</div><div><strong>PobreMusic</strong><span>Spotify Playlist Player</span></div></div></header>
    <main>
      <section className="import">
        <h1>Ouça suas playlists do Spotify</h1>
        <p>Cole o link de uma playlist pública e importe as músicas para o PobreMusic.</p>
        <div className="inputRow"><input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && importPlaylist()} placeholder="Cole aqui o link da playlist do Spotify" /><button onClick={importPlaylist} disabled={loading}>{loading ? 'Importando…' : 'Importar playlist'}</button></div>
        {loading && <div className="progress"><div style={{ width: `${progress}%` }} /><span>{progress}% — encontrando cada música</span></div>}
        {error && <div className="error">{error}</div>}
      </section>

      {playlist && <section className="playlistHead"><img src={playlist.capa_playlist || 'https://placehold.co/500x500/181818/fff?text=♫'} /><div><small>PLAYLIST DO SPOTIFY</small><h2>{playlist.nome_playlist}</h2><p>{playlist.total_faixas} músicas</p><button className="playBig" onClick={() => { const first = tracksRef.current.findIndex(t => !!t.videoId); if (first >= 0) playIndex(first, true); }}>▶ Reproduzir</button></div></section>}

      {tracks.length > 0 && <section className="tracks"><div className="tracksTitle"><h3>Músicas</h3><span>{tracks.filter(t => t.videoId).length}/{tracks.length} encontradas</span></div>
        {tracks.map((track, i) => <button className={`track ${i === index ? 'active' : ''}`} key={`${track.spotify_id || track.nome_musica}-${i}`} onClick={() => track.videoId && playIndex(i, true)} disabled={!track.videoId}>
          <img src={track.capa || placeholder} /><span className="num">{i + 1}</span><span className="info"><b>{track.nome_musica}</b><small>{track.nome_artista}</small></span>
          {i === index && status === 'playing' ? <span className="playing">●</span> : track.hasError ? <span className="notfound">Não encontrada</span> : <span className="dur">{formatTime((track.duracao_ms || 0) / 1000)}</span>}
        </button>)}
      </section>}
    </main>

    <footer className="player"><div className="now">{current ? <><img src={current.capa || placeholder} /><div><b>{current.nome_musica}</b><small>{current.nome_artista}</small></div></> : <span>Nenhuma música selecionada</span>}</div>
      <div className="controls"><div className="buttons"><button onClick={prevTrack}>⏮</button><button className="mainPlay" onClick={playPause}>{status === 'playing' ? 'Ⅱ' : '▶'}</button><button onClick={nextTrack}>⏭</button></div><div className="seek"><span>{formatTime(time)}</span><input type="range" min="0" max={duration || 1} step="1" value={Math.min(time, duration || 1)} onChange={e => { const v = Number(e.target.value); if (audioRef.current) { audioRef.current.currentTime = v; setTime(v); } }} /><span>{formatTime(duration)}</span></div></div>
      <div className="extras"><button onClick={() => setShuffle(v => !v)} className={shuffle ? 'on' : ''}>🔀</button><button onClick={() => setRepeat(v => v === 'off' ? 'all' : v === 'all' ? 'one' : 'off')} className={repeat !== 'off' ? 'on' : ''}>🔁{repeat === 'one' && <sup>1</sup>}</button><span>🔊</span><input aria-label="Volume" type="range" min="0" max="100" value={muted ? 0 : volume} onChange={e => { const v = Number(e.target.value); setVolume(v); setMuted(v === 0); }} /></div>
    </footer>
  </div>;
}
