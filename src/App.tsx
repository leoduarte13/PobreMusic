import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaylistData, Track, PlaybackStatus } from './types';
import './index.css';

function formatTime(seconds:number) { if (!Number.isFinite(seconds)) return '0:00'; const s=Math.floor(seconds); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function parseSpotifyId(input:string) { const m=input.trim().match(/spotify\.com\/(?:intl-[^/]+\/)?playlist\/([A-Za-z0-9]+)/i) || input.trim().match(/spotify:playlist:([A-Za-z0-9]+)/i); return m?.[1] || ''; }

declare global { interface Window { YT:any; onYouTubeIframeAPIReady:()=>void; } }

export default function App() {
  const [url,setUrl]=useState(''); const [playlist,setPlaylist]=useState<PlaylistData|null>(null); const [tracks,setTracks]=useState<Track[]>([]);
  const [loading,setLoading]=useState(false); const [resolveProgress,setResolveProgress]=useState(0); const [error,setError]=useState('');
  const [index,setIndex]=useState<number|null>(null); const [status,setStatus]=useState<PlaybackStatus>('unstarted'); const [time,setTime]=useState(0); const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(80); const [muted,setMuted]=useState(false); const [shuffle,setShuffle]=useState(false); const [repeat,setRepeat]=useState<'off'|'all'|'one'>('all');
  const playerRef=useRef<any>(null); const tracksRef=useRef<Track[]>([]); const indexRef=useRef<number|null>(null); const shuffleRef=useRef(shuffle); const repeatRef=useRef(repeat); const intentRef=useRef(false);
  useEffect(()=>{tracksRef.current=tracks},[tracks]); useEffect(()=>{indexRef.current=index},[index]); useEffect(()=>{shuffleRef.current=shuffle},[shuffle]); useEffect(()=>{repeatRef.current=repeat},[repeat]);

  const playIndex=useCallback((next:number, autoplay=true)=>{
    const list=tracksRef.current; if(next<0 || next>=list.length || !list[next]?.videoId) return;
    setIndex(next); indexRef.current=next; setTime(0); setDuration((list[next].duracao_ms||0)/1000); intentRef.current=autoplay;
    try { playerRef.current?.loadVideoById?.({videoId:list[next].videoId,startSeconds:0}); if(!autoplay) playerRef.current?.pauseVideo?.(); } catch {}
    const t=list[next]; if('mediaSession' in navigator){ navigator.mediaSession.metadata=new MediaMetadata({title:t.nome_musica,artist:t.nome_artista,album:t.album||playlist?.nome_playlist,artwork:t.capa?[{src:t.capa}]:[]}); }
  },[playlist?.nome_playlist]);

  const nextTrack=useCallback(()=>{ const list=tracksRef.current; const cur=indexRef.current; if(!list.length)return; if(repeatRef.current==='one' && cur!==null){playIndex(cur,true);return;} let n:number; if(shuffleRef.current){const choices=list.map((_,i)=>i).filter(i=>i!==cur && list[i].videoId);n=choices.length?choices[Math.floor(Math.random()*choices.length)]:0;}else{n=(cur===null?0:cur+1);if(n>=list.length){if(repeatRef.current==='off'){intentRef.current=false;setStatus('ended');return;}n=0;}} playIndex(n,true);},[playIndex]);
  const prevTrack=useCallback(()=>{const cur=indexRef.current; if(cur===null)return; if(time>3){try{playerRef.current?.seekTo?.(0,true)}catch{}return;} playIndex(cur>0?cur-1:tracksRef.current.length-1,true)},[playIndex,time]);

  useEffect(()=>{
    const init=()=>{ if(!window.YT?.Player || playerRef.current)return; playerRef.current=new window.YT.Player('yt-engine',{height:'1',width:'1',playerVars:{autoplay:0,controls:0,playsinline:1,rel:0,iv_load_policy:3,enablejsapi:1,origin:location.origin},events:{
      onReady:(e:any)=>e.target.setVolume(volume), onStateChange:(e:any)=>{if(e.data===1)setStatus('playing');else if(e.data===2)setStatus('paused');else if(e.data===3)setStatus('buffering');else if(e.data===0){setStatus('ended');setTimeout(nextTrack,80)}}, onError:()=>setStatus('error') }}); };
    if(window.YT?.Player)init(); else if(!document.getElementById('youtube-api')){const s=document.createElement('script');s.id='youtube-api';s.src='https://www.youtube.com/iframe_api';document.head.appendChild(s);window.onYouTubeIframeAPIReady=init;}
    const timer=setInterval(()=>{try{if(playerRef.current?.getCurrentTime){setTime(playerRef.current.getCurrentTime()||0);const d=playerRef.current.getDuration()||0;if(d)setDuration(d);}}catch{}},500);
    return()=>clearInterval(timer);
  },[nextTrack]);
  useEffect(()=>{try{playerRef.current?.setVolume?.(muted?0:volume)}catch{}},[volume,muted]);

  useEffect(()=>{if('mediaSession' in navigator){const ms=navigator.mediaSession;const safe=(name:any,fn:any)=>{try{ms.setActionHandler(name,fn)}catch{}};safe('play',()=>{intentRef.current=true;playerRef.current?.playVideo?.()});safe('pause',()=>{intentRef.current=false;playerRef.current?.pauseVideo?.()});safe('nexttrack',nextTrack);safe('previoustrack',prevTrack);safe('seekbackward',()=>playerRef.current?.seekTo?.(Math.max(0,time-10),true));safe('seekforward',()=>playerRef.current?.seekTo?.(Math.min(duration,time+10),true));}},[nextTrack,prevTrack,time,duration]);
  useEffect(()=>{try{localStorage.setItem('pobremusic_state',JSON.stringify({url,playlist,tracks,index}))}catch{}},[url,playlist,tracks,index]);
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('pobremusic_state')||'null');if(saved?.tracks?.length){setUrl(saved.url||'');setPlaylist(saved.playlist);setTracks(saved.tracks);setIndex(saved.index??null)}}catch{}},[]);

  const importPlaylist=async()=>{
    setError('');setLoading(true);setResolveProgress(0);setTracks([]);setIndex(null);setStatus('unstarted');
    try{if(!parseSpotifyId(url))throw new Error('Cole o link de uma playlist pública do Spotify.');const r=await fetch(`/api/public-playlist?url=${encodeURIComponent(url)}`,{cache:'no-store'});const d:PlaylistData=await r.json();if(!r.ok||!d.sucesso)throw new Error(d.error||'Não foi possível importar a playlist.');setPlaylist(d);
      const base=d.faixas||[];const resolved:Track[]=[...base];let done=0;for(let i=0;i<resolved.length;i+=5){const batch=resolved.slice(i,i+5);await Promise.all(batch.map(async(t,j)=>{try{const rr=await fetch(`/api/search?nome_musica=${encodeURIComponent(t.nome_musica)}&nome_artista=${encodeURIComponent(t.nome_artista)}`,{cache:'no-store'});const x=await rr.json();if(rr.ok&&x.videoId)resolved[i+j]={...t,videoId:x.videoId,videoTitle:x.titulo};else resolved[i+j]={...t,hasError:true};}catch{resolved[i+j]={...t,hasError:true};}finally{done++;setResolveProgress(Math.round(done/base.length*100));}}));setTracks([...resolved]);}
      setTracks(resolved);const first=resolved.findIndex(t=>!!t.videoId);if(first>=0)playIndex(first,false);
    }catch(e:any){setError(e?.message||'Erro ao importar playlist.');}finally{setLoading(false)}
  };
  const playPause=()=>{if(index===null){const first=tracks.findIndex(t=>t.videoId);if(first>=0)playIndex(first,true);return;}if(status==='playing'){intentRef.current=false;playerRef.current?.pauseVideo?.()}else{intentRef.current=true;playerRef.current?.playVideo?.()}};
  const changeVolume=(v:number)=>{setVolume(v);setMuted(v===0)}; const seek=(v:number)=>{setTime(v);playerRef.current?.seekTo?.(v,true)}; const current=index!==null?tracks[index]:null;

  return <div className="app"><header><div className="brand"><div className="brandIcon">♫</div><div><strong>PobreMusic</strong><span>Spotify Playlist Player</span></div></div></header>
    <main><section className="import"><h1>Ouça suas playlists do Spotify</h1><p>Cole o link de uma playlist pública e importe as músicas para o PobreMusic.</p><div className="inputRow"><input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&importPlaylist()} placeholder="Cole aqui o link da playlist do Spotify"/><button onClick={importPlaylist} disabled={loading}>{loading?'Importando…':'Importar playlist'}</button></div>{loading&&<div className="progress"><div style={{width:`${resolveProgress}%`}}/><span>{resolveProgress}% — encontrando cada música</span></div>}{error&&<div className="error">{error}</div>}</section>
      {playlist&&<section className="playlistHead"><img src={playlist.capa_playlist||'https://placehold.co/500x500/181818/fff?text=♫'}/><div><small>PLAYLIST DO SPOTIFY</small><h2>{playlist.nome_playlist}</h2><p>{playlist.total_faixas} músicas</p><button className="playBig" onClick={()=>{const first=tracks.findIndex(t=>t.videoId);if(first>=0)playIndex(first,true)}}>▶ Reproduzir</button></div></section>}
      {tracks.length>0&&<section className="tracks"><div className="tracksTitle"><h3>Músicas</h3><span>{tracks.filter(t=>t.videoId).length}/{tracks.length} encontradas</span></div>{tracks.map((t,i)=><button className={`track ${i===index?'active':''}`} key={`${t.spotify_id||t.nome_musica}-${i}`} onClick={()=>t.videoId&&playIndex(i,true)} disabled={!t.videoId}><img src={t.capa||'https://placehold.co/64x64/222/fff?text=♫'}/><span className="num">{i+1}</span><span className="info"><b>{t.nome_musica}</b><small>{t.nome_artista}</small></span>{i===index&&status==='playing'?<span className="playing">●</span>:t.hasError?<span className="notfound">Não encontrada</span>:<span className="dur">{formatTime((t.duracao_ms||0)/1000)}</span>}</button>)}</section>}
    </main><div id="yt-engine"/>
    <footer className="player"><div className="now">{current?<><img src={current.capa||'https://placehold.co/64x64/222/fff?text=♫'}/><div><b>{current.nome_musica}</b><small>{current.nome_artista}</small></div></>:<span>Nenhuma música selecionada</span>}</div><div className="controls"><div className="buttons"><button onClick={prevTrack}>⏮</button><button className="mainPlay" onClick={playPause}>{status==='playing'?'Ⅱ':'▶'}</button><button onClick={nextTrack}>⏭</button></div><div className="seek"><span>{formatTime(time)}</span><input type="range" min="0" max={duration||1} step="1" value={Math.min(time,duration||1)} onChange={e=>seek(Number(e.target.value))}/><span>{formatTime(duration)}</span></div></div><div className="extras"><button onClick={()=>setShuffle(v=>!v)} className={shuffle?'on':''}>🔀</button><button onClick={()=>setRepeat(v=>v==='off'?'all':v==='all'?'one':'off')} className={repeat!=='off'?'on':''}>🔁{repeat==='one'&&<sup>1</sup>}</button><span>🔊</span><input aria-label="Volume" type="range" min="0" max="100" value={muted?0:volume} onChange={e=>changeVolume(Number(e.target.value))}/></div></footer>
  </div>;
}
