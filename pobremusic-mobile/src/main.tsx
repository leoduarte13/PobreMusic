import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Play, Pause, SkipBack, SkipForward, Plus, Trash2, Music2} from 'lucide-react';
import './style.css';

type Track={id:string; title:string; artist:string; audioUrl?:string};
type Playlist={id:string; name:string; tracks:Track[]};

function App(){
 const [tracks,setTracks]=useState<Track[]>([]);
 const [playlists,setPlaylists]=useState<Playlist[]>([{id:'library',name:'Minhas músicas',tracks:[]}]);
 const [current,setCurrent]=useState<Track|null>(null);
 const [playing,setPlaying]=useState(false);
 const audio=useRef<HTMLAudioElement|null>(null);
 useEffect(()=>{const a=new Audio();a.preload='auto';audio.current=a;const onPlay=()=>setPlaying(true),onPause=()=>setPlaying(false);a.addEventListener('play',onPlay);a.addEventListener('pause',onPause);return()=>{a.pause();a.removeEventListener('play',onPlay);a.removeEventListener('pause',onPause)}} ,[]);
 useEffect(()=>{const a=audio.current;if(!a||!current?.audioUrl)return;a.src=current.audioUrl;a.play().catch(()=>setPlaying(false));if('mediaSession'in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:current.title,artist:current.artist});navigator.mediaSession.setActionHandler('play',()=>a.play());navigator.mediaSession.setActionHandler('pause',()=>a.pause());}},[current]);
 const create=()=>{const name=prompt('Nome da playlist');if(name?.trim())setPlaylists(p=>[...p,{id:crypto.randomUUID(),name:name.trim(),tracks:[]}])};
 const toggle=()=>{const a=audio.current;if(!a||!current?.audioUrl)return;playing?a.pause():a.play().catch(()=>{})};
 return <main><header><h1><Music2/> PobreMusic</h1><button onClick={create}><Plus/> Nova playlist</button></header><section><h2>Biblioteca</h2>{tracks.length===0?<p>Nenhuma música importada.</p>:tracks.map(t=><div className='row' key={t.id}><span><b>{t.title}</b><small>{t.artist}</small></span><button disabled={!t.audioUrl} onClick={()=>setCurrent(t)}>▶</button></div>)}</section><section><h2>Playlists</h2>{playlists.map(p=><div className='row' key={p.id}><span><b>{p.name}</b><small>{p.tracks.length} músicas</small></span>{p.id!=='library'&&<button onClick={()=>setPlaylists(x=>x.filter(y=>y.id!==p.id))}><Trash2/></button>}</div>)}</section>{current&&<footer><span><b>{current.title}</b><small>{current.artist}</small></span><button><SkipBack/></button><button onClick={toggle}>{playing?<Pause/>:<Play/>}</button><button><SkipForward/></button></footer>}</main>}
createRoot(document.getElementById('root')!).render(<App/>);
