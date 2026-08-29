import React, { useState, useEffect, useRef, useCallback } from "react";
import { Navbar } from "./components/Navbar";
import { PlaylistInput } from "./components/PlaylistInput";
import { TrackList } from "./components/TrackList";
import { AudioPlayerBar } from "./components/AudioPlayerBar";
import { MiniPlayer } from "./components/MiniPlayer";
import { YouTubeIFrameContainer, YouTubePlayerRef } from "./components/YouTubeIFrameContainer";
import { ConfigGuideModal } from "./components/ConfigGuideModal";
import { EqualizerModal } from "./components/EqualizerModal";
import { SavePlaylistModal } from "./components/SavePlaylistModal";
import { CreatePlaylistModal } from "./components/CreatePlaylistModal";
import { AddTrackModal } from "./components/AddTrackModal";
import { SpotifyNowPlayingView } from "./components/SpotifyNowPlayingView";
import { SpotifyAuthModal } from "./components/SpotifyAuthModal";
import { MobileDownloadModal } from "./components/MobileDownloadModal";
import { MobileDownloadBanner } from "./components/MobileDownloadBanner";
import { GoogleAuthErrorModal } from "./components/GoogleAuthErrorModal";
import { Track, PlaylistData, ConfigStatus, PlaybackStatus, SpotifyUser, UserPlaylistSummary, SavedPlaylist, EqualizerState, GoogleUserProfile } from "./types";
import { signInWithGoogle, logoutGoogle, subscribeToAuth, checkRedirectAuthResult, formatAuthErrorMessage, saveUserPlaylistToCloud, deleteUserPlaylistFromCloud, subscribeToUserCloudPlaylists, saveUserSettingsToCloud } from "./lib/firebase";
import { fetchPlaylistSafe, resolveYouTubeVideoIdClient, getCandidateBackendUrls } from "./utils/clientMusicResolver";
import { playlistLogger } from "./utils/logger";
import { AlertCircle, Disc3, Lock, LogIn } from "lucide-react";

function normalizeSpotifyPlaylistSummary(p: any): UserPlaylistSummary {
  return {
    id: String(p?.id || ""),
    name: String(p?.name || "Playlist sem nome"),
    description: p?.description || "",
    isPrivate: p?.isPrivate ?? p?.public === false ?? false,
    isCollaborative: Boolean(p?.isCollaborative ?? p?.collaborative),
    trackCount: Number(p?.trackCount ?? p?.total_tracks ?? p?.items?.total ?? p?.tracks?.total ?? 0),
    cover: p?.cover || p?.image_url || p?.images?.[0]?.url || "",
    ownerName: p?.ownerName || p?.owner?.display_name || "Você",
  };
}

export default function App() {
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isEqualizerModalOpen, setIsEqualizerModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddTrackModalOpen, setIsAddTrackModalOpen] = useState(false);
  const [isSpotifyNowPlayingOpen, setIsSpotifyNowPlayingOpen] = useState(false);
  const [isMobileDownloadOpen, setIsMobileDownloadOpen] = useState(false);
  const [isSpotifyAuthModalOpen, setIsSpotifyAuthModalOpen] = useState(false);
  const [isMiniPlayerMode, setIsMiniPlayerMode] = useState<boolean>(() => { try { return localStorage.getItem("spottube_mini_player_mode") === "true"; } catch { return false; } });
  const [pwaPromptEvent, setPwaPromptEvent] = useState<any>(null);
  const [canInstallPWA, setCanInstallPWA] = useState(false);
  const [eqState, setEqState] = useState<EqualizerState>(() => { try { const saved = localStorage.getItem("spottube_equalizer_settings"); if (saved) return JSON.parse(saved); } catch {} return { enabled: false, preset: "flat", bands: [0,0,0,0,0,0,0], bassBoost: 0, surround: false }; });
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<{title:string;message:string;isDomainError:boolean;currentDomain:string}|null>(null);
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>(() => { try { const saved = localStorage.getItem("spottube_saved_playlists"); if (saved) return JSON.parse(saved); } catch {} return []; });
  const [spotifyUser, setSpotifyUser] = useState<SpotifyUser | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylistSummary[]>([]);
  const [isLoadingUserPlaylists, setIsLoadingUserPlaylists] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [playlistData, setPlaylistData] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [needsAuthNotice, setNeedsAuthNotice] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("unstarted");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [prevVolume, setPrevVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off"|"all"|"one">("all");
  const ytPlayerRef = useRef<YouTubePlayerRef>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<Track[]>(tracks);
  const currentTrackIndexRef = useRef<number|null>(currentTrackIndex);
  const shuffleRef = useRef(shuffle);
  const repeatModeRef = useRef<"off"|"all"|"one">(repeatMode);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  const toggleMiniPlayer = useCallback(() => setIsMiniPlayerMode(prev => { const next=!prev; try { localStorage.setItem("spottube_mini_player_mode",String(next)); } catch {} return next; }), []);
  useEffect(() => { const h=(e:Event)=>{e.preventDefault();setPwaPromptEvent(e);setCanInstallPWA(true)}; window.addEventListener("beforeinstallprompt",h); return()=>window.removeEventListener("beforeinstallprompt",h); },[]);
  const handleTriggerPWAInstall = async()=>{if(!pwaPromptEvent)return;pwaPromptEvent.prompt();const {outcome}=await pwaPromptEvent.userChoice;if(outcome==="accepted"){setCanInstallPWA(false);setPwaPromptEvent(null)}};
  const handleLoginGoogle = async()=>{setIsGoogleLoggingIn(true);setGoogleAuthError(null);try{const user=await signInWithGoogle();setGoogleUser(user)}catch(err:any){const code=err?.code||"";if(code!=="auth/popup-closed-by-user"&&code!=="auth/cancelled-popup-request")setGoogleAuthError(formatAuthErrorMessage(err))}finally{setIsGoogleLoggingIn(false)}};
  const handleLogoutGoogle = async()=>{try{await logoutGoogle();setGoogleUser(null)}catch(err){console.warn("Google logout error:",err)}};
  useEffect(()=>{checkRedirectAuthResult().then(u=>{if(u)setGoogleUser(u)}).catch(()=>{});const unsubscribe=subscribeToAuth(user=>setGoogleUser(user));return()=>unsubscribe()},[]);
  useEffect(()=>{if(googleUser?.uid){return subscribeToUserCloudPlaylists(googleUser.uid,list=>{if(list){setSavedPlaylists(list);try{localStorage.setItem(`spottube_saved_playlists_${googleUser.uid}`,JSON.stringify(list))}catch{}}})}try{const saved=localStorage.getItem("spottube_saved_playlists");setSavedPlaylists(saved?JSON.parse(saved):[])}catch{setSavedPlaylists([])}},[googleUser]);
  const handleUpdateEqState=(newState:EqualizerState)=>{setEqState(newState);try{localStorage.setItem("spottube_equalizer_settings",JSON.stringify(newState))}catch{}if(googleUser?.uid)saveUserSettingsToCloud(googleUser.uid,{equalizer:newState})};
  const persistSavedPlaylists=(updated:SavedPlaylist[])=>{setSavedPlaylists(updated);try{localStorage.setItem(googleUser?.uid?`spottube_saved_playlists_${googleUser.uid}`:"spottube_saved_playlists",JSON.stringify(updated))}catch{}};
  const handleSavePlaylist=async(newPlaylist:SavedPlaylist)=>{const p={...newPlaylist,userId:googleUser?.uid,isCloud:!!googleUser?.uid,updatedAt:Date.now()};const i=savedPlaylists.findIndex(x=>x.id===p.id||x.name===p.name);const updated=i>=0?savedPlaylists.map((x,n)=>n===i?p:x):[p,...savedPlaylists];persistSavedPlaylists(updated);if(googleUser?.uid)try{await saveUserPlaylistToCloud(googleUser.uid,p)}catch{}};
  const handleCreatePlaylist=async(p:SavedPlaylist)=>{const x={...p,userId:googleUser?.uid,isCloud:!!googleUser?.uid,updatedAt:Date.now()};persistSavedPlaylists([x,...savedPlaylists]);if(googleUser?.uid)try{await saveUserPlaylistToCloud(googleUser.uid,x)}catch{}setPlaylistData({sucesso:true,playlist_id:x.id,nome_playlist:x.name,descricao:x.description||"Playlist personalizada criada no POBREMUSIC",capa_playlist:x.cover,total_faixas:x.tracks.length,faixas:x.tracks});setTracks(x.tracks);setCurrentTrackIndex(x.tracks.length?0:null)};
  const handleDeleteSavedPlaylist=async(id:string)=>{persistSavedPlaylists(savedPlaylists.filter(p=>p.id!==id));if(googleUser?.uid)try{await deleteUserPlaylistFromCloud(googleUser.uid,id)}catch{}};
  const handleSelectSavedPlaylist=(p:SavedPlaylist)=>{setPlaylistData({sucesso:true,playlist_id:p.id,nome_playlist:p.name,descricao:p.description||"Playlist salva",capa_playlist:p.cover,total_faixas:p.tracks.length,faixas:p.tracks});setTracks(p.tracks);setCurrentTrackIndex(p.tracks.length?0:null)};
  const handleAddTrack=(t:Track)=>setTracks(prev=>{const u=[...prev,t];if(playlistData?.playlist_id){const m=savedPlaylists.find(p=>p.id===playlistData.playlist_id);if(m)handleSavePlaylist({...m,tracks:u})}if(currentTrackIndex===null)setCurrentTrackIndex(0);return u});
  const handleAddMultipleTracks=(ts:Track[])=>{if(!ts.length)return;setTracks(prev=>{const u=[...prev,...ts];if(playlistData?.playlist_id){const m=savedPlaylists.find(p=>p.id===playlistData.playlist_id);if(m)handleSavePlaylist({...m,tracks:u})}if(currentTrackIndex===null)setCurrentTrackIndex(0);return u})};
  const handleRemoveTrack=(idx:number)=>setTracks(prev=>{const u=prev.filter((_,i)=>i!==idx);if(playlistData?.playlist_id){const m=savedPlaylists.find(p=>p.id===playlistData.playlist_id);if(m)handleSavePlaylist({...m,tracks:u})}if(currentTrackIndex!==null){if(currentTrackIndex===idx){if(!u.length){setCurrentTrackIndex(null);ytPlayerRef.current?.pause()}else{const n=idx<u.length?idx:0;setCurrentTrackIndex(n);playTrack(n)}}else if(currentTrackIndex>idx)setCurrentTrackIndex(currentTrackIndex-1)}return u});
  const handleRemoveMultipleTracks=(indexes:number[])=>setTracks(prev=>{const set=new Set(indexes);const u=prev.filter((_,i)=>!set.has(i));if(playlistData?.playlist_id){const m=savedPlaylists.find(p=>p.id===playlistData.playlist_id);if(m)handleSavePlaylist({...m,tracks:u})}if(currentTrackIndex!==null&&set.has(currentTrackIndex)){if(!u.length){setCurrentTrackIndex(null);ytPlayerRef.current?.pause()}else{setCurrentTrackIndex(0);playTrack(0)}}return u});
  useEffect(()=>{fetch("/api/config-status",{cache:"no-store"}).then(r=>r.json()).then(setConfigStatus).catch(()=>{})},[]);

  const fetchUserPlaylists=useCallback(async()=>{
    setIsLoadingUserPlaylists(true);
    try{
      const token=localStorage.getItem("spotifyTokenManual")||localStorage.getItem("spotifyTokenManuaL");
      const headers:Record<string,string>={};
      if(token)headers.Authorization=`Bearer ${token}`;
      const res=await fetch("/api/my-playlists",{headers,credentials:"include",cache:"no-store"});
      const data=await res.json().catch(()=>({}));
      if(res.ok){setUserPlaylists((data.playlists||[]).map(normalizeSpotifyPlaylistSummary));return;}
      if(res.status===401){setSpotifyUser(null);}
    }catch(err){console.warn("Could not fetch user playlists:",err)}finally{setIsLoadingUserPlaylists(false)}
  },[]);

  const checkAuthStatus=useCallback(async()=>{
    try{
      const token=localStorage.getItem("spotifyTokenManual")||localStorage.getItem("spotifyTokenManuaL");
      const headers:Record<string,string>={};if(token)headers.Authorization=`Bearer ${token}`;
      const res=await fetch("/api/auth/me",{headers,credentials:"include",cache:"no-store"});
      if(!res.ok)return;
      const data=await res.json();
      if(data.authenticated&&data.user){setSpotifyUser(data.user);fetchUserPlaylists()}
      else{setSpotifyUser(null);setUserPlaylists([]);if(data.expired){localStorage.removeItem("spotifyTokenManual");localStorage.removeItem("spotifyTokenManuaL")}}
    }catch(err){console.warn("Error checking auth status:",err)}
  },[fetchUserPlaylists]);
  useEffect(()=>{checkAuthStatus()},[checkAuthStatus]);
  const handleLoginSpotify=()=>setIsSpotifyAuthModalOpen(true);
  const handleSpotifyLoginSuccess=(user:SpotifyUser)=>{setSpotifyUser(user);setIsLoggingIn(false);fetchUserPlaylists();setNeedsAuthNotice(false)};
  const handleLogoutSpotify=async()=>{localStorage.removeItem("spotifyTokenManual");localStorage.removeItem("spotifyTokenManuaL");try{await fetch("/api/auth/logout",{method:"POST",credentials:"include"})}catch{}finally{setSpotifyUser(null);setUserPlaylists([])}};
  const loadPlaylist=async(urlOrId:string)=>{setIsLoadingPlaylist(true);setPlaylistError(null);setNeedsAuthNotice(false);playlistLogger.startLoad(urlOrId,getCandidateBackendUrls());try{if(!urlOrId.trim())throw new Error("Por favor, informe o link ou ID da playlist do Spotify.");const token=localStorage.getItem("spotifyTokenManual")||localStorage.getItem("spotifyTokenManuaL");const {data,needsAuth}=await fetchPlaylistSafe(urlOrId,token);if(needsAuth)setNeedsAuthNotice(true);if(!data?.sucesso||!data.faixas?.length)throw new Error(data?.descricao||data?.error||"Não foi possível obter as faixas deste link. Conecte sua conta Spotify para playlists privadas.");playlistLogger.finishLoad(urlOrId,{sucesso:true,totalFaixas:data.total_faixas,nomePlaylist:data.nome_playlist,modo:data.modo});setPlaylistData(data);setTracks(data.faixas);setCurrentTrackIndex(0)}catch(err:any){playlistLogger.finishLoad(urlOrId,{sucesso:false,error:err?.message||err});setPlaylistData(null);setTracks([]);setCurrentTrackIndex(null);ytPlayerRef.current?.pause();setPlaylistError(err?.message||"Não foi possível carregar a playlist.")}finally{setIsLoadingPlaylist(false)}};
  useEffect(()=>{loadPlaylist("top_hits")},[]);
  const preloadNextTrackVideo=useCallback(async(index:number)=>{const ts=tracksRef.current;if(ts.length<=1)return;const n=(index+1)%ts.length;const t=ts[n];if(t&&!t.videoId&&!t.isLoadingVideo)try{const id=await resolveYouTubeVideoIdClient(t.nome_musica,t.nome_artista);if(id)setTracks(prev=>prev.map((x,i)=>i===n?{...x,videoId:id}:x))}catch{}},[]);
  const playTrack=useCallback(async(index:number)=>{const ts=tracksRef.current;if(index<0||index>=ts.length)return;setCurrentTrackIndex(index);currentTrackIndexRef.current=index;preloadNextTrackVideo(index);const t=ts[index];if(t.videoId){ytPlayerRef.current?.loadVideo(t.videoId);ytPlayerRef.current?.play();return}setTracks(prev=>prev.map((x,i)=>i===index?{...x,isLoadingVideo:true}:x));try{const id=await resolveYouTubeVideoIdClient(t.nome_musica,t.nome_artista,t.videoId);if(!id)throw new Error("Vídeo não encontrado");setTracks(prev=>prev.map((x,i)=>i===index?{...x,videoId:id,isLoadingVideo:false}:x));ytPlayerRef.current?.loadVideo(id);ytPlayerRef.current?.play();preloadNextTrackVideo(index)}catch(err){setTracks(prev=>prev.map((x,i)=>i===index?{...x,isLoadingVideo:false,hasError:true}:x));setTimeout(()=>handleNextTrack(),600)}},[preloadNextTrackVideo]);
  const handleNextTrack=useCallback(()=>{const ts=tracksRef.current;const i=currentTrackIndexRef.current;if(!ts.length||i===null)return;if(repeatModeRef.current==="one")return playTrack(i);if(shuffleRef.current){let n=Math.floor(Math.random()*ts.length);if(ts.length>1&&n===i)n=(i+1)%ts.length;return playTrack(n)}playTrack(i+1<ts.length?i+1:0)},[playTrack]);
  const handlePrevTrack=useCallback(()=>{const ts=tracksRef.current;const i=currentTrackIndexRef.current;if(!ts.length||i===null)return;if(currentTime>3)return ytPlayerRef.current?.seekTo(0);playTrack(i>0?i-1:ts.length-1)},[currentTime,playTrack]);
  const handleTogglePlayPause=useCallback(()=>{if(currentTrackIndex===null&&tracks.length){playTrack(0);return}const t=currentTrackIndex!==null?tracks[currentTrackIndex]:null;if(!t?.videoId){if(currentTrackIndex!==null)playTrack(currentTrackIndex);return}if(playbackStatus==="playing")ytPlayerRef.current?.pause();else ytPlayerRef.current?.play()},[currentTrackIndex,tracks,playbackStatus,playTrack]);
  const handleSeek=useCallback((s:number)=>{ytPlayerRef.current?.seekTo(s);setCurrentTime(s)},[]);
  const handleVolumeChange=(v:number)=>{setVolume(v);if(isMuted&&v>0)setIsMuted(false);ytPlayerRef.current?.setVolume(v)};
  const handleToggleMute=()=>{if(isMuted){setIsMuted(false);setVolume(prevVolume||50);ytPlayerRef.current?.setVolume(prevVolume||50)}else{setPrevVolume(volume);setIsMuted(true);setVolume(0);ytPlayerRef.current?.setVolume(0)}};
  const handleToggleRepeat=()=>setRepeatMode(p=>p==="off"?"all":p==="all"?"one":"off");
  const currentTrack=currentTrackIndex!==null?tracks[currentTrackIndex]||null:null;
  useEffect(()=>{const audio=new Audio();audio.src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";audio.loop=true;audio.volume=.001;silentAudioRef.current=audio;return()=>{audio.pause();audio.src=""}},[]);
  useEffect(()=>{if(playbackStatus==="playing")silentAudioRef.current?.play().catch(()=>{});else silentAudioRef.current?.pause()},[playbackStatus]);
  useEffect(()=>{if(!("mediaSession"in navigator))return;if(currentTrack)navigator.mediaSession.metadata=new MediaMetadata({title:currentTrack.nome_musica,artist:currentTrack.nome_artista,album:currentTrack.album||playlistData?.nome_playlist||"POBREMUSIC",artwork:[{src:currentTrack.capa||"/icon.png",sizes:"512x512",type:"image/jpeg"}]});navigator.mediaSession.playbackState=playbackStatus==="playing"?"playing":"paused";try{navigator.mediaSession.setActionHandler("play",()=>handleTogglePlayPause());navigator.mediaSession.setActionHandler("pause",()=>handleTogglePlayPause());navigator.mediaSession.setActionHandler("previoustrack",()=>handlePrevTrack());navigator.mediaSession.setActionHandler("nexttrack",()=>handleNextTrack());navigator.mediaSession.setActionHandler("seekto",d=>{if(d.seekTime!==undefined)handleSeek(d.seekTime)})}catch{}},[currentTrack,playbackStatus,playlistData,currentTime,duration,handleTogglePlayPause,handlePrevTrack,handleNextTrack,handleSeek]);

  return (
    <>
      <Navbar spotifyUser={spotifyUser} onLoginSpotify={handleLoginSpotify} onLogoutSpotify={handleLogoutSpotify} userPlaylists={userPlaylists} onSelectPlaylist={async (p:any)=>loadPlaylist(p.id)} isLoadingPlaylists={isLoadingUserPlaylists} onLoginGoogle={handleLoginGoogle} onLogoutGoogle={handleLogoutGoogle} googleUser={googleUser} onCreatePlaylist={()=>setIsCreateModalOpen(true)} onOpenConfig={()=>setIsConfigModalOpen(true)} />
      <main className="min-h-screen bg-zinc-950"><PlaylistInput onLoadPlaylist={loadPlaylist} isLoading={isLoadingPlaylist} error={playlistError} needsAuth={needsAuthNotice} onLoginSpotify={handleLoginSpotify}/><TrackList tracks={tracks} currentTrackIndex={currentTrackIndex} playbackStatus={playbackStatus} onPlayTrack={playTrack} onRemoveTrack={handleRemoveTrack} onRemoveMultipleTracks={handleRemoveMultipleTracks} /><AudioPlayerBar currentTrack={currentTrack} playbackStatus={playbackStatus} currentTime={currentTime} duration={duration} volume={volume} isMuted={isMuted} shuffle={shuffle} repeatMode={repeatMode} onTogglePlayPause={handleTogglePlayPause} onNext={handleNextTrack} onPrevious={handlePrevTrack} onSeek={handleSeek} onVolumeChange={handleVolumeChange} onToggleMute={handleToggleMute} onToggleShuffle={()=>setShuffle(p=>!p)} onToggleRepeat={handleToggleRepeat} />
      <YouTubeIFrameContainer ref={ytPlayerRef} currentVideoId={currentTrack?.videoId} onStatusChange={setPlaybackStatus} onTimeUpdate={(c,d)=>{setCurrentTime(c);setDuration(d)}} onTrackEnded={handleNextTrack} onError={()=>{if(currentTrackIndexRef.current!==null)handleNextTrack()}} volume={isMuted?0:volume}/>
      {isSpotifyAuthModalOpen&&<SpotifyAuthModal isOpen={isSpotifyAuthModalOpen} onClose={()=>setIsSpotifyAuthModalOpen(false)} onLoginSuccess={handleSpotifyLoginSuccess} configStatus={configStatus}/>} 
      {isConfigModalOpen&&<ConfigGuideModal isOpen={isConfigModalOpen} onClose={()=>setIsConfigModalOpen(false)} configStatus={configStatus}/>} 
      {isEqualizerModalOpen&&<EqualizerModal isOpen={isEqualizerModalOpen} onClose={()=>setIsEqualizerModalOpen(false)} state={eqState} onChange={handleUpdateEqState}/>} 
      {isSaveModalOpen&&<SavePlaylistModal isOpen={isSaveModalOpen} onClose={()=>setIsSaveModalOpen(false)} playlistData={playlistData} tracks={tracks} onSave={handleSavePlaylist}/>} 
      {isCreateModalOpen&&<CreatePlaylistModal isOpen={isCreateModalOpen} onClose={()=>setIsCreateModalOpen(false)} onCreate={handleCreatePlaylist}/>} 
      {isAddTrackModalOpen&&<AddTrackModal isOpen={isAddTrackModalOpen} onClose={()=>setIsAddTrackModalOpen(false)} onAddTrack={handleAddTrack} onAddMultipleTracks={handleAddMultipleTracks}/>} 
      {isSpotifyNowPlayingOpen&&<SpotifyNowPlayingView isOpen={isSpotifyNowPlayingOpen} onClose={()=>setIsSpotifyNowPlayingOpen(false)} currentTrack={currentTrack} spotifyUser={spotifyUser}/>} 
      {isMobileDownloadOpen&&<MobileDownloadModal isOpen={isMobileDownloadOpen} onClose={()=>setIsMobileDownloadOpen(false)} canInstall={canInstallPWA} onInstall={handleTriggerPWAInstall}/>} 
      <MobileDownloadBanner onOpen={()=>setIsMobileDownloadOpen(true)} />
      {googleAuthError&&<GoogleAuthErrorModal error={googleAuthError} onClose={()=>setGoogleAuthError(null)}/>} 
    </>
  );
}
