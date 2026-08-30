import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistData, Track, PlaybackStatus } from './types';
import './index.css';

function formatTime(seconds:number) { if (!Number.isFinite(seconds)) return '0:00'; const s=Math.max(0,Math.floor(seconds)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function parseSpotifyId(input:string) { const m=input.trim().match(/spotify\.com\/(?:intl-[^/]+\/)?playlist\/([A-Za-z0-9]+)/i) || input.trim().match(/spotify:playlist:([A-Za-z0-9]+)/i); return m?.[1] || ''; }
const placeholder='https://placehold.co/64x64/222/fff?text=♫';

export default function App() {
  const [url,setUrl]=useState(''); const [playlist,setPlaylist]=useState<PlaylistData|null>(null); const [tracks,setTracks]=useState<Track[]>([]);
  const [loading,setLoading]=useState(false); const [resolveProgress,setResolveProgress]=useState(0); const [error,setError]=useState('');
  const [index,setIndex]=useState<number|null>(null); const [status,setStatus]=useState<PlaybackStatus>('unstarted'); const [time,setTime]=useState(0); const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(80); const [muted,setMuted]=useState(false); const [shuffle,setShuffle]=useState(false); const [repeat,setRepeat]=useState<'off'|'all'|'one'>('all');
  const audioRef=useRef<HTMLAudioElement|null>(null); const tracksRef=useRef<Track[]>([]); const indexRef=useRef<number|null>(null); const shuffleRef=useRef(shuffle); const repeatRef=useRef(repeat); const playToken=useRef(0);
  useEffect(()=>{tracksRef.current=tracks},[tracks]); useEffect(()=>{indexRef.current=index},[index]); useEffect(()=>{shuffleRef.current=shuffle},[shuffle]); useEffect(()=>{repeatRef.current=repeat},[repeat]);

  const updateMediaSession=useCallback((t:Track|null)=>{
    if(!('mediaSession' in navigator) || !t) return;
    try { navigator.mediaSession.metadata=new MediaMetadata({title:t.nome_musica,artist:t.nome_artista,album:t.album||playlist?.nome_playlist,artwork:t.capa?[{src:t.capa}]:[]}); navigator.mediaSession.playbackState='paused'; } catch {}
  },[playlist?.nome_playlist]);

  // Stream URLs returned by Piped are signed/temporary. Never trust a URL
  // stored in localStorage; resolve a fresh audio URL whenever playback starts.
  const resolveAudio=useCallback(async(track:Track)=>{
    if(!track.videoId) throw new Error('Esta música não foi encontrada.');
    const r=await fetch(`/api/stream?videoId=${encodeURIComponent(track.videoId)}&t=${Date.now()}`,{cache:'no-store'});
    let d:any={}; try { d=await r.json(); } catch {}
    if(!r.ok||!d.sucesso||!d.url) throw new Error(d.error||'Não foi possível obter o áudio desta música.');
    setTracks(prev=>prev.map(t=>t.videoId===track.videoId?{...t,audioUrl:undefined,source:'piped',hasError:false}:t));
    return d.url as string;
  },[]);

  const playIndex=useCallback(async(next:number,autoplay=true)=>{
    const list=tracksRef.current; if(next<0||next>=list.length||!list[next]?.videoId) return;
    const token=++playToken.current; const t=list[next]; setError(''); setIndex(next); indexRef.current=next; setTime(0); setDuration((t.duracao_ms||0)/1000); updateMediaSession(t);
    const audio=audioRef.current; if(!audio)return;
    try {
      setStatus('buffering');
      const src=await resolveAudio(t); if(token!==playToken.current)return;
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio.src=src; audio.load();
      if(autoplay){ await audio.play(); setStatus('playing'); try{navigator.mediaSession.playbackState='playing'}catch{} } else { setStatus('paused'); try{navigator.mediaSession.playbackState='paused'}catch{} }
    } catch(e:any) { if(token!==playToken.current)return; setStatus('error'); setError(e?.message||'Não foi possível reproduzir esta música.'); }
  },[resolveAudio,updateMediaSession]);

  const nextTrack=useCallback(()=>{ const list=tracksRef.current; const cur=indexRef.current; if(!list.length)return; if(repeatRef.current==='one'&&cur!==null){playIndex(cur,true);return;} let n:number; if(shuffleRef.current){const choices=list.map((_,i)=>i).filter(i=>i!==cur&&list[i].videoId);n=choices.length?choices[Math.floor(Math.random()*choices.length)]:0;}else{n=cur===null?0:cur+1;while(n<list.length&&!list[n].videoId)n++;if(n>=list.length){if(repeatRef.current==='off'){setStatus('ended');return;}n=list.findIndex(t=>!!t.videoId);}} if(n>=0)playIndex(n,true);},[playIndex]);
  const prevTrack=useCallback(()=>{const cur=indexRef.current;if(cur===null)return;const audio=audioRef.current;if(audio&&audio.currentTime>3){audio.currentTime=0;return;}let n=cur-1;while(n>=0&&!tracksRef.current[n].videoId)n--;if(n<0)n=tracksRef.current.map((_,i)=>i).reverse().find(i=>!!tracksRef.current[i].videoId)??cur;playIndex(n,true)},[playIndex]);

  useEffect(()=>{
    const audio=new Audio(); audio.preload='auto'; audioRef.current=audio;
    const onPlay=()=>{setStatus('playing');try{navigator.mediaSession.playbackState='playing'}catch{}};
    const onPause=()=>{setStatus('paused');try{navigator.mediaSession.playbackState='paused'}catch{}};
    const onWaiting=()=>setStatus('buffering');
    const onTime=()=>{setTime(audio.currentTime||0);if(Number.isFinite(audio.duration)&&audio.duration>0)setDuration(audio.duration)};
    const onLoaded=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)setDuration(audio.duration)};
    const onEnded=()=>{setStatus('ended');nextTrack()};
    const onError=()=>{const code=audio.error?.code||0;setStatus('error');setError(code===2?'A fonte de áudio não respondeu. Toque em reproduzir para tentar novamente.':'A fonte de áudio não pôde ser reproduzida. Toque em reproduzir para tentar novamente.');};
    audio.addEventListener('play',onPlay);audio.addEventListener('pause',onPause);audio.addEventListener('waiting',onWaiting);audio.addEventListener('timeupdate',onTime);audio.addEventListener('loadedmetadata',onLoaded);audio.addEventListener('ended',onEnded);audio.addEventListener('error',onError);
    return()=>{audio.pause();audio.removeAttribute('src');audio.load();audio.removeEventListener('play',onPlay);audio.removeEventListener('pause',onPause);audio.removeEventListener('waiting',onWaiting);audio.removeEventListener('timeupdate',onTime);audio.removeEventListener('loadedmetadata',onLoaded);audio.removeEventListener('ended',onEnded);audio.removeEventListener('error',onError);audioRef.current=null};
  },[nextTrack]);

  useEffect(()=>{const a=audioRef.current;if(a)a.volume=muted?0:volume/100},[volume,muted]);
  useEffect(()=>{if(!('mediaSession'in navigator))return;const ms=navigator.mediaSession;const safe=(name:any,fn:any)=>{try{ms.setActionHandler(name,fn)}catch{}};safe('play',()=>{const cur=indexRef.current;if(cur!==null)playIndex(cur,true)});safe('pause',()=>audioRef.current?.pause());safe('nexttrack',nextTrack);safe('previoustrack',prevTrack);safe('seekbackward',()=>{const a=audioRef.current;if(a)a.currentTime=Math.max(0,a.currentTime-10)});safe('seekforward',()=>{const a=audioRef.current;if(a)a.currentTime=Math.min(a.duration||Infinity,a.currentTime+10)});safe('seekto',(details:any)=>{const a=audioRef.current;if(a&&details.seekTime!=null)a.currentTime=details.seekTime});return()=>{['play','pause','nexttrack','previoustrack','seekbackward','seekforward','seekto'].forEach(n=>{try{ms.setActionHandler(n as any,null)}catch{}})}} ,[nextTrack,prevTrack,playIndex]);

  // Do not persist signed audio URLs. They expire and caused imported songs to
  // appear correctly while silently failing to play after a reload.
  useEffect(()=>{try{const safeTracks=tracks.map(({audioUrl,...t})=>t);localStorage.setItem('pobremusic_state',JSON.stringify({url,playlist,tracks:safeTracks,index}))}catch{}},[url,playlist,tracks,index]);
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('pobremusic_state')||'null');if(saved?.tracks?.length){const safeTracks=saved.tracks.map((t:Track)=>({...t,audioUrl:undefined}));setUrl(saved.url||'');setPlaylist(saved.playlist);setTracks(safeTracks);setIndex(saved.index??null);indexRef.current=saved.index??null}}catch{}},[]);

  const importPlaylist=async()=>{
    setError('');setLoading(true);setResolveProgress(0);setTracks([]);setIndex(null);indexRef.current=null;setStatus('unstarted');
    try{if(!parseSpotifyId(url))throw new Error('Cole o link de uma playlist pública do Spotify.');const r=await fetch(`/api/public-playlist?url=${encodeURIComponent(url)}`,{cache:'no-store'});const d:PlaylistData=await r.json();if(!r.ok||!d.sucesso)throw new Error(d.error||'Não foi possível importar a playlist.');setPlaylist(d);
      const base=d.faixas||[];const resolved:Track[]=[...base];let done=0;for(let i=0;i<resolved.length;i+=4){const batch=resolved.slice(i,i+4);await Promise.all(batch.map(async(t,j)=>{try{const rr=await fetch(`/api/search?nome_musica=${encodeURIComponent(t.nome_musica)}&nome_artista=${encodeURIComponent(t.nome_artista)}`,{cache:'no-store'});const x=await rr.json();if(rr.ok&&x.videoId)resolved[i+j]={...t,videoId:x.videoId,videoTitle:x.titulo,audioUrl:undefined};else resolved[i+j]={...t,hasError:true};}catch{resolved[i+j]={...t,hasError:true};}finally{done++;setResolveProgress(Math.round(done/base.length*100));}}));setTracks([...resolved]);}
      setTracks(resolved);const first=resolved.findIndex(t=>!!t.videoId);if(first>=0){setIndex(first);indexRef.current=first;setStatus('paused');}
    }catch(e:any){setError(e?.message||'Erro ao importar playlist.')}finally{setLoading(false)}
  };
  const playPause=()=>{const first=tracks.findIndex(t=>t.videoId);if(index===null){if(first>=0)playIndex(first,true);return;}if(status==='playing')audioRef.current?.pause();else playIndex(index,true);};
  const changeVolume=(v:number)=>{setVolume(v);setMuted(v===0)}; const seek=(v:number)=>{const a=audioRef.current;if(a){a.currentTime=v;setTime(v)}}; const current=index!==null?tracks[index]:null;

  return <div className="app"><header><div className="brand"><div className="brandIcon">♫</div><div><strong>PobreMusic</strong><span>Spotify Playlist Player</span></div></div></header>
    <main><section className="import"><h1>Ouça suas playlists do Spotify</h1><p>Cole o link de uma playlist pública e importe as músicas para o PobreMusic.</p><div className="inputRow"><input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&importPlaylist()} placeholder="Cole aqui o link da playlist do Spotify"/><button onClick={importPlaylist} disabled={loading}>{loading?'Importando…':'Importar playlist'}</button></div>{loading&&<div className="progress"><div style={{width:`${resolveProgress}%`}}/><span>{resolveProgress}% — encontrando cada música</span></div>}{error&&<div className="error">{error}</div>}</section>
      {playlist&&<section className="playlistHead"><img src={playlist.capa_playlist||'https://placehold.co/500x500/181818/fff?text=♫'}/><div><small>PLAYLIST DO SPOTIFY</small><h2>{playlist.nome_playlist}</h2><p>{playlist.total_faixas} músicas</p><button className="playBig" onClick={()=>{const first=tracks.findIndex(t=>t.videoId);if(first>=0)playIndex(first,true)}}>▶ Reproduzir</button></div></section>}
      {tracks.length>0&&<section className="tracks"><div className="tracksTitle"><h3>Músicas</h3><span>{tracks.filter(t=>t.videoId).length}/{tracks.length} encontradas</span></div>{tracks.map((t,i)=><button className={`track ${i===index?'active':''}`} key={`${t.spotify_id||t.nome_musica}-${i}`} onClick={()=>t.videoId&&playIndex(i,true)} disabled={!t.videoId}><img src={t.capa||placeholder}/><span className="num">{i+1}</span><span className="info"><b>{t.nome_musica}</b><small>{t.nome_artista}</small></span>{i===index&&status==='playing'?<span className="playing">●</span>:t.hasError?<span className="notfound">Não encontrada</span>:<span className="dur">{formatTime((t.duracao_ms||0)/1000)}</span>}</button>)}</section>}
    </main><footer className="player"><div className="now">{current?<><img src={current.capa||placeholder}/><div><b>{current.nome_musica}</b><small>{current.nome_artista}</small></div></>:<span>Nenhuma música selecionada</span>}</div><div className="controls"><div className="buttons"><button onClick={prevTrack}>⏮</button><button className="mainPlay" onClick={playPause}>{status==='playing'?'Ⅱ':'▶'}</button><button onClick={nextTrack}>⏭</button></div><div className="seek"><span>{formatTime(time)}</span><input type="range" min="0" max={duration||1} step="1" value={Math.min(time,duration||1)} onChange={e=>seek(Number(e.target.value))}/><span>{formatTime(duration)}</span></div></div><div className="extras"><button onClick={()=>setShuffle(v=>!v)} className={shuffle?'on':''}>🔀</button><button onClick={()=>setRepeat(v=>v==='off'?'all':v==='all'?'one':'off')} className={repeat!=='off'?'on':''}>🔁{repeat==='one'&&<sup>1</sup>}</button><span>🔊</span><input aria-label="Volume" type="range" min="0" max="100" value={muted?0:volume} onChange={e=>changeVolume(Number(e.target.value))}/></div></footer>
  </div>;
}
