import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { PlaybackStatus } from "../types";
import { Youtube, EyeOff } from "lucide-react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadVideo: (videoId: string) => void;
  cueVideo: (videoId: string) => void;
}

interface YouTubeIFrameContainerProps {
  currentVideoId?: string;
  onStatusChange: (status: PlaybackStatus) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onTrackEnded: () => void;
  onError: (errorCode: number) => void;
  volume: number;
}

export const YouTubeIFrameContainer = forwardRef<YouTubePlayerRef, YouTubeIFrameContainerProps>(({
  currentVideoId,
  onStatusChange,
  onTimeUpdate,
  onTrackEnded,
  onError,
  volume,
}, ref) => {
  const playerRef = useRef<any>(null);
  const containerId = useRef(`yt-player-${Math.random().toString(36).substring(7)}`);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const timeUpdateInterval = useRef<any>(null);
  const lastEndedTrackTime = useRef<number>(0);

  // Keep fresh callback references across renders so YouTube event listeners never call stale closures
  const callbacksRef = useRef({
    onStatusChange,
    onTimeUpdate,
    onTrackEnded,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onStatusChange,
      onTimeUpdate,
      onTrackEnded,
      onError,
    };
  });

  // Expose imperative player actions
  useImperativeHandle(ref, () => ({
    play: () => {
      try {
        if (playerRef.current && typeof playerRef.current.playVideo === "function") {
          playerRef.current.playVideo();
        }
      } catch (err) {
        console.warn("Error playing video:", err);
      }
    },
    pause: () => {
      try {
        if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
          playerRef.current.pauseVideo();
        }
      } catch (err) {
        console.warn("Error pausing video:", err);
      }
    },
    seekTo: (seconds: number) => {
      try {
        if (playerRef.current && typeof playerRef.current.seekTo === "function") {
          playerRef.current.seekTo(seconds, true);
        }
      } catch (err) {
        console.warn("Error seeking video:", err);
      }
    },
    setVolume: (vol: number) => {
      try {
        if (playerRef.current && typeof playerRef.current.setVolume === "function") {
          playerRef.current.setVolume(vol);
        }
      } catch (err) {
        console.warn("Error setting volume:", err);
      }
    },
    getCurrentTime: () => {
      try {
        return playerRef.current?.getCurrentTime?.() || 0;
      } catch {
        return 0;
      }
    },
    getDuration: () => {
      try {
        return playerRef.current?.getDuration?.() || 0;
      } catch {
        return 0;
      }
    },
    loadVideo: (videoId: string) => {
      try {
        if (playerRef.current && typeof playerRef.current.loadVideoById === "function") {
          playerRef.current.loadVideoById({
            videoId,
            startSeconds: 0,
          });
          // Ensure playback resumes immediately without pausing
          setTimeout(() => {
            try {
              if (playerRef.current && typeof playerRef.current.playVideo === "function") {
                playerRef.current.playVideo();
              }
            } catch {}
          }, 50);
        }
      } catch (err) {
        console.warn("Error loading video by ID:", err);
      }
    },
    cueVideo: (videoId: string) => {
      try {
        if (playerRef.current && typeof playerRef.current.cueVideoById === "function") {
          playerRef.current.cueVideoById(videoId);
        }
      } catch (err) {
        console.warn("Error cuing video by ID:", err);
      }
    },
  }));

  // Trigger track end with debounce
  const triggerTrackEnded = () => {
    const now = Date.now();
    if (now - lastEndedTrackTime.current < 1200) {
      return; // Prevent duplicate skip within 1.2s
    }
    lastEndedTrackTime.current = now;
    callbacksRef.current.onStatusChange("ended");
    callbacksRef.current.onTrackEnded();
  };

  // Initialize YouTube IFrame API Script
  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;

      playerRef.current = new window.YT.Player(containerId.current, {
        height: "180",
        width: "320",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            setIsPlayerReady(true);
            try {
              event.target.setVolume(volume);
            } catch (e) {
              console.warn("Could not set initial volume:", e);
            }
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
            switch (event.data) {
              case 1:
                callbacksRef.current.onStatusChange("playing");
                break;
              case 2:
                callbacksRef.current.onStatusChange("paused");
                break;
              case 3:
                callbacksRef.current.onStatusChange("buffering");
                break;
              case 0:
                triggerTrackEnded();
                break;
              case 5:
                callbacksRef.current.onStatusChange("cued");
                break;
              default:
                callbacksRef.current.onStatusChange("unstarted");
            }
          },
          onError: (event: any) => {
            console.error("YouTube Player Error Code:", event.data);
            callbacksRef.current.onError(event.data);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!document.getElementById("youtube-iframe-api-script")) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api-script";
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    }

    // Interval to poll current time & duration for smooth UI progress
    timeUpdateInterval.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        try {
          const current = playerRef.current.getCurrentTime() || 0;
          const total = playerRef.current.getDuration() || 0;
          onTimeUpdate(current, total);
        } catch {
          // player not ready
        }
      }
    }, 400);

    return () => {
      if (timeUpdateInterval.current) clearInterval(timeUpdateInterval.current);
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        try {
          playerRef.current.destroy();
        } catch {}
      }
    };
  }, []);

  // Update volume when prop changes
  useEffect(() => {
    if (isPlayerReady && playerRef.current && typeof playerRef.current.setVolume === "function") {
      try {
        playerRef.current.setVolume(volume);
      } catch (e) {}
    }
  }, [volume, isPlayerReady]);

  return (
    <>
      {/* YouTube iframe DOM target */}
      <div 
        className={`fixed z-30 transition-all duration-300 ${
          showVideoPreview 
            ? "bottom-20 sm:bottom-24 right-3 sm:right-6 p-2 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl" 
            : "pointer-events-none opacity-0 -left-[9999px] -top-[9999px] w-1 h-1"
        }`}
      >
        {showVideoPreview && (
          <div className="flex items-center justify-between pb-1.5 px-1 text-xs text-zinc-300 font-semibold">
            <span className="flex items-center gap-1.5 text-[11px] text-red-400">
              <Youtube className="w-3.5 h-3.5" />
              Vídeo Oficial YouTube
            </span>
            <button 
              onClick={() => setShowVideoPreview(false)}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white p-1 rounded-lg"
              aria-label="Fechar pré-visualização de vídeo"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className={showVideoPreview ? "rounded-xl overflow-hidden shadow-inner" : ""}>
          <div id={containerId.current} />
        </div>
      </div>

      {/* Floating Video Preview Toggle Button */}
      {currentVideoId && !showVideoPreview && (
        <button
          onClick={() => setShowVideoPreview(true)}
          className="fixed bottom-20 sm:bottom-24 right-3 sm:right-6 z-20 min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-[11px] font-medium text-zinc-300 hover:text-white hover:border-red-500/50 shadow-lg backdrop-blur-md transition-all group"
          title="Ver clipe do YouTube"
          aria-label="Exibir Vídeo do YouTube"
        >
          <Youtube className="w-3.5 h-3.5 text-red-500 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline">Exibir Vídeo</span>
        </button>
      )}
    </>
  );
});
