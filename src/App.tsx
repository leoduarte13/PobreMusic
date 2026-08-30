import React,{useCallback,useEffect,useRef,useState}from"react";
import{Navbar}from"./components/Navbar";import{PlaylistInput}from"./components/PlaylistInput";import{TrackList}from"./components/TrackList";import{AudioPlayerBar}from"./components/AudioPlayerBar";import{YouTubeIFrameContainer,YouTubePlayerRef}from"./components/YouTubeIFrameContainer";import BackgroundAudioPlayer,{BackgroundAudioPlayerRef}from"./components/BackgroundAudioPlayer";import{SpotifyAuthModal}from"./components/SpotifyAuthModal";import{ConfigGuideModal}from"./components/ConfigGuideModal";import{SavePlaylistModal}from"./components/SavePlaylistModal";import{CreatePlaylistModal}from"./components/CreatePlaylistModal";import{Track,PlaylistData,ConfigStatus,PlaybackStatus,SpotifyUser,UserPlaylistSummary,GoogleUserProfile,SavedPlaylist}from"./types";
import{fetchPlaylistSafe,getCandidateBackendUrls,resolveYouTubeVideoIdClient,resolveDirectAudioTrack}from"./utils/clientMusicResolver";
import{cachePlaylistMetadata,getLastPlayedPlaylist,getCachedPlaylist,updateLastPlayedPlaylistTracks}from"./utils/offlineStorage";
import{playlistLogger}from"./utils/logger";import{signInWithGoogle,logoutGoogle,subscribeToAuth,checkRedirectAuthResult,saveUserPlaylistToCloud,deleteUserPlaylistFromCloud,subscribeToUserCloudPlaylists}from"./lib/firebase";import{AlertCircle,Disc3,Lock,LogIn}from"lucide-react";
function normalizePlaylist(p:any):UserPlaylistSummary{return{id:String(p?.id||""),name:String(p?.name||"Playlist sem nome"),description:p?.description||"",isPrivate:p?.isPrivate??p?.public===false??false,isCollaborative:Boolean(p?.isCollaborative??p?.collaborative),trackCount:Number(p?.trackCount??p?.total_tracks??p?.items?.total??p?.tracks?.total??0),cover:p?.cover||p?.image_url||p?.images?.[0]?.url||"",ownerName:p?.ownerName||p?.owner?.display_name||"Você"}}
export default function App(){
const[configStatus,setConfigStatus]=useState<ConfigStatus|null>(null),[configOpen,setConfigOpen]=useState(false),[spotifyAuthOpen,setSpotifyAuthOpen]=useState(false),[spotifyUser,setSpotifyUser]=useState<SpotifyUser|null>(null),[googleUser,setGoogleUser]=useState<GoogleUserProfile|null>(null),[googleLoggingIn,setGoogleLoggingIn]=useState(false),[userPlaylists,setUserPlaylists]=useState<UserPlaylistSummary[]>([]),[isLoadingUserPlaylists,setIsLoadingUserPlaylists]=useState(false),[savedPlaylists,setSavedPlaylists]=useState<SavedPlaylist[]>([]),[playlistData,setPlaylistData]=useState<PlaylistData|null>(null),[tracks,setTracks]=useState<Track[]>([]),[isLoadingPlaylist,setIsLoadingPlaylist]=useState(false),[playlistError,setPlaylistError]=useState<string|null>(null),[needsAuthNotice,setNeedsAuthNotice]=useState(false),[currentTrackIndex,setCurrentTrackIndex]=useState<number|null>(null),[playbackStatus,setPlaybackStatus]=useState<PlaybackStatus>("unstarted"),[currentTime,setCurrentTime]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(80),[isMuted,setIsMuted]=useState(false),[previousVolume,setPreviousVolume]=useState(80),[shuffle,setShuffle]=useState(false),[repeatMode,setRepeatMode]=useState<"off"|"all"|"one">("all"),[saveModalOpen,setSaveModalOpen]=useState(false),[createModalOpen,setCreateModalOpen]=useState(false);
const ytRef=useRef<YouTubePlayerRef>(null),audioRef=useRef<BackgroundAudioPlayerRef>(null),tracksRef=useRef<Track[]>([]),indexRef=useRef<number|null>(null),shuffleRef=useRef(false),repeatRef=useRef<"off"|"all"|"one">("all"),nativeModeRef=useRef(false),nextTrackRef=useRef<()=>void>(()=>{});
useEffect(()=>{tracksRef.current=tracks},[tracks]);useEffect(()=>{indexRef.current=currentTrackIndex},[currentTrackIndex]);useEffect(()=>{shuffleRef.current=shuffle},[shuffle]);useEffect(()=>{repeatRef.current=repeatMode},[repeatMode]);
const getToken=()=>{try{return localStorage.getItem("spotifyTokenManual")||localStorage.getItem("spotifyTokenManuaL")||""}catch{return""}};
const fetchUserPlaylists=useCallback(async()=>{setIsLoadingUserPlaylists(true);try{const token=getToken(),headers:Record<string,string>={};if(token)headers.Authorization=`Bearer ${token}`;const r=await fetch("/api/my-playlists",{headers,credentials:"include",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401)setSpotifyUser(null);setUserPlaylists([]);return}setUserPlaylists(Array.isArray(d.playlists)?d.playlists.map(normalizePlaylist):[])}catch{setUserPlaylists([])}finally{setIsLoadingUserPlaylists(false)}},[]);
const checkSpotifyAuth=useCallback(async()=>{try{const token=getToken(),headers:Record<string,string>={};if(token)headers.Authorization=`Bearer ${token}`;const r=await fetch("/api/auth/me",{headers,credentials:"include",cache:"no-store"}),d=await r.json().catch(()=>({}));if(d.authenticated&&d.user){setSpotifyUser(d.user);fetchUserPlaylists()}else{setSpotifyUser(null);setUserPlaylists([])}}catch{}},[fetchUserPlaylists]);
useEffect(()=>{fetch("/api/config-status",{cache:"no-store"}).then(r=>r.json()).then(setConfigStatus).catch(()=>{});checkSpotifyAuth();checkRedirectAuthResult().then(p=>{if(p)setGoogleUser(p)});return subscribeToAuth(setGoogleUser)},[checkSpotifyAuth]);
useEffect(()=>{if(!googleUser?.uid){setSavedPlaylists([]);return}return subscribeToUserCloudPlaylists(googleUser.uid,setSavedPlaylists,e=>console.warn("Cloud playlists:",e))},[googleUser?.uid]);
const handleGoogleLogin=useCallback(async()=>{setGoogleLoggingIn(true);try{setGoogleUser(await signInWithGoogle(true))}catch(e:any){console.error("Google login:",e);alert(e?.message||"Não foi possível entrar com Google.")}finally{setGoogleLoggingIn(false)}},[]);const handleGoogleLogout=useCallback(async()=>{try{await logoutGoogle()}finally{setGoogleUser(null);setSavedPlaylists([])}},[]);
const handleSpotifyLoginSuccess=(u:SpotifyUser)=>{setSpotifyUser(u);setSpotifyAuthOpen(false);setNeedsAuthNotice(false);fetchUserPlaylists()};const logoutSpotify=async()=>{try{localStorage.removeItem("spotifyTokenManual");localStorage.removeItem("spotifyTokenManuaL")}catch{}try{await fetch("/api/auth/logout",{method:"POST",credentials:"include"})}catch{}setSpotifyUser(null);setUserPlaylists([])};
  const loadPlaylist = useCallback(async (input: string) => {
    const value = input.trim();
    if (!value) return;
    setIsLoadingPlaylist(true);
    setPlaylistError(null);
    setNeedsAuthNotice(false);
    playlistLogger.startLoad(value, getCandidateBackendUrls());
    try {
      const { data, needsAuth } = await fetchPlaylistSafe(value, getToken() || null);
      if (needsAuth) setNeedsAuthNotice(true);
      if (!data?.sucesso || !Array.isArray(data.faixas) || !data.faixas.length) {
        throw new Error(data?.descricao || data?.error || "Não foi possível carregar as faixas desta playlist. Verifique se o link está correto ou se a playlist é privada.");
      }
      setPlaylistData(data);
      setTracks(data.faixas);
      cachePlaylistMetadata(data);
      setCurrentTrackIndex(null);
      setPlaybackStatus("unstarted");
      setCurrentTime(0);
      setDuration(0);
      nativeModeRef.current = false;
      ytRef.current?.pause();
      audioRef.current?.pause();
      playlistLogger.finishLoad(value, {
        sucesso: true,
        totalFaixas: data.total_faixas,
        nomePlaylist: data.nome_playlist,
        modo: data.modo,
      });
    } catch (e: any) {
      // 1. Offline & Local Storage Fallback Check
      const cached = getCachedPlaylist(value) || getLastPlayedPlaylist();
      if (cached && Array.isArray(cached.faixas) && cached.faixas.length > 0) {
        setPlaylistData({
          ...cached,
          aviso: "Modo Offline: Exibindo faixas salvas localmente no dispositivo.",
        });
        setTracks(cached.faixas);
        setCurrentTrackIndex(null);
        setPlaybackStatus("unstarted");
        setCurrentTime(0);
        setDuration(0);
        setPlaylistError(null);
        playlistLogger.finishLoad(value, {
          sucesso: true,
          totalFaixas: cached.faixas.length,
          nomePlaylist: cached.nome_playlist,
          modo: "offline_cached",
        });
      } else {
        const errorMsg = e?.message === "Failed to fetch"
          ? "Falha de conexão com a internet. Verifique sua rede ou acesse uma playlist salva no cache."
          : (e?.message || "Não foi possível carregar a playlist informada.");
        setPlaylistData(null);
        setTracks([]);
        setCurrentTrackIndex(null);
        setPlaylistError(errorMsg);
        playlistLogger.finishLoad(value, { sucesso: false, error: errorMsg });
      }
    } finally {
      setIsLoadingPlaylist(false);
    }
  }, []);

  // Initial load: Instant hydration from localStorage, followed by smooth refresh if online
  useEffect(() => {
    const cachedLast = getLastPlayedPlaylist();
    if (cachedLast && Array.isArray(cachedLast.faixas) && cachedLast.faixas.length > 0) {
      setPlaylistData(cachedLast);
      setTracks(cachedLast.faixas);
    } else {
      loadPlaylist("top_hits");
    }
  }, [loadPlaylist]);

  const playTrack = useCallback(async (index: number) => {
    const list = tracksRef.current;
    if (index < 0 || index >= list.length) return;
    indexRef.current = index;
    setCurrentTrackIndex(index);
    setCurrentTime(0);
    setDuration(0);
    const t = list[index];

    try {
      // 1. Direct stream already on track
      if (t.audioUrl) {
        nativeModeRef.current = true;
        ytRef.current?.pause();
        audioRef.current?.loadAudio(t.audioUrl, true);
        return;
      }

      // 2. Fast direct audio check (Audius / Jamendo)
      const directTrack = await resolveDirectAudioTrack(t.nome_musica, t.nome_artista);
      if (directTrack?.audioUrl) {
        nativeModeRef.current = true;
        ytRef.current?.pause();
        setTracks((p) =>
          p.map((x, i) =>
            i === index
              ? { ...x, audioUrl: directTrack.audioUrl, origem: directTrack.origem || "audius" }
              : x
          )
        );
        audioRef.current?.loadAudio(directTrack.audioUrl, true);
        return;
      }

      // 3. YouTube stream fallback with background audio anchor
      nativeModeRef.current = false;
      let id = t.videoId;
      if (!id) {
        id = await resolveYouTubeVideoIdClient(t.nome_musica, t.nome_artista);
      }
      setTracks((p) => p.map((x, i) => (i === index ? { ...x, videoId: id, isLoadingVideo: false } : x)));
      audioRef.current?.startBackgroundAnchor();
      ytRef.current?.loadVideo(id);
      ytRef.current?.play();
    } catch {
      setTracks((p) => p.map((x, i) => (i === index ? { ...x, isLoadingVideo: false, hasError: true } : x)));
      setTimeout(() => nextTrackRef.current(), 300);
    }
  }, []);

  const nextTrack = useCallback(() => {
    const l = tracksRef.current,
      c = indexRef.current;
    if (!l.length || c === null) return;
    if (repeatRef.current === "one") {
      playTrack(c);
      return;
    }
    if (shuffleRef.current) {
      let n = Math.floor(Math.random() * l.length);
      if (l.length > 1 && n === c) n = (c + 1) % l.length;
      playTrack(n);
      return;
    }
    if (c + 1 < l.length) playTrack(c + 1);
    else if (repeatRef.current === "all") playTrack(0);
    else setCurrentTrackIndex(null);
  }, [playTrack]);

  useEffect(() => {
    nextTrackRef.current = nextTrack;
  }, [nextTrack]);

  const previousTrack = useCallback(() => {
    const l = tracksRef.current,
      c = indexRef.current;
    if (!l.length || c === null) return;
    if (currentTime > 3) {
      if (nativeModeRef.current) audioRef.current?.seekTo(0);
      else ytRef.current?.seekTo(0);
      return;
    }
    playTrack(c > 0 ? c - 1 : l.length - 1);
  }, [currentTime, playTrack]);

  const togglePlay = useCallback(() => {
    if (currentTrackIndex === null) {
      if (tracks.length) playTrack(0);
      return;
    }
    if (nativeModeRef.current) {
      if (playbackStatus === "playing") {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play();
      }
    } else {
      if (playbackStatus === "playing") {
        ytRef.current?.pause();
        audioRef.current?.stopBackgroundAnchor();
      } else {
        audioRef.current?.startBackgroundAnchor();
        ytRef.current?.play();
      }
    }
  }, [currentTrackIndex, tracks.length, playbackStatus, playTrack]);

  const saveCloudPlaylist = useCallback(
    async (p: SavedPlaylist) => {
      if (!googleUser?.uid) {
        alert("Entre com Google para salvar playlists na nuvem.");
        return;
      }
      try {
        await saveUserPlaylistToCloud(googleUser.uid, p);
        setSaveModalOpen(false);
        setCreateModalOpen(false);
      } catch (e: any) {
        alert(e?.message || "Não foi possível salvar a playlist na nuvem.");
      }
    },
    [googleUser?.uid]
  );

  const selectSavedPlaylist = useCallback((p: SavedPlaylist) => {
    const data: PlaylistData = {
      sucesso: true,
      playlist_id: p.id,
      nome_playlist: p.name,
      descricao: p.description || "",
      capa_playlist: p.cover || "",
      total_faixas: p.tracks.length,
      faixas: p.tracks,
      modo: "cloud",
      aviso: "Playlist salva na nuvem",
      autenticado: true,
    };
    setPlaylistData(data);
    setTracks(p.tracks);
    setCurrentTrackIndex(null);
    setPlaybackStatus("unstarted");
    setCurrentTime(0);
    setDuration(0);
    ytRef.current?.pause();
    audioRef.current?.pause();
  }, []);

  const deleteSavedPlaylist = useCallback(
    async (id: string) => {
      if (!googleUser?.uid) return;
      try {
        await deleteUserPlaylistFromCloud(googleUser.uid, id);
      } catch (e: any) {
        alert(e?.message || "Não foi possível excluir a playlist.");
      }
    },
    [googleUser?.uid]
  );

  const removeTrack = (i: number) => {
    setTracks((p) => {
      const updated = p.filter((_, x) => x !== i);
      updateLastPlayedPlaylistTracks(updated);
      return updated;
    });
    if (currentTrackIndex === i) {
      const n = tracks.length - 1;
      if (n <= 0) setCurrentTrackIndex(null);
      else playTrack(Math.min(i, n));
    } else if (currentTrackIndex !== null && currentTrackIndex > i) {
      setCurrentTrackIndex(currentTrackIndex - 1);
    }
  };

  const removeMultipleTracks = (is: number[]) => {
    const rm = new Set(is),
      old = tracksRef.current,
      c = indexRef.current,
      u = old.filter((_, i) => !rm.has(i));
    setTracks(u);
    updateLastPlayedPlaylistTracks(u);
    if (!u.length) {
      setCurrentTrackIndex(null);
      return;
    }
    if (c !== null && rm.has(c)) playTrack(0);
    else if (c !== null) setCurrentTrackIndex(u.findIndex((t) => t === old[c]));
  };

  const currentTrack = currentTrackIndex === null ? null : tracks[currentTrackIndex] || null;

  const handleSeek = useCallback((seconds: number) => {
    const safeSeconds = Math.max(0, seconds);
    if (nativeModeRef.current) {
      audioRef.current?.seekTo(safeSeconds);
    } else {
      ytRef.current?.seekTo(safeSeconds);
    }
    setCurrentTime(safeSeconds);
  }, []);

  // Media Session API: Control playback via OS Notification Bar, Mobile Lock Screen & Bluetooth
  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof window === "undefined") return;
    const mediaSession = navigator.mediaSession;

    // 1. Sync metadata
    if (currentTrack) {
      try {
        const coverSrc = currentTrack.capa || "/pobremusic_icon_512.png";
        mediaSession.metadata = new MediaMetadata({
          title: currentTrack.nome_musica || "Música",
          artist: currentTrack.nome_artista || "PobreMusic",
          album: currentTrack.album || playlistData?.nome_playlist || "POBREMUSIC",
          artwork: [
            { src: coverSrc, sizes: "96x96", type: "image/jpeg" },
            { src: coverSrc, sizes: "128x128", type: "image/jpeg" },
            { src: coverSrc, sizes: "192x192", type: "image/jpeg" },
            { src: coverSrc, sizes: "256x256", type: "image/jpeg" },
            { src: coverSrc, sizes: "384x384", type: "image/jpeg" },
            { src: coverSrc, sizes: "512x512", type: "image/jpeg" },
          ],
        });
      } catch (err) {
        console.warn("[MediaSession] Metadata error:", err);
      }
    }

    // 2. Sync playback status
    try {
      mediaSession.playbackState = playbackStatus === "playing" ? "playing" : "paused";
    } catch {}

    // 3. Sync position and duration state
    const safeDuration = Math.max(
      duration || (currentTrack?.duracao_ms ? currentTrack.duracao_ms / 1000 : 180),
      1
    );
    const safePosition = Math.min(Math.max(currentTime || 0, 0), safeDuration);

    try {
      if (typeof mediaSession.setPositionState === "function") {
        mediaSession.setPositionState({
          duration: safeDuration,
          playbackRate: playbackStatus === "playing" ? 1 : 0,
          position: safePosition,
        });
      }
    } catch {}
  }, [currentTrack, playbackStatus, currentTime, duration, playlistData?.nome_playlist]);

  // Media Session Action Handlers
  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof window === "undefined") return;
    const mediaSession = navigator.mediaSession;

    const actionHandlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => togglePlay()],
      ["pause", () => togglePlay()],
      ["previoustrack", () => previousTrack()],
      ["nexttrack", () => nextTrack()],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") {
            handleSeek(details.seekTime);
          }
        },
      ],
      [
        "seekbackward",
        (details) => {
          const offset = details.seekOffset || 10;
          handleSeek(Math.max(0, currentTime - offset));
        },
      ],
      [
        "seekforward",
        (details) => {
          const offset = details.seekOffset || 10;
          const safeDur = duration || (currentTrack?.duracao_ms ? currentTrack.duracao_ms / 1000 : 180);
          handleSeek(Math.min(safeDur, currentTime + offset));
        },
      ],
      ["stop", () => togglePlay()],
    ];

    for (const [action, handler] of actionHandlers) {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {}
    }

    return () => {
      for (const [action] of actionHandlers) {
        try {
          mediaSession.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [togglePlay, nextTrack, previousTrack, handleSeek, currentTime, duration, currentTrack]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col pb-24">
      <Navbar
        configStatus={configStatus}
        spotifyUser={spotifyUser}
        isLoggingIn={false}
        onLoginSpotify={() => setSpotifyAuthOpen(true)}
        onLogoutSpotify={logoutSpotify}
        googleUser={googleUser}
        isGoogleLoggingIn={googleLoggingIn}
        onLoginGoogle={handleGoogleLogin}
        onLogoutGoogle={handleGoogleLogout}
        onOpenConfigModal={() => setConfigOpen(true)}
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-4">
        <PlaylistInput
          onLoadPlaylist={loadPlaylist}
          isLoading={isLoadingPlaylist}
          currentPlaylistId={playlistData?.playlist_id}
          spotifyUser={spotifyUser}
          userPlaylists={userPlaylists}
          isLoadingUserPlaylists={isLoadingUserPlaylists}
          onLoginSpotify={() => setSpotifyAuthOpen(true)}
          onRefreshUserPlaylists={fetchUserPlaylists}
          googleUser={googleUser}
          onLoginGoogle={handleGoogleLogin}
          savedPlaylists={savedPlaylists}
          onSelectSavedPlaylist={selectSavedPlaylist}
          onDeleteSavedPlaylist={deleteSavedPlaylist}
          onOpenCreateModal={() => setCreateModalOpen(true)}
        />
        {needsAuthNotice && (
          <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-amber-400" />
              <div>
                <b className="text-white">Playlist restrita</b>
                <p className="text-xs text-amber-200">
                  Conecte a conta Spotify para acessar playlists privadas ou colaborativas.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSpotifyAuthOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#1DB954] text-zinc-950 font-bold text-xs flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Conectar Spotify
            </button>
          </div>
        )}
        {playlistError && !needsAuthNotice && (
          <div className="p-4 rounded-2xl bg-red-950/60 border border-red-500/50 text-red-200 text-sm flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{playlistError}</span>
          </div>
        )}
        {isLoadingPlaylist ? (
          <div className="p-16 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-center">
            <Disc3 className="w-10 h-10 animate-spin mx-auto mb-3 text-emerald-400" />
            <p>Carregando playlist...</p>
          </div>
        ) : (
          <TrackList
            tracks={tracks}
            currentTrackIndex={currentTrackIndex}
            isPlaying={playbackStatus === "playing"}
            onPlayTrack={playTrack}
            onTogglePlayPause={togglePlay}
            onRemoveTrack={removeTrack}
            onRemoveMultipleTracks={removeMultipleTracks}
            onOpenSaveModal={() => setSaveModalOpen(true)}
            onOpenCreateModal={() => setCreateModalOpen(true)}
            shuffle={shuffle}
            onToggleShuffle={() => setShuffle((v) => !v)}
            onPlayShuffle={() => {
              setShuffle(true);
              if (tracks.length) playTrack(Math.floor(Math.random() * tracks.length));
            }}
            playlistName={playlistData?.nome_playlist}
            playlistCover={playlistData?.capa_playlist}
            playlistDescription={playlistData?.descricao}
            playlistNotice={playlistData?.aviso}
            isPrivate={playlistData?.isPrivate}
            autenticado={playlistData?.autenticado}
          />
        )}
      </main>

      <AudioPlayerBar
        currentTrack={currentTrack}
        playbackStatus={playbackStatus}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onTogglePlayPause={togglePlay}
        onPrevTrack={previousTrack}
        onNextTrack={nextTrack}
        onSeek={handleSeek}
        onVolumeChange={(v) => {
          setVolume(v);
          setIsMuted(v === 0);
          if (nativeModeRef.current) audioRef.current?.setVolume(v);
          else ytRef.current?.setVolume(v);
        }}
        onToggleMute={() => {
          if (isMuted) {
            const v = previousVolume || 50;
            setIsMuted(false);
            setVolume(v);
            if (nativeModeRef.current) audioRef.current?.setVolume(v);
            else ytRef.current?.setVolume(v);
          } else {
            setPreviousVolume(volume);
            setIsMuted(true);
            setVolume(0);
            if (nativeModeRef.current) audioRef.current?.setVolume(0);
            else ytRef.current?.setVolume(0);
          }
        }}
        onToggleShuffle={() => setShuffle((v) => !v)}
        onToggleRepeat={() => setRepeatMode((v) => (v === "off" ? "all" : v === "all" ? "one" : "off"))}
        onOpenNowPlaying={() => {}}
      />

      <BackgroundAudioPlayer
        ref={audioRef}
        volume={isMuted ? 0 : volume}
        isPlaying={playbackStatus === "playing"}
        onStatusChange={setPlaybackStatus}
        onTimeUpdate={(c, d) => {
          if (nativeModeRef.current) {
            setCurrentTime(c);
            if (d > 0) setDuration(d);
          }
        }}
        onEnded={nextTrack}
        onError={() => {
          nativeModeRef.current = false;
          nextTrack();
        }}
      />

      <YouTubeIFrameContainer
        ref={ytRef}
        currentVideoId={currentTrack?.videoId}
        volume={isMuted ? 0 : volume}
        onStatusChange={(s) => {
          if (!nativeModeRef.current) setPlaybackStatus(s);
        }}
        onTimeUpdate={(c, d) => {
          if (!nativeModeRef.current) {
            setCurrentTime(c);
            if (d > 0) setDuration(d);
          }
        }}
        onTrackEnded={nextTrack}
        onError={() => {
          if (!nativeModeRef.current) nextTrack();
        }}
      />

      <SavePlaylistModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        currentTracks={tracks}
        initialName={playlistData?.nome_playlist}
        initialDescription={playlistData?.descricao}
        initialCover={playlistData?.capa_playlist}
        onSavePlaylist={saveCloudPlaylist}
      />
      <CreatePlaylistModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreatePlaylist={saveCloudPlaylist}
      />
      <SpotifyAuthModal
        isOpen={spotifyAuthOpen}
        onClose={() => setSpotifyAuthOpen(false)}
        onLoginSuccess={handleSpotifyLoginSuccess}
        configStatus={configStatus}
      />
      <ConfigGuideModal isOpen={configOpen} onClose={() => setConfigOpen(false)} configStatus={configStatus} />
    </div>
  );
}
