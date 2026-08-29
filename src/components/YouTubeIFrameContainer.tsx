import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { PlaybackStatus } from "../types";
import { Youtube, EyeOff } from "lucide-react";

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void; }
}

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
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const timeUpdateInterval = useRef<any>(null);
  const lastEndedTrackTime = useRef(0);
  const lastLoadedVideoId = useRef<string | undefined>(undefined);
  const callbacksRef = useRef({ onStatusChange, onTimeUpdate, onTrackEnded, onError });

  useEffect(() => { callbacksRef.current = { onStatusChange, onTimeUpdate, onTrackEnded, onError }; });

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    seekTo: (seconds) => playerRef.current?.seekTo?.(seconds, true),
    setVolume: (vol) => playerRef.current?.setVolume?.(vol),
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0,
    getDuration: () => playerRef.current?.getDuration?.() || 0,
    loadVideo: (videoId) => {
      if (!videoId || !playerRef.current?.loadVideoById) return;
      lastLoadedVideoId.current = videoId;
      playerRef.current.loadVideoById({ videoId, startSeconds: 0 });
    },
    cueVideo: (videoId) => {
      if (!videoId || !playerRef.current?.cueVideoById) return;
      lastLoadedVideoId.current = videoId;
      playerRef.current.cueVideoById(videoId);
    },
  }));

  const triggerTrackEnded = () => {
    const now = Date.now();
    if (now - lastEndedTrackTime.current < 1200) return;
    lastEndedTrackTime.current = now;
    callbacksRef.current.onStatusChange("ended");
    callbacksRef.current.onTrackEnded();
  };

  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT?.Player) return;
      playerRef.current = new window.YT.Player(containerId.current, {
        height: "180", width: "320",
        playerVars: {
          autoplay: 1, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0,
          showinfo: 0, iv_load_policy: 3, playsinline: 1, origin: window.location.origin,
          // Keep the player focused on audio use. Video remains hidden by the UI.
          controls: 0,
        },
        events: {
          onReady: (event: any) => { setIsPlayerReady(true); event.target.setVolume(volume); if (currentVideoId) { lastLoadedVideoId.current = currentVideoId; event.target.loadVideoById({ videoId: currentVideoId, startSeconds: 0 }); } },
          onStateChange: (event: any) => {
            switch (event.data) {
              case 1: callbacksRef.current.onStatusChange("playing"); break;
              case 2: callbacksRef.current.onStatusChange("paused"); break;
              case 3: callbacksRef.current.onStatusChange("buffering"); break;
              case 0: triggerTrackEnded(); break;
              case 5: callbacksRef.current.onStatusChange("cued"); break;
              default: callbacksRef.current.onStatusChange("unstarted");
            }
          },
          onError: (event: any) => { console.error("YouTube Player Error Code:", event.data); callbacksRef.current.onError(event.data); },
        },
      });
    };

    if (window.YT?.Player) initPlayer();
    else {
      if (!document.getElementById("youtube-iframe-api-script")) {
        const tag = document.createElement("script"); tag.id = "youtube-iframe-api-script"; tag.src = "https://www.youtube.com/iframe_api";
        document.getElementsByTagName("script")[0]?.parentNode?.insertBefore(tag, document.getElementsByTagName("script")[0]);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    timeUpdateInterval.current = setInterval(() => {
      if (playerRef.current?.getCurrentTime) {
        try { onTimeUpdate(playerRef.current.getCurrentTime() || 0, playerRef.current.getDuration() || 0); } catch {}
      }
    }, 800);

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
    <div className={`fixed z-30 transition-all duration-300 ${showVideoPreview ? "bottom-20 sm:bottom-24 right-3 sm:right-6 p-2 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl" : "pointer-events-none opacity-0 -left-[9999px] -top-[9999px] w-1 h-1"}`}>
      {showVideoPreview && <div className="flex items-center justify-between pb-1.5 px-1 text-xs text-zinc-300 font-semibold"><span className="flex items-center gap-1.5 text-[11px] text-red-400"><Youtube className="w-3.5 h-3.5" />Vídeo Oficial YouTube</span><button onClick={() => setShowVideoPreview(false)} className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white p-1 rounded-lg" aria-label="Fechar pré-visualização de vídeo"><EyeOff className="w-4 h-4" /></button></div>}
      <div className={showVideoPreview ? "rounded-xl overflow-hidden shadow-inner" : ""}><div id={containerId.current} /></div>
    </div>
    {currentVideoId && !showVideoPreview && <button onClick={() => setShowVideoPreview(true)} className="fixed bottom-20 sm:bottom-24 right-3 sm:right-6 z-20 min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-[11px] font-medium text-zinc-300 hover:text-white hover:border-red-500/50 shadow-lg backdrop-blur-md transition-all group" title="Ver clipe do YouTube" aria-label="Exibir Vídeo do YouTube"><Youtube className="w-3.5 h-3.5 text-red-500 group-hover:scale-110 transition-transform" /><span className="hidden sm:inline">Exibir Vídeo</span></button>}
  </>;
});
