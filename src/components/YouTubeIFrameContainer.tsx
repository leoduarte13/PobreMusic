import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { PlaybackStatus } from "../types";
import { Youtube, EyeOff, Maximize2, Minimize2, X } from "lucide-react";

declare global { interface Window { YT: any; onYouTubeIframeAPIReady: () => void; } }

export interface YouTubePlayerRef {
  play: () => void; pause: () => void; seekTo: (seconds: number) => void; setVolume: (volume: number) => void;
  getCurrentTime: () => number; getDuration: () => number; loadVideo: (videoId: string) => void; cueVideo: (videoId: string) => void;
}

interface YouTubeIFrameContainerProps {
  currentVideoId?: string; onStatusChange: (status: PlaybackStatus) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void; onTrackEnded: () => void;
  onError: (errorCode: number) => void; volume: number;
}

export const YouTubeIFrameContainer = forwardRef<YouTubePlayerRef, YouTubeIFrameContainerProps>((props, ref) => {
  const { currentVideoId, onStatusChange, onTimeUpdate, onTrackEnded, onError, volume } = props;
  const playerRef = useRef<any>(null);
  const containerId = useRef(`yt-player-${Math.random().toString(36).substring(7)}`);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timeUpdateInterval = useRef<any>(null);
  const lastEndedTrackTime = useRef(0);
  const lastLoadedVideoId = useRef<string | undefined>(undefined);
  const callbacksRef = useRef({ onStatusChange, onTimeUpdate, onTrackEnded, onError });

  useEffect(() => { callbacksRef.current = { onStatusChange, onTimeUpdate, onTrackEnded, onError }; });

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo?.(), pause: () => playerRef.current?.pauseVideo?.(),
    seekTo: (seconds) => playerRef.current?.seekTo?.(seconds, true), setVolume: (vol) => playerRef.current?.setVolume?.(vol),
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0, getDuration: () => playerRef.current?.getDuration?.() || 0,
    loadVideo: (videoId) => { if (!videoId || !playerRef.current?.loadVideoById) return; lastLoadedVideoId.current = videoId; playerRef.current.loadVideoById({ videoId, startSeconds: 0 }); },
    cueVideo: (videoId) => { if (!videoId || !playerRef.current?.cueVideoById) return; lastLoadedVideoId.current = videoId; playerRef.current.cueVideoById(videoId); },
  }));

  const triggerTrackEnded = () => {
    const now = Date.now(); if (now - lastEndedTrackTime.current < 1200) return;
    lastEndedTrackTime.current = now; callbacksRef.current.onStatusChange("ended"); callbacksRef.current.onTrackEnded();
  };

  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT?.Player) return;
      playerRef.current = new window.YT.Player(containerId.current, {
        height: "202", width: "360",
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, showinfo: 0, iv_load_policy: 3, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: (event: any) => { setIsPlayerReady(true); event.target.setVolume(volume); if (currentVideoId) { lastLoadedVideoId.current = currentVideoId; event.target.loadVideoById({ videoId: currentVideoId, startSeconds: 0 }); } },
          onStateChange: (event: any) => { switch (event.data) { case 1: callbacksRef.current.onStatusChange("playing"); break; case 2: callbacksRef.current.onStatusChange("paused"); break; case 3: callbacksRef.current.onStatusChange("buffering"); break; case 0: triggerTrackEnded(); break; case 5: callbacksRef.current.onStatusChange("cued"); break; default: callbacksRef.current.onStatusChange("unstarted"); } },
          onError: (event: any) => { console.error("YouTube Player Error Code:", event.data); callbacksRef.current.onError(event.data); },
        },
      });
    };
    if (window.YT?.Player) initPlayer();
    else {
      if (!document.getElementById("youtube-iframe-api-script")) { const tag = document.createElement("script"); tag.id = "youtube-iframe-api-script"; tag.src = "https://www.youtube.com/iframe_api"; document.getElementsByTagName("script")[0]?.parentNode?.insertBefore(tag, document.getElementsByTagName("script")[0]); }
      window.onYouTubeIframeAPIReady = initPlayer;
    }
    timeUpdateInterval.current = setInterval(() => { if (playerRef.current?.getCurrentTime) { try { onTimeUpdate(playerRef.current.getCurrentTime() || 0, playerRef.current.getDuration() || 0); } catch {} } }, 800);
    return () => { if (timeUpdateInterval.current) clearInterval(timeUpdateInterval.current); playerRef.current?.destroy?.(); playerRef.current = null; };
  }, []);

  useEffect(() => {
    if (!isPlayerReady || !currentVideoId || !playerRef.current?.loadVideoById) return;
    if (lastLoadedVideoId.current === currentVideoId) return;
    lastLoadedVideoId.current = currentVideoId;
    playerRef.current.loadVideoById({ videoId: currentVideoId, startSeconds: 0 });
  }, [currentVideoId, isPlayerReady]);

  useEffect(() => { if (isPlayerReady) playerRef.current?.setVolume?.(volume); }, [volume, isPlayerReady]);

  return <>
    {currentVideoId && showPreview && (
      <div className={`fixed z-[70] ${expanded ? "inset-3 sm:inset-auto sm:bottom-24 sm:right-6 sm:w-[560px]" : "bottom-20 right-3 sm:bottom-24 sm:right-6 w-[calc(100vw-24px)] sm:w-[380px]"} rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-700 shadow-2xl`}>
        <div className="flex items-center justify-between h-11 px-3 border-b border-zinc-800 bg-zinc-900/95">
          <div className="flex items-center gap-2 min-w-0"><Youtube className="w-4 h-4 text-red-500 shrink-0" /><span className="text-xs font-semibold text-zinc-200 truncate">Prévia da música</span></div>
          <div className="flex items-center gap-1"><button onClick={() => setExpanded(v => !v)} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800" title={expanded ? "Reduzir" : "Expandir"} aria-label={expanded ? "Reduzir prévia" : "Expandir prévia"}>{expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</button><button onClick={() => { setShowPreview(false); setExpanded(false); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800" title="Fechar" aria-label="Fechar prévia"><X className="w-4 h-4" /></button></div>
        </div>
        <div className="w-full aspect-video bg-black flex items-center justify-center"><div id={containerId.current} className="w-full h-full" /></div>
        <div className="px-3 py-2 text-[11px] text-zinc-500 border-t border-zinc-800">O áudio continua tocando mesmo com a prévia fechada.</div>
      </div>
    )}

    {currentVideoId && !showPreview && <button onClick={() => setShowPreview(true)} className="fixed bottom-20 sm:bottom-24 right-3 sm:right-6 z-50 min-h-10 flex items-center gap-2 px-3.5 py-2 rounded-full bg-zinc-900/95 border border-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white hover:border-red-500/60 shadow-xl backdrop-blur-md transition-all" title="Abrir prévia da música" aria-label="Abrir prévia da música"><Youtube className="w-4 h-4 text-red-500" /><span>Prévia</span></button>}

    {!showPreview && <div className="fixed pointer-events-none opacity-0 -left-[9999px] -top-[9999px] w-1 h-1"><div id={containerId.current} /></div>}
    {showPreview && <button onClick={() => setShowPreview(false)} className="sr-only" aria-label="Fechar prévia"><EyeOff /></button>}
  </>;
});
