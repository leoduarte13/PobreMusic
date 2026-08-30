import React, { useEffect, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Shuffle, Repeat, Repeat1, Music, Loader2, Sliders, Minimize2,
  Maximize2, X, ChevronDown
} from "lucide-react";
import { Track, PlaybackStatus } from "../types";
import { Visualizer } from "./Visualizer";

interface AudioPlayerBarProps {
  currentTrack: Track | null; playbackStatus: PlaybackStatus; currentTime: number; duration: number;
  volume: number; isMuted: boolean; shuffle: boolean; repeatMode: "off" | "all" | "one";
  onTogglePlayPause: () => void; onPrevTrack: () => void; onNextTrack: () => void; onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void; onToggleMute: () => void; onToggleShuffle: () => void; onToggleRepeat: () => void;
  onOpenEqualizer?: () => void; isEqActive?: boolean; onOpenMobileDownload?: () => void; onToggleMiniPlayer?: () => void; onOpenNowPlaying?: () => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  currentTrack, playbackStatus, currentTime, duration, volume, isMuted, shuffle, repeatMode,
  onTogglePlayPause, onPrevTrack, onNextTrack, onSeek, onVolumeChange, onToggleMute,
  onToggleShuffle, onToggleRepeat, onOpenEqualizer, isEqActive
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return "0:00";
    const minutes = Math.floor(timeInSeconds / 60); const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };
  const isPlaying = playbackStatus === "playing";
  const isBuffering = playbackStatus === "buffering" || currentTrack?.isLoadingVideo;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => setSeekValue(Number(e.target.value));
  const handleSliderMouseDown = () => { setIsSeeking(true); setSeekValue(currentTime); };
  const handleSliderMouseUp = () => { setIsSeeking(false); onSeek(seekValue); };

  if (!currentTrack) return <footer className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-lg px-4 py-2.5 pb-safe text-center text-xs text-zinc-500 shadow-2xl">Selecione uma faixa para reproduzir</footer>;

  const progressPercent = duration > 0 ? ((isSeeking ? seekValue : currentTime) / duration) * 100 : 0;
  const artwork = currentTrack.capa;

  return (
    <>
      {/* Mobile/desktop persistent mini player. Clicking the track opens Now Playing. */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/98 border-t border-zinc-800/90 backdrop-blur-xl pb-safe shadow-2xl overflow-hidden">
        <div className="relative w-full h-1 bg-zinc-800/90 cursor-pointer">
          <div className="h-full bg-emerald-500 transition-all duration-100" style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} />
          <input min="0" max={duration || 100} value={isSeeking ? seekValue : currentTime} onChange={handleSliderChange} onMouseDown={handleSliderMouseDown} onMouseUp={handleSliderMouseUp} onTouchStart={handleSliderMouseDown} onTouchEnd={handleSliderMouseUp} aria-label="Progresso da música" type="range" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-pan-x" />
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
          <button type="button" onClick={() => setShowNowPlaying(true)} className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 sm:flex-initial sm:w-1/4 cursor-pointer group p-1 -m-1 rounded-xl hover:bg-zinc-900/60 active:scale-[.98] transition-all text-left" aria-label="Abrir Tocando agora">
            <div className="relative shrink-0">
              {artwork ? <img src={artwork} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl object-cover shadow-md" /> : <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500"><Music className="w-4 h-4 sm:w-5 sm:h-5" /></div>}
              {isPlaying && <div className="absolute inset-0 bg-black/40 rounded-lg sm:rounded-xl flex items-center justify-center"><Visualizer isPlaying={true} /></div>}
            </div>
            <div className="min-w-0 flex-1"><p className="text-xs sm:text-sm font-bold text-white truncate">{currentTrack.nome_musica}</p><p className="text-[10px] sm:text-xs text-zinc-400 truncate">{currentTrack.nome_artista}</p></div>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button onClick={onPrevTrack} className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white" aria-label="Faixa anterior"><SkipBack className="w-5 h-5 fill-current" /></button>
            <button onClick={onTogglePlayPause} disabled={isBuffering && !currentTrack.videoId} className="w-11 h-11 min-w-[44px] rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center shadow-lg disabled:opacity-50" aria-label={isPlaying ? "Pausar" : "Tocar"}>{isBuffering ? <Loader2 className="w-5 h-5 animate-spin" /> : isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}</button>
            <button onClick={onNextTrack} className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white" aria-label="Próxima faixa"><SkipForward className="w-5 h-5 fill-current" /></button>
            <button onClick={() => setShowNowPlaying(true)} className="hidden sm:flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-zinc-400 hover:text-white" aria-label="Abrir Tocando agora"><Maximize2 className="w-4 h-4" /></button>
          </div>

          <div className="hidden sm:flex items-center justify-end gap-1.5 sm:w-1/4">
            {onOpenEqualizer && <button onClick={onOpenEqualizer} className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg ${isEqActive ? "text-emerald-400 bg-emerald-950/40" : "text-zinc-400 hover:text-white"}`} aria-label="Equalizador"><Sliders className="w-3.5 h-3.5" /></button>}
            <button onClick={onToggleMute} className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white" aria-label="Mutar ou desmutar">{isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : volume < 50 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
            <input min="0" max="100" value={isMuted ? 0 : volume} onChange={(e) => onVolumeChange(Number(e.target.value))} aria-label="Volume" type="range" className="w-16 lg:w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
          </div>
        </div>
      </footer>

      {/* Full Now Playing screen. The player itself is NOT recreated here. */}
      {showNowPlaying && (
        <div className="fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Tocando agora">
          <div className="flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3 shrink-0">
            <button onClick={() => setShowNowPlaying(false)} className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-zinc-900" aria-label="Fechar Tocando agora"><ChevronDown className="w-6 h-6" /></button>
            <span className="text-xs font-semibold tracking-widest uppercase text-zinc-400">Tocando agora</span>
            <button onClick={() => setShowNowPlaying(false)} className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-zinc-900" aria-label="Fechar"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 flex flex-col items-center justify-center">
            <div className="w-[min(82vw,430px)] aspect-square rounded-2xl overflow-hidden bg-zinc-900 shadow-2xl mb-7">
              {artwork ? <img src={artwork} alt={currentTrack.nome_musica} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music className="w-20 h-20 text-zinc-700" /></div>}
            </div>
            <div className="w-full max-w-[520px] text-left">
              <h2 className="text-2xl sm:text-3xl font-bold truncate">{currentTrack.nome_musica}</h2>
              <p className="text-base text-zinc-400 truncate mt-1">{currentTrack.nome_artista}</p>
              <div className="mt-7">
                <div className="relative w-full h-2 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} /></div>
                <div className="flex justify-between mt-2 text-[11px] font-mono text-zinc-500"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
              </div>
              <div className="flex items-center justify-center gap-8 sm:gap-12 mt-6">
                <button onClick={onToggleShuffle} className={`w-10 h-10 flex items-center justify-center rounded-full ${shuffle ? "text-emerald-400" : "text-zinc-400"}`} aria-label="Aleatório"><Shuffle className="w-5 h-5" /></button>
                <button onClick={onPrevTrack} className="w-12 h-12 flex items-center justify-center" aria-label="Faixa anterior"><SkipBack className="w-7 h-7 fill-current" /></button>
                <button onClick={onTogglePlayPause} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-xl" aria-label={isPlaying ? "Pausar" : "Tocar"}>{isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}</button>
                <button onClick={onNextTrack} className="w-12 h-12 flex items-center justify-center" aria-label="Próxima faixa"><SkipForward className="w-7 h-7 fill-current" /></button>
                <button onClick={onToggleRepeat} className={`w-10 h-10 flex items-center justify-center rounded-full ${repeatMode !== "off" ? "text-emerald-400" : "text-zinc-400"}`} aria-label="Repetição">{repeatMode === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}</button>
              </div>
              <div className="mt-8 flex items-center gap-3"><Volume1 className="w-4 h-4 text-zinc-500" /><input min="0" max="100" value={isMuted ? 0 : volume} onChange={(e) => onVolumeChange(Number(e.target.value))} aria-label="Volume" type="range" className="flex-1 accent-emerald-500" /><Volume2 className="w-4 h-4 text-zinc-500" /></div>
              <div className="mt-7 flex justify-center gap-3 pb-6"><button onClick={onOpenEqualizer} className="px-4 py-2.5 rounded-full border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-900"><Sliders className="inline w-4 h-4 mr-2" />Equalizador</button><button onClick={() => setShowNowPlaying(false)} className="px-4 py-2.5 rounded-full border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-900">Continuar ouvindo</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
