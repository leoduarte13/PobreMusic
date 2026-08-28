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
import { 
  Track, 
  PlaylistData, 
  ConfigStatus, 
  PlaybackStatus, 
  SpotifyUser, 
  UserPlaylistSummary, 
  SavedPlaylist, 
  EqualizerState,
  GoogleUserProfile
} from "./types";
import { 
  signInWithGoogle,
  logoutGoogle,
  subscribeToAuth,
  checkRedirectAuthResult,
  formatAuthErrorMessage,
  saveUserPlaylistToCloud, 
  deleteUserPlaylistFromCloud, 
  subscribeToUserCloudPlaylists,
  saveUserSettingsToCloud 
} from "./lib/firebase";
import { fetchPlaylistSafe, resolveYouTubeVideoIdClient } from "./utils/clientMusicResolver";
import { AlertCircle, Disc3, Lock, LogIn } from "lucide-react";

export default function App() {
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  
  // Modals state
  const [isEqualizerModalOpen, setIsEqualizerModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddTrackModalOpen, setIsAddTrackModalOpen] = useState(false);
  const [isSpotifyNowPlayingOpen, setIsSpotifyNowPlayingOpen] = useState(false);
  const [isMobileDownloadOpen, setIsMobileDownloadOpen] = useState(false);
  const [isSpotifyAuthModalOpen, setIsSpotifyAuthModalOpen] = useState(false);

  // Mini Player Mode state
  const [isMiniPlayerMode, setIsMiniPlayerMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("spottube_mini_player_mode") === "true";
    } catch {
      return false;
    }
  });

  // PWA Install state
  const [pwaPromptEvent, setPwaPromptEvent] = useState<any>(null);
  const [canInstallPWA, setCanInstallPWA] = useState(false);

  // Equalizer state
  const [eqState, setEqState] = useState<EqualizerState>(() => {
    try {
      const saved = localStorage.getItem("spottube_equalizer_settings");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Could not load saved equalizer settings", e);
    }
    return {
      enabled: false,
      preset: "flat",
      bands: [0, 0, 0, 0, 0, 0, 0],
      bassBoost: 0,
      surround: false,
    };
  });

  // Google Auth State
  const [googleUser, setGoogleUser] = useState<GoogleUserProfile | null>(null);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<{
    title: string;
    message: string;
    isDomainError: boolean;
    currentDomain: string;
  } | null>(null);

  // Saved Playlists state
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>(() => {
    try {
      const saved = localStorage.getItem("spottube_saved_playlists");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Could not load saved playlists from localStorage", e);
    }
    return [];
  });

  // Listen to Google Auth state and check redirect results on mobile mount
  useEffect(() => {
    // Check if user just returned from a mobile redirect login
    checkRedirectAuthResult()
      .then((redirectUser) => {
        if (redirectUser) {
          setGoogleUser(redirectUser);
        }
      })
      .catch((err) => {
        console.warn("Google Redirect Auth notice:", err);
      });

    const unsubscribe = subscribeToAuth((user) => {
      setGoogleUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Cloud Firestore Playlists per authenticated user
  useEffect(() => {
    if (googleUser?.uid) {
      const unsubscribe = subscribeToUserCloudPlaylists(googleUser.uid, (cloudList) => {
        if (cloudList) {
          setSavedPlaylists(cloudList);
          try {
            localStorage.setItem(`spottube_saved_playlists_${googleUser.uid}`, JSON.stringify(cloudList));
          } catch {}
        }
      });
      return () => unsubscribe();
    } else {
      // Unauthenticated fallback to local state
      try {
        const saved = localStorage.getItem("spottube_saved_playlists");
        if (saved) {
          setSavedPlaylists(JSON.parse(saved));
        } else {
          setSavedPlaylists([]);
        }
      } catch {}
    }
  }, [googleUser]);

  // Auth State (Spotify)
  const [spotifyUser, setSpotifyUser] = useState<SpotifyUser | null>(null);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylistSummary[]>([]);
  const [isLoadingUserPlaylists, setIsLoadingUserPlaylists] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Playlist State
  const [playlistData, setPlaylistData] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [needsAuthNotice, setNeedsAuthNotice] = useState(false);

  // Playback State
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("unstarted");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [prevVolume, setPrevVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("all");

  const ytPlayerRef = useRef<YouTubePlayerRef>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Toggle Mini Player Mode
  const toggleMiniPlayer = useCallback(() => {
    setIsMiniPlayerMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("spottube_mini_player_mode", String(next));
      } catch {}
      return next;
    });
  }, []);

  // Listen for PWA beforeinstallprompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPwaPromptEvent(e);
      setCanInstallPWA(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleTriggerPWAInstall = async () => {
    if (!pwaPromptEvent) return;
    pwaPromptEvent.prompt();
    const { outcome } = await pwaPromptEvent.userChoice;
    if (outcome === "accepted") {
      setCanInstallPWA(false);
      setPwaPromptEvent(null);
    }
  };

  // Google Login / Logout Handlers
  const handleLoginGoogle = async () => {
    setIsGoogleLoggingIn(true);
    setGoogleAuthError(null);
    try {
      const user = await signInWithGoogle();
      setGoogleUser(user);
    } catch (err: any) {
      console.warn("Google login notice:", err);
      // Only show error modal if it wasn't a standard user cancellation
      const errCode = err?.code || "";
      if (errCode !== "auth/popup-closed-by-user" && errCode !== "auth/cancelled-popup-request") {
        const formatted = formatAuthErrorMessage(err);
        setGoogleAuthError(formatted);
      }
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  const handleLogoutGoogle = async () => {
    try {
      await logoutGoogle();
      setGoogleUser(null);
    } catch (err) {
      console.warn("Google logout error:", err);
    }
  };

  // Persist Equalizer settings & sync to cloud
  const handleUpdateEqState = (newState: EqualizerState) => {
    setEqState(newState);
    try {
      localStorage.setItem("spottube_equalizer_settings", JSON.stringify(newState));
    } catch (e) {
      console.warn("Could not persist equalizer settings", e);
    }
    if (googleUser?.uid) {
      saveUserSettingsToCloud(googleUser.uid, { equalizer: newState });
    }
  };

  // Persist Saved Playlists locally and in Firestore Cloud
  const persistSavedPlaylists = (updated: SavedPlaylist[]) => {
    setSavedPlaylists(updated);
    try {
      const storageKey = googleUser?.uid ? `spottube_saved_playlists_${googleUser.uid}` : "spottube_saved_playlists";
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not persist saved playlists", e);
    }
  };

  const handleSavePlaylist = async (newPlaylist: SavedPlaylist) => {
    const playlistWithCloud: SavedPlaylist = { 
      ...newPlaylist, 
      userId: googleUser?.uid,
      isCloud: !!googleUser?.uid, 
      updatedAt: Date.now() 
    };
    const existingIdx = savedPlaylists.findIndex((p) => p.id === playlistWithCloud.id || p.name === playlistWithCloud.name);
    let updated: SavedPlaylist[];
    if (existingIdx >= 0) {
      updated = [...savedPlaylists];
      updated[existingIdx] = playlistWithCloud;
    } else {
      updated = [playlistWithCloud, ...savedPlaylists];
    }
    persistSavedPlaylists(updated);

    // Sync with Cloud Firestore if authenticated
    if (googleUser?.uid) {
      try {
        await saveUserPlaylistToCloud(googleUser.uid, playlistWithCloud);
      } catch (err) {
        console.warn("Could not sync playlist to cloud Firestore:", err);
      }
    }
  };

  const handleCreatePlaylist = async (newPlaylist: SavedPlaylist) => {
    const playlistWithCloud: SavedPlaylist = { 
      ...newPlaylist, 
      userId: googleUser?.uid,
      isCloud: !!googleUser?.uid, 
      updatedAt: Date.now() 
    };
    persistSavedPlaylists([playlistWithCloud, ...savedPlaylists]);
    
    // Sync to Cloud Firestore if logged in
    if (googleUser?.uid) {
      try {
        await saveUserPlaylistToCloud(googleUser.uid, playlistWithCloud);
      } catch (err) {
        console.warn("Could not sync created playlist to cloud:", err);
      }
    }

    // Set as active playlist in view
    setPlaylistData({
      sucesso: true,
      playlist_id: playlistWithCloud.id,
      nome_playlist: playlistWithCloud.name,
      descricao: playlistWithCloud.description || "Playlist personalizada criada no POBREMUSIC",
      capa_playlist: playlistWithCloud.cover,
      total_faixas: playlistWithCloud.tracks.length,
      faixas: playlistWithCloud.tracks,
    });
    setTracks(playlistWithCloud.tracks);
    setCurrentTrackIndex(playlistWithCloud.tracks.length > 0 ? 0 : null);
  };

  const handleDeleteSavedPlaylist = async (id: string) => {
    const updated = savedPlaylists.filter((p) => p.id !== id);
    persistSavedPlaylists(updated);

    // Delete from Firestore Cloud if user is authenticated
    if (googleUser?.uid) {
      try {
        await deleteUserPlaylistFromCloud(googleUser.uid, id);
      } catch (err) {
        console.warn("Could not delete playlist from cloud Firestore:", err);
      }
    }
  };

  const handleSelectSavedPlaylist = (playlist: SavedPlaylist) => {
    setPlaylistData({
      sucesso: true,
      playlist_id: playlist.id,
      nome_playlist: playlist.name,
      descricao: playlist.description || "Playlist salva na nuvem",
      capa_playlist: playlist.cover,
      total_faixas: playlist.tracks.length,
      faixas: playlist.tracks,
    });
    setTracks(playlist.tracks);
    setCurrentTrackIndex(playlist.tracks.length > 0 ? 0 : null);
  };

  // Add a single track to the current playlist and sync with Cloud
  const handleAddTrack = (newTrack: Track) => {
    setTracks((prev) => {
      const updated = [...prev, newTrack];
      
      // If currently displaying a saved playlist, sync with Firestore Cloud
      if (playlistData?.playlist_id) {
        const matchingSaved = savedPlaylists.find((p) => p.id === playlistData.playlist_id);
        if (matchingSaved) {
          const updatedSaved = { ...matchingSaved, tracks: updated, updatedAt: Date.now() };
          handleSavePlaylist(updatedSaved);
        }
      }

      // If no track is currently selected, select the added track
      if (currentTrackIndex === null) {
        setCurrentTrackIndex(0);
      }
      return updated;
    });
  };

  // Add multiple tracks to the current playlist and sync with Cloud
  const handleAddMultipleTracks = (newTracksToAdd: Track[]) => {
    if (newTracksToAdd.length === 0) return;
    setTracks((prev) => {
      const updated = [...prev, ...newTracksToAdd];
      
      // If currently displaying a saved playlist, sync with Firestore Cloud
      if (playlistData?.playlist_id) {
        const matchingSaved = savedPlaylists.find((p) => p.id === playlistData.playlist_id);
        if (matchingSaved) {
          const updatedSaved = { ...matchingSaved, tracks: updated, updatedAt: Date.now() };
          handleSavePlaylist(updatedSaved);
        }
      }

      if (currentTrackIndex === null && updated.length > 0) {
        setCurrentTrackIndex(0);
      }
      return updated;
    });
  };

  // Excluir música da playlist atual
  const handleRemoveTrack = (indexToRemove: number) => {
    setTracks((prevTracks) => {
      const updated = prevTracks.filter((_, idx) => idx !== indexToRemove);
      
      // Sync with cloud if saved playlist
      if (playlistData?.playlist_id) {
        const matchingSaved = savedPlaylists.find((p) => p.id === playlistData.playlist_id);
        if (matchingSaved) {
          const updatedSaved = { ...matchingSaved, tracks: updated, updatedAt: Date.now() };
          handleSavePlaylist(updatedSaved);
        }
      }

      // Adjust current playing track index accordingly
      if (currentTrackIndex !== null) {
        if (currentTrackIndex === indexToRemove) {
          if (updated.length === 0) {
            setCurrentTrackIndex(null);
            ytPlayerRef.current?.pause();
          } else {
            const nextIndex = indexToRemove < updated.length ? indexToRemove : 0;
            setCurrentTrackIndex(nextIndex);
            playTrack(nextIndex);
          }
        } else if (currentTrackIndex > indexToRemove) {
          setCurrentTrackIndex(currentTrackIndex - 1);
        }
      }
      return updated;
    });
  };

  // Bulk remove multiple tracks from current playlist
  const handleRemoveMultipleTracks = (indexesToRemove: number[]) => {
    const removeSet = new Set(indexesToRemove);
    setTracks((prevTracks) => {
      const updated = prevTracks.filter((_, idx) => !removeSet.has(idx));
      
      if (playlistData?.playlist_id) {
        const matchingSaved = savedPlaylists.find((p) => p.id === playlistData.playlist_id);
        if (matchingSaved) {
          const updatedSaved = { ...matchingSaved, tracks: updated, updatedAt: Date.now() };
          handleSavePlaylist(updatedSaved);
        }
      }

      if (currentTrackIndex !== null && removeSet.has(currentTrackIndex)) {
        if (updated.length === 0) {
          setCurrentTrackIndex(null);
          ytPlayerRef.current?.pause();
        } else {
          setCurrentTrackIndex(0);
          playTrack(0);
        }
      }
      return updated;
    });
  };

  // Load config status on mount
  useEffect(() => {
    fetch("/api/config-status")
      .then((res) => res.json())
      .then((data) => setConfigStatus(data))
      .catch((err) => console.warn("Could not check config status:", err));
  }, []);

  // Fetch User's Playlists
  const fetchUserPlaylists = useCallback(async () => {
    setIsLoadingUserPlaylists(true);
    try {
      const token = localStorage.getItem("spotifyTokenManual") || localStorage.getItem("spotifyTokenManuaL");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/my-playlists", {
        method: "GET",
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        setUserPlaylists(data.playlists || []);
      } else {
        if (res.status === 401) {
          localStorage.removeItem("spotifyTokenManual");
          localStorage.removeItem("spotifyTokenManuaL");
          setSpotifyUser(null);
        }
      }
    } catch (err) {
      console.warn("Could not fetch user playlists:", err);
    } finally {
      setIsLoadingUserPlaylists(false);
    }
  }, []);

  // Check Current Spotify Auth Status
  const checkAuthStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("spotifyTokenManual") || localStorage.getItem("spotifyTokenManuaL");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/auth/me", {
        method: "GET",
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setSpotifyUser(data.user);
          fetchUserPlaylists();
        } else {
          setSpotifyUser(null);
          setUserPlaylists([]);
          if (data.expired) {
            localStorage.removeItem("spotifyTokenManual");
            localStorage.removeItem("spotifyTokenManuaL");
          }
        }
      }
    } catch (err) {
      console.warn("Error checking auth status:", err);
    }
  }, [fetchUserPlaylists]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Handle Spotify Connect (Opens comprehensive Spotify Auth Modal)
  const handleLoginSpotify = () => {
    setIsSpotifyAuthModalOpen(true);
  };

  const handleSpotifyLoginSuccess = (user: SpotifyUser) => {
    setSpotifyUser(user);
    setIsLoggingIn(false);
    fetchUserPlaylists();
    setNeedsAuthNotice(false);
  };

  // Handle Spotify Logout
  const handleLogoutSpotify = async () => {
    localStorage.removeItem("spotifyTokenManual");
    localStorage.removeItem("spotifyTokenManuaL");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      setSpotifyUser(null);
      setUserPlaylists([]);
    }
  };

  // Fetch Spotify Playlist via resilient fetcher (Server API with Client Fallback)
  const loadPlaylist = async (urlOrId: string) => {
    setIsLoadingPlaylist(true);
    setPlaylistError(null);
    setNeedsAuthNotice(false);

    try {
      const token = localStorage.getItem("spotifyTokenManual") || localStorage.getItem("spotifyTokenManuaL");
      const { data, needsAuth } = await fetchPlaylistSafe(urlOrId, token);

      if (needsAuth) {
        setNeedsAuthNotice(true);
      }

      if (!data || !data.sucesso || !data.faixas || data.faixas.length === 0) {
        throw new Error("Não foi possível carregar as faixas desta playlist. Verifique se o link está correto ou conecte sua conta Spotify.");
      }

      setPlaylistData(data);
      setTracks(data.faixas || []);

      // If tracks found and nothing currently playing, select first track
      if (data.faixas && data.faixas.length > 0) {
        setCurrentTrackIndex(0);
      }
    } catch (err: any) {
      console.error("Error loading playlist:", err);
      const displayMsg = typeof err === "string" ? err : err?.message || "Erro ao conectar com a API do Spotify";
      setPlaylistError(displayMsg);
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  // Initial load with default preset
  useEffect(() => {
    loadPlaylist("top_hits");
  }, []);

  // Resolve YouTube video ID for a specific track and start playback
  const playTrack = useCallback(async (index: number) => {
    if (index < 0 || index >= tracks.length) return;

    setCurrentTrackIndex(index);
    const targetTrack = tracks[index];

    // If we already have the YouTube videoId, load and play it immediately
    if (targetTrack.videoId) {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.loadVideo(targetTrack.videoId);
        ytPlayerRef.current.play();
      }
      return;
    }

    // Otherwise, fetch videoId via resilient resolver
    setTracks((prev) =>
      prev.map((t, idx) => (idx === index ? { ...t, isLoadingVideo: true } : t))
    );

    try {
      const resolvedVideoId = await resolveYouTubeVideoIdClient(
        targetTrack.nome_musica,
        targetTrack.nome_artista,
        targetTrack.videoId
      );

      if (resolvedVideoId) {
        setTracks((prev) =>
          prev.map((t, idx) =>
            idx === index
              ? { ...t, videoId: resolvedVideoId, isLoadingVideo: false }
              : t
          )
        );

        if (ytPlayerRef.current) {
          ytPlayerRef.current.loadVideo(resolvedVideoId);
          ytPlayerRef.current.play();
        }
      } else {
        throw new Error("Vídeo não encontrado");
      }
    } catch (err) {
      console.error("Error searching track on YouTube:", err);
      setTracks((prev) =>
        prev.map((t, idx) =>
          idx === index ? { ...t, isLoadingVideo: false, hasError: true } : t
        )
      );
    }
  }, [tracks]);

  // Ao terminar uma musica ja tocar a outra (Auto-play next track)
  const handleNextTrack = useCallback(() => {
    if (tracks.length === 0 || currentTrackIndex === null) return;

    if (repeatMode === "one") {
      playTrack(currentTrackIndex);
      return;
    }

    if (shuffle) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      playTrack(randomIndex);
      return;
    }

    const nextIndex = currentTrackIndex + 1;
    if (nextIndex < tracks.length) {
      playTrack(nextIndex);
    } else if (repeatMode === "all") {
      playTrack(0);
    }
  }, [tracks, currentTrackIndex, repeatMode, shuffle, playTrack]);

  // Prev Track Logic
  const handlePrevTrack = useCallback(() => {
    if (tracks.length === 0 || currentTrackIndex === null) return;

    if (currentTime > 3) {
      ytPlayerRef.current?.seekTo(0);
      return;
    }

    const prevIndex = currentTrackIndex - 1;
    if (prevIndex >= 0) {
      playTrack(prevIndex);
    } else {
      playTrack(tracks.length - 1);
    }
  }, [tracks, currentTrackIndex, currentTime, playTrack]);

  // Toggle Play / Pause
  const handleTogglePlayPause = useCallback(() => {
    if (currentTrackIndex === null && tracks.length > 0) {
      playTrack(0);
      return;
    }

    const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null;
    if (!currentTrack?.videoId) {
      if (currentTrackIndex !== null) {
        playTrack(currentTrackIndex);
      }
      return;
    }

    if (playbackStatus === "playing") {
      ytPlayerRef.current?.pause();
    } else {
      ytPlayerRef.current?.play();
    }
  }, [currentTrackIndex, tracks, playbackStatus, playTrack]);

  // Seek
  const handleSeek = useCallback((seconds: number) => {
    ytPlayerRef.current?.seekTo(seconds);
    setCurrentTime(seconds);
  }, []);

  // Volume
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (isMuted && newVol > 0) setIsMuted(false);
    ytPlayerRef.current?.setVolume(newVol);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(prevVolume || 50);
      ytPlayerRef.current?.setVolume(prevVolume || 50);
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
      setVolume(0);
      ytPlayerRef.current?.setVolume(0);
    }
  };

  // Toggle Repeat Mode
  const handleToggleRepeat = () => {
    setRepeatMode((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
  };

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] || null : null;

  // Background Audio Keep-Alive via inaudible audio loop (keeps OS media keys, background tabs & lock screen active)
  useEffect(() => {
    const audio = new Audio();
    // 1-second inaudible WAV
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audio.loop = true;
    audio.volume = 0.001;
    silentAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    if (playbackStatus === "playing") {
      silentAudioRef.current?.play().catch(() => {});
    } else {
      silentAudioRef.current?.pause();
    }
  }, [playbackStatus]);

  // MediaSession API Integration (Official Music Player Lock Screen & OS Media Keys)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.nome_musica,
        artist: currentTrack.nome_artista,
        album: currentTrack.album || playlistData?.nome_playlist || 'POBREMUSIC',
        artwork: [
          { src: currentTrack.capa || '/icon.png', sizes: '512x512', type: 'image/jpeg' },
          { src: currentTrack.capa || '/icon.png', sizes: '256x256', type: 'image/jpeg' },
          { src: currentTrack.capa || '/icon.png', sizes: '128x128', type: 'image/jpeg' },
          { src: currentTrack.capa || '/icon.png', sizes: '96x96', type: 'image/jpeg' },
        ],
      });
    }

    navigator.mediaSession.playbackState = playbackStatus === 'playing' ? 'playing' : 'paused';

    try {
      navigator.mediaSession.setActionHandler('play', () => handleTogglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => handleTogglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => handlePrevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => handleNextTrack());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) handleSeek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skip = details.seekOffset || 10;
        handleSeek(Math.max(currentTime - skip, 0));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skip = details.seekOffset || 10;
        handleSeek(Math.min(currentTime + skip, duration));
      });
    } catch (err) {
      console.warn("MediaSession action handler error:", err);
    }
  }, [
    currentTrack, 
    playbackStatus, 
    playlistData, 
    currentTime, 
    duration, 
    handleTogglePlayPause, 
    handlePrevTrack, 
    handleNextTrack, 
    handleSeek
  ]);

  // Update MediaSession Position State
  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration || duration <= 0) return;
    try {
      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(duration, 0),
          playbackRate: 1,
          position: Math.min(Math.max(currentTime, 0), duration),
        });
      }
    } catch (e) {}
  }, [currentTime, duration]);

  // Dynamic Browser Tab Title
  useEffect(() => {
    if (currentTrack) {
      const icon = playbackStatus === 'playing' ? '▶' : '⏸';
      document.title = `${icon} ${currentTrack.nome_musica} • ${currentTrack.nome_artista} | POBREMUSIC`;
    } else {
      document.title = 'POBREMUSIC - Player de Música Gratuito';
    }
  }, [currentTrack, playbackStatus]);

  // Keyboard Shortcuts (M for mini player, Space for play/pause, Ctrl+Arrows for next/prev)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMiniPlayer();
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlayPause();
      } else if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleNextTrack();
      } else if (e.key === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlePrevTrack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMiniPlayer, handleTogglePlayPause, handleNextTrack, handlePrevTrack]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      
      {/* Mini Player Mode View */}
      {isMiniPlayerMode ? (
        <MiniPlayer
          currentTrack={currentTrack}
          tracks={tracks}
          currentTrackIndex={currentTrackIndex}
          playbackStatus={playbackStatus}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          shuffle={shuffle}
          repeatMode={repeatMode}
          onTogglePlayPause={handleTogglePlayPause}
          onPrevTrack={handlePrevTrack}
          onNextTrack={handleNextTrack}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onToggleShuffle={() => setShuffle((prev) => !prev)}
          onToggleRepeat={handleToggleRepeat}
          onPlayTrack={playTrack}
          onToggleMiniPlayer={toggleMiniPlayer}
          onOpenEqualizer={() => setIsEqualizerModalOpen(true)}
          isEqActive={eqState.enabled}
          playlistName={playlistData?.nome_playlist}
        />
      ) : (
        /* Full Application View */
        <div className="flex flex-col flex-1 pb-20 sm:pb-24">
          {/* Top Navbar */}
          <Navbar
            configStatus={configStatus}
            spotifyUser={spotifyUser}
            isLoggingIn={isLoggingIn}
            onLoginSpotify={handleLoginSpotify}
            onLogoutSpotify={handleLogoutSpotify}
            googleUser={googleUser}
            isGoogleLoggingIn={isGoogleLoggingIn}
            onLoginGoogle={handleLoginGoogle}
            onLogoutGoogle={handleLogoutGoogle}
            onOpenConfigModal={() => setIsConfigModalOpen(true)}
            onToggleMiniPlayer={toggleMiniPlayer}
            onOpenEqualizerModal={() => setIsEqualizerModalOpen(true)}
            onOpenMobileDownload={() => setIsMobileDownloadOpen(true)}
          />

          {/* Main Content */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-3 sm:space-y-6">
            
            {/* Playlist Input & Tabbed Presets / My Playlists / Saved */}
            <PlaylistInput
              onLoadPlaylist={loadPlaylist}
              isLoading={isLoadingPlaylist}
              currentPlaylistId={playlistData?.playlist_id}
              spotifyUser={spotifyUser}
              userPlaylists={userPlaylists}
              isLoadingUserPlaylists={isLoadingUserPlaylists}
              onLoginSpotify={handleLoginSpotify}
              onRefreshUserPlaylists={fetchUserPlaylists}
              googleUser={googleUser}
              onLoginGoogle={handleLoginGoogle}
              savedPlaylists={savedPlaylists}
              onSelectSavedPlaylist={handleSelectSavedPlaylist}
              onDeleteSavedPlaylist={handleDeleteSavedPlaylist}
              onOpenCreateModal={() => setIsCreateModalOpen(true)}
            />

            {/* Private Playlist Auth Required Notice */}
            {needsAuthNotice && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-950/60 via-zinc-900 to-zinc-950 border border-amber-500/40 text-amber-200 text-xs sm:text-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Esta playlist é privada ou restrita</p>
                    <p className="text-xs text-zinc-300 mt-0.5">
                      Conecte sua conta do Spotify com o escopo <code className="text-amber-300">playlist-read-private</code> para autorizar a leitura desta playlist.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLoginSpotify}
                  disabled={isLoggingIn}
                  className="px-4 py-2 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-zinc-950 font-bold text-xs flex items-center gap-2 shrink-0 shadow-md"
                >
                  <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isLoggingIn ? "Conectando..." : "Conectar com Spotify"}</span>
                </button>
              </div>
            )}

            {/* Error Alert */}
            {playlistError && !needsAuthNotice && (
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <span>{playlistError}</span>
                </div>
                <button
                  onClick={() => setIsConfigModalOpen(true)}
                  className="text-xs underline font-semibold text-white hover:text-red-200 shrink-0"
                >
                  Ver Instruções
                </button>
              </div>
            )}

            {/* Track List Section */}
            {isLoadingPlaylist ? (
              <div className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-16 text-center">
                <Disc3 className="w-12 h-12 text-emerald-400 animate-spin mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white">Extraindo Faixas do Spotify...</h3>
                <p className="text-xs text-zinc-400 mt-1">Consultando API do Spotify e estruturando dados em JSON</p>
              </div>
            ) : (
              <TrackList
                tracks={tracks}
                currentTrackIndex={currentTrackIndex}
                isPlaying={playbackStatus === "playing"}
                onPlayTrack={playTrack}
                onTogglePlayPause={handleTogglePlayPause}
                onRemoveTrack={handleRemoveTrack}
                onRemoveMultipleTracks={handleRemoveMultipleTracks}
                onOpenSaveModal={() => setIsSaveModalOpen(true)}
                onOpenCreateModal={() => setIsCreateModalOpen(true)}
                onOpenAddTrackModal={() => setIsAddTrackModalOpen(true)}
                onOpenEqualizerModal={() => setIsEqualizerModalOpen(true)}
                onOpenMobileDownload={() => setIsMobileDownloadOpen(true)}
                onOpenNowPlaying={() => setIsSpotifyNowPlayingOpen(true)}
                shuffle={shuffle}
                onToggleShuffle={() => setShuffle((prev) => !prev)}
                onPlayShuffle={() => {
                  setShuffle(true);
                  if (tracks.length > 0) {
                    const randomIndex = Math.floor(Math.random() * tracks.length);
                    playTrack(randomIndex);
                  }
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

          {/* Persistent Bottom Audio Player Bar */}
          <AudioPlayerBar
            currentTrack={currentTrack}
            playbackStatus={playbackStatus}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            isMuted={isMuted}
            shuffle={shuffle}
            repeatMode={repeatMode}
            onTogglePlayPause={handleTogglePlayPause}
            onPrevTrack={handlePrevTrack}
            onNextTrack={handleNextTrack}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            onToggleMute={handleToggleMute}
            onToggleShuffle={() => setShuffle((prev) => !prev)}
            onToggleRepeat={handleToggleRepeat}
            onOpenEqualizer={() => setIsEqualizerModalOpen(true)}
            isEqActive={eqState.enabled}
            onOpenMobileDownload={() => setIsMobileDownloadOpen(true)}
            onToggleMiniPlayer={toggleMiniPlayer}
            onOpenNowPlaying={() => setIsSpotifyNowPlayingOpen(true)}
          />
        </div>
      )}

      {/* Spotify-style Fullscreen Now Playing Drawer / View */}
      <SpotifyNowPlayingView
        isOpen={isSpotifyNowPlayingOpen}
        onClose={() => setIsSpotifyNowPlayingOpen(false)}
        currentTrack={currentTrack}
        tracks={tracks}
        currentTrackIndex={currentTrackIndex}
        playbackStatus={playbackStatus}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        isMuted={isMuted}
        shuffle={shuffle}
        repeatMode={repeatMode}
        onTogglePlayPause={handleTogglePlayPause}
        onPrevTrack={handlePrevTrack}
        onNextTrack={handleNextTrack}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onToggleShuffle={() => setShuffle((prev) => !prev)}
        onToggleRepeat={handleToggleRepeat}
        onPlayTrack={playTrack}
        onOpenEqualizer={() => setIsEqualizerModalOpen(true)}
        isEqActive={eqState.enabled}
        playlistName={playlistData?.nome_playlist}
      />

      {/* Add Track Search & Select Modal */}
      <AddTrackModal
        isOpen={isAddTrackModalOpen}
        onClose={() => setIsAddTrackModalOpen(false)}
        onAddTrack={handleAddTrack}
        onAddMultipleTracks={handleAddMultipleTracks}
        existingTracksCount={tracks.length}
      />

      {/* YouTube IFrame Player (Stays mounted continuously to ensure uninterrupted background audio) */}
      <YouTubeIFrameContainer
        ref={ytPlayerRef}
        currentVideoId={currentTrack?.videoId}
        volume={isMuted ? 0 : volume}
        onStatusChange={(status) => setPlaybackStatus(status)}
        onTimeUpdate={(curr, tot) => {
          setCurrentTime(curr);
          if (tot > 0) setDuration(tot);
        }}
        onTrackEnded={handleNextTrack}
        onError={(errCode) => {
          console.warn("YouTube player error:", errCode);
          handleNextTrack();
        }}
      />

      {/* Equalizer Modal */}
      <EqualizerModal
        isOpen={isEqualizerModalOpen}
        onClose={() => setIsEqualizerModalOpen(false)}
        eqState={eqState}
        onUpdateEqState={handleUpdateEqState}
        isPlaying={playbackStatus === "playing"}
      />

      {/* Save Playlist Modal */}
      <SavePlaylistModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentTracks={tracks}
        initialName={playlistData?.nome_playlist}
        initialDescription={playlistData?.descricao}
        initialCover={playlistData?.capa_playlist}
        onSavePlaylist={handleSavePlaylist}
      />

      {/* Create Playlist Modal */}
      <CreatePlaylistModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreatePlaylist={handleCreatePlaylist}
      />

      {/* Mobile Download & PWA Modal */}
      <MobileDownloadModal
        isOpen={isMobileDownloadOpen}
        onClose={() => setIsMobileDownloadOpen(false)}
        tracks={tracks}
        playlistName={playlistData?.nome_playlist}
        onTriggerPWAInstall={handleTriggerPWAInstall}
        canInstallPWA={canInstallPWA}
      />

      {/* Spotify Auth & Connection Modal */}
      <SpotifyAuthModal
        isOpen={isSpotifyAuthModalOpen}
        onClose={() => setIsSpotifyAuthModalOpen(false)}
        onLoginSuccess={handleSpotifyLoginSuccess}
        configStatus={configStatus}
      />

      {/* Config Guide & API Documentation Modal */}
      <ConfigGuideModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        configStatus={configStatus}
      />

      {/* Google Auth Error Modal (Explains domain authorization, popup permissions, etc.) */}
      <GoogleAuthErrorModal
        isOpen={!!googleAuthError}
        onClose={() => setGoogleAuthError(null)}
        errorInfo={googleAuthError}
        onRetry={handleLoginGoogle}
      />
    </div>
  );
}
