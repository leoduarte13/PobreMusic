import React, { useState } from "react";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Volume1, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  Music, 
  Loader2, 
  Sliders, 
  Minimize2
} from "lucide-react";
import { Track, PlaybackStatus } from "../types";
import { Visualizer } from "./Visualizer";

interface AudioPlayerBarProps {
  currentTrack: Track | null;
  playbackStatus: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
  onTogglePlayPause: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onOpenEqualizer?: () => void;
  isEqActive?: boolean;
  onOpenMobileDownload?: () => void;
  onToggleMiniPlayer?: () => void;
  onOpenNowPlaying?: () => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  currentTrack,
  playbackStatus,
  currentTime,
  duration,
  volume,
  isMuted,
  shuffle,
  repeatMode,
  onTogglePlayPause,
  onPrevTrack,
  onNextTrack,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onOpenEqualizer,
  isEqActive,
  onToggleMiniPlayer,
  onOpenNowPlaying,
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const isPlaying = playbackStatus === "playing";
  const isBuffering = playbackStatus === "buffering" || currentTrack?.isLoadingVideo;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(Number(e.target.value));
  };

  const handleSliderMouseDown = () => {
    setIsSeeking(true);
    setSeekValue(currentTime);
  };

  const handleSliderMouseUp = () => {
    setIsSeeking(false);
    onSeek(seekValue);
  };

  if (!currentTrack) {
    return (
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-lg px-4 py-2.5 pb-safe text-center text-xs text-zinc-500 shadow-2xl">
        Selecione uma faixa para reproduzir
      </footer>
    );
  }

  const progressPercent = duration > 0 ? ((isSeeking ? seekValue : currentTime) / duration) * 100 : 0;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 border-t border-zinc-800/90 backdrop-blur-xl pb-safe shadow-2xl overflow-hidden">
      {/* Top Thin Progress Bar (Visible on Mobile & Desktop) */}
      <div className="relative w-full h-1 bg-zinc-800/90 group cursor-pointer">
        <div 
          className="h-full bg-emerald-500 transition-all duration-100"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={isSeeking ? seekValue : currentTime}
          onChange={handleSliderChange}
          onMouseDown={handleSliderMouseDown}
          onMouseUp={handleSliderMouseUp}
          onTouchStart={handleSliderMouseDown}
          onTouchEnd={handleSliderMouseUp}
          aria-label="Progresso da música"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-pan-x"
        />
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Track Info (Click to open Spotify-style Now Playing View) */}
        <div 
          onClick={onOpenNowPlaying}
          className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 sm:flex-initial sm:w-1/4 cursor-pointer group p-1 -m-1 rounded-xl hover:bg-zinc-900/60 active:scale-98 transition-all"
          title="Clique para abrir visualização expandida estilo Spotify"
        >
          <div className="relative shrink-0">
            {currentTrack.capa ? (
              <img
                src={currentTrack.capa}
                alt={currentTrack.nome_musica}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl object-cover shadow-md group-hover:brightness-110 transition-all"
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                <Music className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            )}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 rounded-lg sm:rounded-xl flex items-center justify-center backdrop-blur-[1px]">
                <Visualizer isPlaying={true} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm font-bold text-white truncate tracking-tight group-hover:text-emerald-400 transition-colors">
              {currentTrack.nome_musica}
            </p>
            <p className="text-[10px] sm:text-xs text-zinc-400 truncate">
              {currentTrack.nome_artista}
            </p>
          </div>
        </div>

        {/* Center Controls (Mobile compact inlined / Desktop expanded with timeline) */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 sm:flex-1 sm:max-w-xl sm:flex-col">
          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-1 sm:gap-3">
            {/* Shuffle (Hidden on very small screens, visible in desktop or sm) */}
            <button
              id="btn-shuffle"
              onClick={onToggleShuffle}
              className={`hidden sm:flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors ${
                shuffle ? "text-emerald-400 bg-emerald-950/40" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Aleatório"
              aria-label="Aleatório"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            {/* Previous Track */}
            <button
              id="btn-prev-track"
              onClick={onPrevTrack}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white active:scale-95 transition-all"
              title="Faixa Anterior"
              aria-label="Faixa Anterior"
            >
              <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>

            {/* Play/Pause Main Button */}
            <button
              id="btn-play-pause-main"
              onClick={onTogglePlayPause}
              disabled={isBuffering && !currentTrack.videoId}
              className="w-10 h-10 sm:w-11 sm:h-11 min-w-[40px] rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-zinc-950 flex items-center justify-center shadow-md shadow-emerald-500/20 transition-all font-bold disabled:opacity-50 mx-0.5"
              title={isPlaying ? "Pausar" : "Tocar"}
              aria-label={isPlaying ? "Pausar" : "Tocar"}
            >
              {isBuffering ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            {/* Next Track */}
            <button
              id="btn-next-track"
              onClick={onNextTrack}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white active:scale-95 transition-all"
              title="Próxima Faixa"
              aria-label="Próxima Faixa"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>

            {/* Repeat (Desktop) */}
            <button
              id="btn-repeat"
              onClick={onToggleRepeat}
              className={`hidden sm:flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors ${
                repeatMode !== "off" ? "text-emerald-400 bg-emerald-950/40" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title={`Repetição: ${repeatMode === "one" ? "Música Única" : repeatMode === "all" ? "Playlist Toda" : "Desativada"}`}
              aria-label="Modo de Repetição"
            >
              {repeatMode === "one" ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            </button>

            {/* Equalizer Quick Toggle on Mobile */}
            {onOpenEqualizer && (
              <button
                id="btn-player-equalizer-mobile"
                onClick={onOpenEqualizer}
                className={`flex sm:hidden min-h-[36px] min-w-[36px] items-center justify-center rounded-lg transition-colors ${
                  isEqActive ? "text-emerald-400 bg-emerald-950/50" : "text-zinc-400 hover:text-white"
                }`}
                title="Equalizador"
                aria-label="Equalizador"
              >
                <Sliders className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Desktop Timeline Display */}
          <div className="hidden sm:flex w-full items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-400 w-8 text-right shrink-0">
              {formatTime(isSeeking ? seekValue : currentTime)}
            </span>
            
            <div className="relative flex-1 flex items-center py-1">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={isSeeking ? seekValue : currentTime}
                onChange={handleSliderChange}
                onMouseDown={handleSliderMouseDown}
                onMouseUp={handleSliderMouseUp}
                aria-label="Controle de posição da música"
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
              />
            </div>

            <span className="text-[10px] font-mono text-zinc-400 w-8 shrink-0">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volume & Desktop Tools (Right) */}
        <div className="hidden sm:flex items-center justify-end gap-1.5 sm:w-1/4">
          {/* Mini Player */}
          {onToggleMiniPlayer && (
            <button
              id="btn-player-mini-mode"
              type="button"
              onClick={onToggleMiniPlayer}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              title="Mini Player (Tecla M)"
              aria-label="Ativar Mini Player"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Equalizer */}
          {onOpenEqualizer && (
            <button
              id="btn-player-equalizer"
              type="button"
              onClick={onOpenEqualizer}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-all ${
                isEqActive 
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" 
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
              title="Equalizador"
              aria-label="Equalizador"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Volume Slider */}
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={onToggleMute}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              title={isMuted ? "Desmutar" : "Mutar"}
              aria-label="Mutar ou Desmutar Áudio"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-red-400" />
              ) : volume < 50 ? (
                <Volume1 className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volume"
              className="w-16 lg:w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
            />
          </div>
        </div>

      </div>
    </footer>
  );
};
