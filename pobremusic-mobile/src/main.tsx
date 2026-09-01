import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Music2, Play, Pause, SkipBack, SkipForward, Plus, Trash2, Upload, Pencil } from 'lucide-react';
import './style.css';

type Track = { id: string; title: string; artist: string; audioUrl?: string };
type Playlist = { id: string; name: string; tracks: string[] };

const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};

function App() {
  const [tracks, setTracks] = useState<Track[]>(() => read('pm_tracks', []));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => read('pm_playlists', [{ id: 'library', name: 'Minhas músicas', tracks: [] }]));
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [active, setActive] = useState('library');
  const audio = useRef<HTMLAudioElement | null>(null);

  const current = tracks.find(t => t.id === currentId) ?? null;
  const visible = active === 'library' ? tracks : tracks.filter(t => playlists.find(p => p.id === active)?.tracks.includes(t.id));

  useEffect(() => {
    localStorage.setItem('pm_tracks', JSON.stringify(tracks.map(t => t.audioUrl?.startsWith('blob:') ? { ...t, audioUrl: undefined } : t)));
  }, [tracks]);
  useEffect(() => { localStorage.setItem('pm_playlists', JSON.stringify(playlists)); }, [playlists]);

  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    audio.current = a;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      if (!currentId || !tracks.length) return;
      const i = tracks.findIndex(t => t.id === currentId);
      setCurrentId(tracks[(i + 1) % tracks.length].id);
    };
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => { a.pause(); a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause); a.removeEventListener('ended', onEnded); };
  }, [currentId, tracks]);

  useEffect(() => {
    const a = audio.current;
    if (!a || !current?.audioUrl) return;
    a.src = current.audioUrl;
    a.play().catch(() => setPlaying(false));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: 'PobreMusic' });
      try { navigator.mediaSession.setActionHandler('play', () => a.play()); } catch {}
      try { navigator.mediaSession.setActionHandler('pause', () => a.pause()); } catch {}
      try { navigator.mediaSession.setActionHandler('nexttrack', () => next(1)); } catch {}
      try { navigator.mediaSession.setActionHandler('previoustrack', () => next(-1)); } catch {}
    }
  }, [currentId]);

  const next = (direction: number) => {
    if (!currentId || !tracks.length) return;
    const i = tracks.findIndex(t => t.id === currentId);
    setCurrentId(tracks[(i + direction + tracks.length) % tracks.length].id);
  };
  const toggle = () => {
    const a = audio.current;
    if (!a || !current?.audioUrl) return;
    playing ? a.pause() : a.play().catch(() => {});
  };
  const newPlaylist = () => {
    const name = prompt('Nome da playlist');
    if (name?.trim()) setPlaylists(p => [...p, { id: crypto.randomUUID(), name: name.trim(), tracks: [] }]);
  };
  const rename = (id: string, old: string) => {
    const name = prompt('Novo nome', old);
    if (name?.trim()) setPlaylists(p => p.map(x => x.id === id ? { ...x, name: name.trim() } : x));
  };
  const addTo = (trackId: string, playlistId: string) => setPlaylists(p => p.map(x => x.id === playlistId && !x.tracks.includes(trackId) ? { ...x, tracks: [...x.tracks, trackId] } : x));
  const removeFrom = (trackId: string, playlistId: string) => setPlaylists(p => p.map(x => x.id === playlistId ? { ...x, tracks: x.tracks.filter(id => id !== trackId) } : x));

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data: any = JSON.parse(String(r.result));
        const items = data.tracks?.items ?? data.items ?? data;
        if (!Array.isArray(items)) throw new Error();
        const list: Track[] = items.map((x: any) => {
          const t = x.track ?? x;
          return { id: crypto.randomUUID(), title: t.name ?? 'Sem título', artist: t.artists?.map((a: any) => a.name).join(', ') ?? 'Artista desconhecido' };
        });
        setTracks(list);
        setPlaylists(p => p.map(x => x.id === 'library' ? { ...x, tracks: list.map(t => t.id) } : x));
        setCurrentId(null);
      } catch { alert('JSON inválido.'); }
    };
    r.readAsText(file);
  };

  const importAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); if (!files.length) return;
    const added: Track[] = files.map(file => ({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), artist: 'Arquivo local', audioUrl: URL.createObjectURL(file) }));
    setTracks(t => [...t, ...added]);
    setPlaylists(p => p.map(x => x.id === 'library' ? { ...x, tracks: [...x.tracks, ...added.map(t => t.id)] } : x));
  };

  return <main>
    <header><h1><Music2 /> PobreMusic</h1><div className="actions">
      <label className="import"><Upload /> Importar playlist<input type="file" accept=".json,application/json" onChange={importJson} /></label>
      <label className="import"><Upload /> Áudio local<input type="file" accept="audio/*" multiple onChange={importAudio} /></label>
      <button onClick={newPlaylist}><Plus /> Playlist</button>
    </div></header>
    <section className="playlists"><h2>Playlists</h2>{playlists.map(p => <div className={'playlist ' + (active === p.id ? 'selected' : '')} key={p.id} onClick={() => setActive(p.id)}><span>{p.name}<small>{p.tracks.length} músicas</small></span>{p.id !== 'library' && <button onClick={e => { e.stopPropagation(); rename(p.id, p.name); }}><Pencil /></button>}</div>)}</section>
    <section><h2>{playlists.find(p => p.id === active)?.name ?? 'Biblioteca'}</h2>{visible.length ? visible.map(t => <div className="row" key={t.id}><span><b>{t.title}</b><small>{t.artist}{!t.audioUrl ? ' • áudio não disponível' : ''}</small></span><div className="rowbuttons"><select aria-label="Adicionar à playlist" defaultValue="" onChange={e => { if (e.target.value) addTo(t.id, e.target.value); e.currentTarget.value = ''; }}><option value="">＋</option>{playlists.filter(p => p.id !== 'library').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button disabled={!t.audioUrl} onClick={() => setCurrentId(t.id)}><Play /></button>{active !== 'library' && <button onClick={() => removeFrom(t.id, active)}><Trash2 /></button>}</div></div>) : <p>Nenhuma música.</p>}</section>
    {current && <footer><span><b>{current.title}</b><small>{current.artist}</small></span><button onClick={() => next(-1)}><SkipBack /></button><button disabled={!current.audioUrl} onClick={toggle}>{playing ? <Pause /> : <Play />}</button><button onClick={() => next(1)}><SkipForward /></button></footer>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);