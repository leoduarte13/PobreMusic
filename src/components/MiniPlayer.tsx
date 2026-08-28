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
  Maximize2, 
  Sliders, 
  Music, 
  Loader2, 
  Youtube, 
  ListMusic, 
  ChevronUp, 
  ChevronDown,
  Sparkles,
  Move
} from "lucide-react";
import { Track, PlaybackStatus } from "../types";
import { Visualizer } from "./Visualizer";

interface MiniPlayerProps {
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
  onTogglePlayPause: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onPlayTrack: (index: number) => void;
  onToggleMiniPlayer: () => void;
  onOpenEqualizer?: () => void;
  isEqActive?: boolean;
  playlistName?: string;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
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
  onTogglePlayPause,
  onPrevTrack,
  onNextTrack,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onToggleRepeat,
  onPlayTrack,
  onToggleMiniPlayer,
  onOpenEqualizer,
  isEqActive,
  playlistName,
}) => {
  const [showQueue, setShowQueue] = useState(false);
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

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-3 sm:p-6 text-zinc-100 selection:bg-emerald-500 selection:text-white">
      {/* Background glow ambiance */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
        <div className="w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
        <div className="w-80 h-80 bg-teal-600/10 rounded-full blur-3xl translate-x-20 -translate-y-20" />
      </div>

      {/* Main Mini Player Card / Floating Bar */}
      <div className="relative z-10 w-full max-w-lg bg-zinc-900/90 border border-zinc-800/90 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-2xl transition-all duration-300">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/70 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? "bg-emerald-400 opacity-75" : "bg-zinc-600 opacity-0"}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? "bg-emerald-500" : "bg-zinc-600"}`}></span>
            </span>
            <span className="font-bold text-white text-xs tracking-tight">Mini Player POBREMUSIC</span>
            {playlistName && (
              <span className="text-[10px] text-zinc-400 truncate max-w-[120px] sm:max-w-[160px] px-1.5 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/50">
                {playlistName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Equalizer Quick Toggle */}
            {onOpenEqualizer && (
              <button
                type="button"
                onClick={onOpenEqualizer}
                className={`p-1.5 rounded-lg transition-colors ${
                  isEqActive 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
                title="Equalizador"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Toggle Queue */}
            <button
              type="button"
              onClick={() => setShowQueue((prev) => !prev)}
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-medium ${
                showQueue
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
              title="Fila de Reprodução"
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tracks.length}</span>
              {showQueue ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Expand / Maximize Button to return to full app */}
            <button
              id="btn-mini-player-expand"
              type="button"
              onClick={onToggleMiniPlayer}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/60 transition-all active:scale-95"
              title="Expandir para modo completo"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Maximizar</span>
            </button>
          </div>
        </div>

        {/* Current Track Content */}
        {currentTrack ? (
          <div className="pt-4 space-y-4">
            {/* Track Info Card */}
            <div className="flex items-center gap-3.5">
              {/* Cover Artwork */}
              <div className="relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10 bg-zinc-800">
                {currentTrack.capa ? (
                  <img
                    src={currentTrack.capa}
                    alt={currentTrack.nome_musica}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <Music className="w-8 h-8" />
                  </div>
                )}
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                    <Visualizer isPlaying={true} barCount={4} />
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate leading-snug">
                    {currentTrack.nome_musica}
                  </h3>
                </div>
                <p className="text-xs text-zinc-300 truncate mt-0.5 font-medium">
                  {currentTrack.nome_artista}
                </p>
                {currentTrack.album && (
                  <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                    {currentTrack.album}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-medium bg-red-950/40 px-1.5 py-0.5 rounded border border-red-800/40">
                    <Youtube className="w-3 h-3" />
                    Áudio em Segundo Plano
                  </span>
                  {currentTrackIndex !== null && (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      #{currentTrackIndex + 1} de {tracks.length}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Progress Slider */}
            <div className="space-y-1">
              <div className="relative flex items-center group py-1">
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
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span>{formatTime(isSeeking ? seekValue : currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Action Buttons */}
            <div className="flex items-center justify-between pt-1">
              {/* Shuffle */}
              <button
                type="button"
                onClick={onToggleShuffle}
                className={`p-2 rounded-xl transition-all ${
                  shuffle ? "text-emerald-400 bg-emerald-950/60 border border-emerald-500/30" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
                title="Aleatório"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 sm:gap-4">
                {/* Previous */}
                <button
                  type="button"
                  onClick={onPrevTrack}
                  className="p-2 text-zinc-300 hover:text-white rounded-xl hover:bg-zinc-800/60 transition-all active:scale-95"
                  title="Faixa Anterior"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>

                {/* Play/Pause Button */}
                <button
                  type="button"
                  onClick={onTogglePlayPause}
                  disabled={isBuffering && !currentTrack.videoId}
                  className="w-12 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center shadow-lg shadow-emerald-500/25 transition-all active:scale-95 font-bold disabled:opacity-50"
                  title={isPlaying ? "Pausar" : "Tocar"}
                >
                  {isBuffering ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>

                {/* Next */}
                <button
                  type="button"
                  onClick={onNextTrack}
                  className="p-2 text-zinc-300 hover:text-white rounded-xl hover:bg-zinc-800/60 transition-all active:scale-95"
                  title="Próxima Faixa"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>

              {/* Repeat */}
              <button
                type="button"
                onClick={onToggleRepeat}
                className={`p-2 rounded-xl transition-all ${
                  repeatMode !== "off" ? "text-emerald-400 bg-emerald-950/60 border border-emerald-500/30" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
                title={`Repetição: ${repeatMode === "one" ? "Música Única" : repeatMode === "all" ? "Playlist Toda" : "Desativada"}`}
              >
                {repeatMode === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>
            </div>

            {/* Volume Control Bar */}
            <div className="flex items-center justify-between gap-3 pt-2 px-1 border-t border-zinc-800/50">
              <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="p-1 text-zinc-400 hover:text-white transition-colors shrink-0"
                  title={isMuted ? "Desmutar" : "Mutar"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : volume < 50 ? (
                    <Volume1 className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] font-mono text-zinc-500 w-6 text-right">
                  {isMuted ? 0 : volume}%
                </span>
              </div>

              <div className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>Modo Flutuante Ativo</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-zinc-400 space-y-2">
            <Music className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-xs">Nenhuma faixa selecionada no momento.</p>
            <button
              onClick={onToggleMiniPlayer}
              className="text-xs text-emerald-400 underline font-semibold"
            >
              Voltar e escolher uma música
            </button>
          </div>
        )}

        {/* Collapsible Mini Queue Drawer */}
        {showQueue && (
          <div className="mt-4 pt-3 border-t border-zinc-800 max-h-56 overflow-y-auto space-y-1 pr-1">
            <div className="flex items-center justify-between text-xs text-zinc-400 px-2 pb-1.5 font-medium">
              <span>Faixas na Fila</span>
              <span>{tracks.length} total</span>
            </div>
            {tracks.map((t, idx) => {
              const isCurr = currentTrackIndex === idx;
              return (
                <button
                  key={`${t.nome_musica}-${idx}`}
                  type="button"
                  onClick={() => onPlayTrack(idx)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all ${
                    isCurr
                      ? "bg-emerald-950/50 border border-emerald-500/40 text-emerald-300"
                      : "hover:bg-zinc-800/60 text-zinc-300"
                  }`}
                >
                  <span className="text-[10px] font-mono text-zinc-500 w-4 text-center">
                    {idx + 1}
                  </span>
                  {t.capa && (
                    <img
                      src={t.capa}
                      alt={t.nome_musica}
                      className="w-7 h-7 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate leading-tight">
                      {t.nome_musica}
                    </p>
                    <p className="text-[10px] text-zinc-400 truncate">
                      {t.nome_artista}
                    </p>
                  </div>
                  {isCurr && isPlaying && (
                    <Visualizer isPlaying={true} barCount={3} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Footer Note */}
      <div className="mt-4 text-center text-xs text-zinc-500 flex items-center gap-2">
        <span>Pressione</span>
        <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-mono font-bold">
          M
        </kbd>
        <span>para alternar entre Mini Player e Visualização Completa</span>
      </div>
    </div>
  );
};
