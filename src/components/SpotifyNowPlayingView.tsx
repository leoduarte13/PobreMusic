import React, { useState, useEffect } from "react";
import { 
  ChevronDown, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  Heart, 
  Sliders, 
  ListMusic, 
  Volume2, 
  VolumeX, 
  Volume1, 
  Share2, 
  MoreVertical, 
  Plus, 
  Sparkles, 
  Music, 
  Youtube, 
  Radio, 
  Disc3,
  Waves,
  Check
} from "lucide-react";
import { Track, PlaybackStatus } from "../types";
import { Visualizer } from "./Visualizer";

interface SpotifyNowPlayingViewProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: Track | null;
  tracks: Track[];
  currentTrackIndex: number | null;
  playbackStatus: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
  playlistName?: string;
  onTogglePlayPause: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onPlayTrack: (index: number) => void;
  onOpenEqualizer?: () => void;
  onOpenAddModal?: () => void;
  isEqActive?: boolean;
}

export const SpotifyNowPlayingView: React.FC<SpotifyNowPlayingViewProps> = ({
  isOpen,
  onClose,
  currentTrack,
  tracks,
  currentTrackIndex,
  playbackStatus,
  currentTime,
  duration,
  volume,
  isMuted,
  shuffle,
  repeatMode,
  playlistName,
  onTogglePlayPause,
  onPrevTrack,
  onNextTrack,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onPlayTrack,
  onOpenEqualizer,
  onOpenAddModal,
  isEqActive,
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [viewMode, setViewMode] = useState<"cover" | "visualizer" | "queue">("cover");
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Sync liked state from localStorage or cloud
  useEffect(() => {
    if (!currentTrack) return;
    try {
      const savedFavorites = localStorage.getItem("spottube_liked_tracks");
      if (savedFavorites) {
        const likedList: string[] = JSON.parse(savedFavorites);
        const trackKey = `${currentTrack.nome_musica}-${currentTrack.nome_artista}`;
        setIsLiked(likedList.includes(trackKey));
      }
    } catch {}
  }, [currentTrack]);

  const toggleFavorite = () => {
    if (!currentTrack) return;
    try {
      const trackKey = `${currentTrack.nome_musica}-${currentTrack.nome_artista}`;
      const savedFavorites = localStorage.getItem("spottube_liked_tracks");
      let likedList: string[] = savedFavorites ? JSON.parse(savedFavorites) : [];
      if (likedList.includes(trackKey)) {
        likedList = likedList.filter((k) => k !== trackKey);
        setIsLiked(false);
      } else {
        likedList.push(trackKey);
        setIsLiked(true);
      }
      localStorage.setItem("spottube_liked_tracks", JSON.stringify(likedList));
    } catch {}
  };

  const handleShare = async () => {
    if (!currentTrack) return;
    const shareData = {
      title: `${currentTrack.nome_musica} - ${currentTrack.nome_artista}`,
      text: `Ouvindo ${currentTrack.nome_musica} no POBREMUSIC!`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch {}
    }
  };

  if (!isOpen || !currentTrack) return null;

  const isPlaying = playbackStatus === "playing";
  const progressPercent = duration > 0 ? ((isSeeking ? seekValue : currentTime) / duration) * 100 : 0;

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const formatRemainingTime = (current: number, total: number) => {
    if (isNaN(total) || total <= 0) return "-0:00";
    const remaining = Math.max(0, total - current);
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    return `-${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-2xl text-white transition-all duration-300 animate-slideUp overflow-hidden select-none">
      
      {/* Dynamic Ambient Glow Behind Cover */}
      <div 
        className="absolute inset-0 opacity-25 pointer-events-none filter blur-3xl scale-125 transition-all duration-1000"
        style={{
          backgroundImage: currentTrack.capa ? `url(${currentTrack.capa})` : "none",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-zinc-950/80 to-zinc-950 pointer-events-none" />

      {/* Top Bar Header */}
      <header className="relative z-10 w-full max-w-lg mx-auto px-4 pt-3 sm:pt-4 pb-2 flex items-center justify-between">
        <button
          onClick={onClose}
          className="p-2.5 -ml-2 rounded-full hover:bg-white/10 active:scale-95 transition-all text-zinc-300 hover:text-white"
          title="Minimizar (Descer)"
          aria-label="Minimizar visualização"
        >
          <ChevronDown className="w-6 h-6 stroke-[2.5]" />
        </button>

        <div className="text-center min-w-0 flex-1 px-2">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-zinc-400">
            Tocando da Playlist
          </p>
          <p className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
            {playlistName || "Playlist SpotTube"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleShare}
            className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-all"
            title="Compartilhar Música"
          >
            {copyFeedback ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Center Stage */}
      <main className="relative z-10 flex-1 w-full max-w-md mx-auto px-6 py-2 sm:py-4 flex flex-col justify-between overflow-y-auto no-scrollbar">
        
        {/* Cover Artwork or Visualizer Mode */}
        <div className="w-full aspect-square max-w-[340px] sm:max-w-[380px] mx-auto relative my-auto">
          {viewMode === "cover" ? (
            <div 
              onClick={() => setViewMode("visualizer")}
              className="group relative w-full h-full rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 cursor-pointer transition-all duration-300 transform active:scale-98"
              title="Clique para alternar para o visualizador de áudio"
            >
              {currentTrack.capa ? (
                <img
                  src={currentTrack.capa}
                  alt={currentTrack.nome_musica}
                  className="w-full h-full object-cover shadow-2xl transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-zinc-600">
                  <Disc3 className="w-24 h-24 text-emerald-500 animate-spin" />
                </div>
              )}

              {/* Hover/Tap Overlay Info */}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                <span className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-black/60 text-white border border-white/20 shadow-lg">
                  <Waves className="w-4 h-4 text-emerald-400" /> Ver Equalizador Visual
                </span>
              </div>
            </div>
          ) : viewMode === "visualizer" ? (
            /* Visualizer Canvas Mode */
            <div 
              onClick={() => setViewMode("cover")}
              className="w-full h-full rounded-2xl bg-zinc-900/90 border border-emerald-500/30 p-6 flex flex-col items-center justify-center gap-6 shadow-2xl cursor-pointer relative"
              title="Clique para voltar para a capa do álbum"
            >
              <div className="text-center space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold flex items-center justify-center gap-1">
                  <Waves className="w-3.5 h-3.5 animate-pulse" /> Áudio em Tempo Real
                </span>
                <p className="text-xs text-zinc-400">YouTube Audio Stream Ativo</p>
              </div>

              {/* Animated visualizer spectrum */}
              <div className="w-full flex items-end justify-center gap-1.5 h-32 px-4">
                {[12, 28, 45, 75, 95, 60, 85, 100, 70, 90, 45, 80, 65, 30, 50, 85, 40].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-emerald-500 to-teal-300 rounded-t-sm transition-all duration-150"
                    style={{
                      height: isPlaying ? `${Math.max(10, (h * (Math.sin(Date.now() / 200 + i) + 1.2)) / 2)}%` : "8px",
                      opacity: isPlaying ? 0.9 : 0.4,
                    }}
                  />
                ))}
              </div>

              <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-2.5 py-1 rounded-full border border-zinc-700">
                Toque para voltar à capa
              </span>
            </div>
          ) : (
            /* Queue List Mode */
            <div className="w-full h-full rounded-2xl bg-zinc-900/95 border border-zinc-800 p-4 flex flex-col shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-2">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <ListMusic className="w-4 h-4 text-emerald-400" /> Fila de Reprodução ({tracks.length})
                </span>
                <button
                  onClick={() => setViewMode("cover")}
                  className="text-[11px] text-emerald-400 hover:underline font-semibold"
                >
                  Voltar
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40 space-y-1">
                {tracks.map((t, idx) => (
                  <div
                    key={`${t.nome_musica}-${idx}`}
                    onClick={() => onPlayTrack(idx)}
                    className={`p-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      currentTrackIndex === idx ? "bg-emerald-950/40 text-emerald-300 font-bold" : "hover:bg-zinc-800/50 text-zinc-300"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{t.nome_musica}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{t.nome_artista}</p>
                    </div>
                    {currentTrackIndex === idx && <Visualizer isPlaying={isPlaying} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Track Details & Favorite Heart */}
        <div className="w-full mt-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
              {currentTrack.nome_musica}
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 truncate mt-0.5 font-medium">
              {currentTrack.nome_artista}
            </p>
          </div>

          <button
            onClick={toggleFavorite}
            className={`p-2.5 rounded-full transition-all active:scale-125 ${
              isLiked 
                ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                : "text-zinc-400 hover:text-white"
            }`}
            title={isLiked ? "Remover dos favoritos" : "Salvar nos favoritos"}
            aria-label="Favoritar Música"
          >
            <Heart className={`w-6 h-6 ${isLiked ? "fill-emerald-400 stroke-emerald-400" : ""}`} />
          </button>
        </div>

        {/* Spotify Precision Scrubber / Progress Bar */}
        <div className="w-full mt-4">
          <div className="relative w-full h-1.5 bg-zinc-800 rounded-full group cursor-pointer">
            <div 
              className="h-full bg-white group-hover:bg-emerald-400 rounded-full transition-all duration-75 relative"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={isSeeking ? seekValue : currentTime}
              onChange={(e) => setSeekValue(Number(e.target.value))}
              onMouseDown={() => { setIsSeeking(true); setSeekValue(currentTime); }}
              onMouseUp={() => { setIsSeeking(false); onSeek(seekValue); }}
              onTouchStart={() => { setIsSeeking(true); setSeekValue(currentTime); }}
              onTouchEnd={() => { setIsSeeking(false); onSeek(seekValue); }}
              aria-label="Posição da música"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mt-1.5">
            <span>{formatTime(isSeeking ? seekValue : currentTime)}</span>
            <span>{formatRemainingTime(isSeeking ? seekValue : currentTime, duration)}</span>
          </div>
        </div>

        {/* Main Spotify Playback Controls */}
        <div className="w-full mt-3 flex items-center justify-between px-2">
          {/* Shuffle Mode (Ordem Aleatória) */}
          <button
            onClick={onToggleShuffle}
            className={`p-2.5 rounded-full transition-all relative ${
              shuffle 
                ? "text-emerald-400" 
                : "text-zinc-400 hover:text-white"
            }`}
            title={`Ordem Aleatória: ${shuffle ? "Ativada" : "Desativada"}`}
            aria-label="Ordem Aleatória"
          >
            <Shuffle className="w-5 h-5" />
            {shuffle && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
            )}
          </button>

          {/* Previous Track */}
          <button
            onClick={onPrevTrack}
            className="p-3 text-zinc-200 hover:text-white active:scale-90 transition-all"
            title="Faixa Anterior"
            aria-label="Faixa Anterior"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          {/* Large Center Play/Pause Button */}
          <button
            onClick={onTogglePlayPause}
            className="w-16 h-16 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center shadow-2xl active:scale-95 transition-all"
            title={isPlaying ? "Pausar" : "Tocar"}
            aria-label={isPlaying ? "Pausar" : "Tocar"}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-1" />
            )}
          </button>

          {/* Next Track */}
          <button
            onClick={onNextTrack}
            className="p-3 text-zinc-200 hover:text-white active:scale-90 transition-all"
            title="Próxima Faixa"
            aria-label="Próxima Faixa"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          {/* Repeat Mode */}
          <button
            onClick={onToggleRepeat}
            className={`p-2.5 rounded-full transition-all relative ${
              repeatMode !== "off" 
                ? "text-emerald-400" 
                : "text-zinc-400 hover:text-white"
            }`}
            title={`Repetição: ${repeatMode === "one" ? "Música Única" : repeatMode === "all" ? "Playlist Toda" : "Desativada"}`}
            aria-label="Modo de Repetição"
          >
            {repeatMode === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            {repeatMode !== "off" && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-400 rounded-full" />
            )}
          </button>
        </div>

        {/* Bottom Utility Bar */}
        <div className="w-full mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
          
          {/* Quick Equalizer */}
          {onOpenEqualizer && (
            <button
              onClick={onOpenEqualizer}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                isEqActive 
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" 
                  : "bg-zinc-900 border-zinc-800 hover:text-white"
              }`}
              title="Equalizador"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Equalizador</span>
            </button>
          )}

          {/* Add to Playlist button */}
          {onOpenAddModal && (
            <button
              onClick={onOpenAddModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:text-white hover:border-emerald-500/40 transition-all"
              title="Adicionar mais músicas"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Músicas</span>
            </button>
          )}

          {/* Queue View Switcher */}
          <button
            onClick={() => setViewMode(viewMode === "queue" ? "cover" : "queue")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
              viewMode === "queue" 
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" 
                : "bg-zinc-900 border-zinc-800 hover:text-white"
            }`}
            title="Ver Fila de Músicas"
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>Fila</span>
          </button>
        </div>

      </main>
    </div>
  );
};
