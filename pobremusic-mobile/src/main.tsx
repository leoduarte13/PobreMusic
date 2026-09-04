import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Music2, Play, Pause, SkipBack, SkipForward, Plus, Trash2, Upload, Pencil, Link } from 'lucide-react';
import './style.css';

type Track = {
  id: string;
  title: string;
  artist: string;
  audioUrl?: string;
  coverUrl?: string;
};

type Playlist = { id: string; name: string; tracks: string[] };

const read = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};

function App() {
  const [tracks, setTracks] = useState<Track[]>(() => read('pm_tracks', []));
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    read('pm_playlists', [{ id: 'library', name: 'Minhas músicas', tracks: [] }])
  );
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState('library');
  const audio = useRef<HTMLAudioElement | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const tracksRef = useRef<Track[]>(tracks);

  useEffect(() => {
    currentIdRef.current = currentId;
    tracksRef.current = tracks;
  }, [currentId, tracks]);

  const current = tracks.find(t => t.id === currentId) ?? null;
  const visible = useMemo(() => {
    if (active === 'library') return tracks;
    const playlist = playlists.find(p => p.id === active);
    return tracks.filter(t => playlist?.tracks.includes(t.id));
  }, [active, playlists, tracks]);

  useEffect(() => {
    localStorage.setItem('pm_tracks', JSON.stringify(
      tracks.map(t => t.audioUrl?.startsWith('blob:') ? { ...t, audioUrl: undefined } : t)
    ));
  }, [tracks]);

  useEffect(() => {
    localStorage.setItem('pm_playlists', JSON.stringify(playlists));
  }, [playlists]);

  const next = (direction: number) => {
    const id = currentIdRef.current;
    const list = tracksRef.current;
    if (!id || !list.length) return;
    const index = list.findIndex(t => t.id === id);
    if (index < 0) return;
    setCurrentId(list[(index + direction + list.length) % list.length].id);
  };

  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    audio.current = a;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => next(1);
    const onError = () => setPlaying(false);

    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);

    return () => {
      a.pause();
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    const a = audio.current;
    if (!a || !current) return;

    if (!current.audioUrl) {
      a.pause();
      a.removeAttribute('src');
      a.load();
      setPlaying(false);
      return;
    }

    a.src = current.audioUrl;
    a.load();
    a.play().catch(() => setPlaying(false));

    if ('mediaSession' in navigator) {
      const artwork = current.coverUrl ? [{ src: current.coverUrl }] : undefined;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: 'PobreMusic',
        artwork
      });
      try { navigator.mediaSession.setActionHandler('play', () => a.play()); } catch {}
      try { navigator.mediaSession.setActionHandler('pause', () => a.pause()); } catch {}
      try { navigator.mediaSession.setActionHandler('nexttrack', () => next(1)); } catch {}
      try { navigator.mediaSession.setActionHandler('previoustrack', () => next(-1)); } catch {}
    }
  }, [currentId]);

  const toggle = () => {
    const a = audio.current;
    if (!a || !current?.audioUrl) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const newPlaylist = () => {
    const name = prompt('Nome da playlist');
    if (name?.trim()) {
      setPlaylists(p => [...p, { id: crypto.randomUUID(), name: name.trim(), tracks: [] }]);
    }
  };

  const rename = (id: string, old: string) => {
    const name = prompt('Novo nome', old);
    if (name?.trim()) setPlaylists(p => p.map(x => x.id === id ? { ...x, name: name.trim() } : x));
  };

  const addTo = (trackId: string, playlistId: string) => {
    setPlaylists(p => p.map(x =>
      x.id === playlistId && !x.tracks.includes(trackId)
        ? { ...x, tracks: [...x.tracks, trackId] }
        : x
    ));
  };

  const removeFrom = (trackId: string, playlistId: string) => {
    setPlaylists(p => p.map(x => x.id === playlistId
      ? { ...x, tracks: x.tracks.filter(id => id !== trackId) }
      : x
    ));
  };

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data: any = JSON.parse(String(reader.result));
        const items = data.tracks?.items ?? data.items ?? data;
        if (!Array.isArray(items)) throw new Error('invalid');
        const list: Track[] = items.map((x: any) => {
          const t = x.track ?? x;
          return {
            id: crypto.randomUUID(),
            title: t.name ?? 'Sem título',
            artist: Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(', ') : (t.artist ?? 'Artista desconhecido'),
            coverUrl: t.album?.images?.[0]?.url ?? t.coverUrl
          };
        });
        setTracks(list);
        setPlaylists(p => p.map(x => x.id === 'library' ? { ...x, tracks: list.map(t => t.id) } : x));
        setCurrentId(null);
      } catch {
        alert('JSON inválido.');
      }
    };
    reader.readAsText(file);
    e.currentTarget.value = '';
  };

  const importAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const added: Track[] = files.map(file => ({
      id: crypto.randomUUID(),
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: 'Arquivo local',
      audioUrl: URL.createObjectURL(file)
    }));
    setTracks(t => [...t, ...added]);
    setPlaylists(p => p.map(x => x.id === 'library'
      ? { ...x, tracks: [...x.tracks, ...added.map(t => t.id)] }
      : x
    ));
    e.currentTarget.value = '';
  };

  const addUrl = () => {
    const url = prompt('Cole a URL direta do áudio (MP3/stream autorizado)');
    if (!url?.trim()) return;
    try { new URL(url.trim()); } catch { alert('URL inválida.'); return; }
    const title = prompt('Nome da música', 'Nova música')?.trim() || 'Nova música';
    const artist = prompt('Artista', 'Artista desconhecido')?.trim() || 'Artista desconhecido';
    const track: Track = { id: crypto.randomUUID(), title, artist, audioUrl: url.trim() };
    setTracks(t => [...t, track]);
    setPlaylists(p => p.map(x => x.id === 'library' ? { ...x, tracks: [...x.tracks, track.id] } : x));
  };

  return <main>
    <header>
      <h1><Music2 /> PobreMusic</h1>
      <div className="actions">
        <label className="import"><Upload /> Importar playlist<input type="file" accept=".json,application/json" onChange={importJson} /></label>
        <label className="import"><Upload /> Áudio local<input type="file" accept="audio/*" multiple onChange={importAudio} /></label>
        <button onClick={addUrl}><Link /> URL de áudio</button>
        <button onClick={newPlaylist}><Plus /> Playlist</button>
      </div>
    </header>

    <section className="playlists">
      <h2>Playlists</h2>
      {playlists.map(p => <div className={'playlist ' + (active === p.id ? 'selected' : '')} key={p.id} onClick={() => setActive(p.id)}>
        <span>{p.name}<small>{p.tracks.length} músicas</small></span>
        {p.id !== 'library' && <button onClick={e => { e.stopPropagation(); rename(p.id, p.name); }}><Pencil /></button>}
      </div>)}
    </section>

    <section>
      <h2>{playlists.find(p => p.id === active)?.name ?? 'Biblioteca'}</h2>
      {visible.length ? visible.map(t => <div className="row" key={t.id}>
        <span><b>{t.title}</b><small>{t.artist}{!t.audioUrl ? ' • áudio não disponível' : ''}</small></span>
        <div className="rowbuttons">
          <select aria-label="Adicionar à playlist" defaultValue="" onChange={e => { if (e.target.value) addTo(t.id, e.target.value); e.currentTarget.value = ''; }}>
            <option value="">＋</option>
            {playlists.filter(p => p.id !== 'library').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button disabled={!t.audioUrl} onClick={() => setCurrentId(t.id)}><Play /></button>
          {active !== 'library' && <button onClick={() => removeFrom(t.id, active)}><Trash2 /></button>}
        </div>
      </div>) : <p>Nenhuma música.</p>}
    </section>

    {current && <footer>
      <span><b>{current.title}</b><small>{current.artist}</small></span>
      <button onClick={() => next(-1)}><SkipBack /></button>
      <button disabled={!current.audioUrl} onClick={toggle}>{playing ? <Pause /> : <Play />}</button>
      <button onClick={() => next(1)}><SkipForward /></button>
    </footer>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
