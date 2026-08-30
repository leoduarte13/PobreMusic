import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { PlaybackStatus } from "../types";

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

interface Props {
  currentVideoId?: string;
  onStatusChange: (status: PlaybackStatus) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onTrackEnded: () => void;
  onError: (errorCode: number) => void;
  volume: number;
}

export const YouTubeIFrameContainer = forwardRef<YouTubePlayerRef, Props>(
  ({ currentVideoId, onStatusChange, onTimeUpdate, onTrackEnded, onError, volume }, ref) => {
    const playerRef = useRef<any>(null);
    const containerId = useRef(`yt-audio-engine-${Math.random().toString(36).substring(7)}`);
    const [ready, setReady] = useState(false);
    const timer = useRef<any>(null);
    const lastEnded = useRef(0);
    const loaded = useRef<string>();
    const isPlayingIntentRef = useRef<boolean>(false);
    const isHiddenRef = useRef<boolean>(false);

    const callbacks = useRef({
      onStatusChange,
      onTimeUpdate,
      onTrackEnded,
      onError,
    });

    useEffect(() => {
      callbacks.current = {
        onStatusChange,
        onTimeUpdate,
        onTrackEnded,
        onError,
      };
    });

    useImperativeHandle(ref, () => ({
      play: () => {
        isPlayingIntentRef.current = true;
        try {
          playerRef.current?.playVideo?.();
        } catch {}
      },
      pause: () => {
        isPlayingIntentRef.current = false;
        try {
          playerRef.current?.pauseVideo?.();
        } catch {}
      },
      seekTo: (s) => {
        try {
          playerRef.current?.seekTo?.(s, true);
        } catch {}
      },
      setVolume: (v) => {
        try {
          playerRef.current?.setVolume?.(v);
        } catch {}
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
      loadVideo: (id) => {
        if (!id) return;
        loaded.current = id;
        isPlayingIntentRef.current = true;
        try {
          playerRef.current?.loadVideoById?.({ videoId: id, startSeconds: 0 });
        } catch {}
      },
      cueVideo: (id) => {
        if (!id) return;
        loaded.current = id;
        try {
          playerRef.current?.cueVideoById?.(id);
        } catch {}
      },
    }));

    const handleEnded = () => {
      const n = Date.now();
      if (n - lastEnded.current < 1200) return;
      lastEnded.current = n;
      callbacks.current.onStatusChange("ended");
      callbacks.current.onTrackEnded();
    };

    useEffect(() => {
      const handleVisibilityChange = () => {
        const isHidden = document.visibilityState === "hidden";
        isHiddenRef.current = isHidden;
        if (isHidden && isPlayingIntentRef.current) {
          // Prevent mobile background throttling by reinforcing play command
          try {
            playerRef.current?.playVideo?.();
          } catch {}
        } else if (!isHidden && isPlayingIntentRef.current) {
          try {
            playerRef.current?.playVideo?.();
          } catch {}
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pagehide", handleVisibilityChange);
      window.addEventListener("blur", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("pagehide", handleVisibilityChange);
        window.removeEventListener("blur", handleVisibilityChange);
      };
    }, []);

    useEffect(() => {
      const init = () => {
        if (!window.YT?.Player) return;
        try {
          playerRef.current = new window.YT.Player(containerId.current, {
            height: "100%",
            width: "100%",
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              playsinline: 1,
              origin: window.location.origin,
              enablejsapi: 1,
            },
            events: {
              onReady: (e: any) => {
                setReady(true);
                e.target.setVolume(volume);
                if (currentVideoId) {
                  loaded.current = currentVideoId;
                  e.target.cueVideoById({ videoId: currentVideoId, startSeconds: 0 });
                }
              },
              onStateChange: (e: any) => {
                if (e.data === 1) {
                  // Playing
                  callbacks.current.onStatusChange("playing");
                } else if (e.data === 2) {
                  // Paused: Check if this was an automatic background pause
                  if (isPlayingIntentRef.current && (document.visibilityState === "hidden" || isHiddenRef.current)) {
                    // Mobile browser tried to pause on app switch/lock screen - re-assert playback
                    try {
                      playerRef.current?.playVideo?.();
                    } catch {}
                  } else {
                    callbacks.current.onStatusChange("paused");
                  }
                } else if (e.data === 3) {
                  // Buffering
                  callbacks.current.onStatusChange("buffering");
                } else if (e.data === 0) {
                  // Ended
                  handleEnded();
                } else if (e.data === 5) {
                  callbacks.current.onStatusChange("cued");
                }
              },
              onError: (e: any) => {
                console.warn(`[AudioEngine] Error Code: ${e.data}`);
                callbacks.current.onError(e.data);
              },
            },
          });
        } catch (err) {
          console.error("[AudioEngine] Init error:", err);
        }
      };

      if (window.YT?.Player) {
        init();
      } else {
        if (!document.getElementById("youtube-iframe-api-script")) {
          const s = document.createElement("script");
          s.id = "youtube-iframe-api-script";
          s.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(s);
        }
        window.onYouTubeIframeAPIReady = init;
      }

      timer.current = setInterval(() => {
        if (playerRef.current?.getCurrentTime) {
          try {
            callbacks.current.onTimeUpdate(
              playerRef.current.getCurrentTime() || 0,
              playerRef.current.getDuration() || 0
            );
          } catch {}
        }
      }, 700);

      return () => {
        if (timer.current) clearInterval(timer.current);
        try {
          playerRef.current?.destroy?.();
        } catch {}
        playerRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (!ready || !currentVideoId || !playerRef.current?.cueVideoById || loaded.current === currentVideoId) return;
      loaded.current = currentVideoId;
      try {
        playerRef.current.cueVideoById({ videoId: currentVideoId, startSeconds: 0 });
      } catch {}
    }, [currentVideoId, ready]);

    useEffect(() => {
      if (ready) {
        try {
          playerRef.current?.setVolume?.(volume);
        } catch {}
      }
    }, [volume, ready]);

    return (
      /* Background audio engine container positioned in viewport with minimal dimension to prevent engine discarding */
      <div
        id="pure-audio-engine"
        className="fixed bottom-0 right-0 w-[4px] h-[4px] opacity-[0.01] pointer-events-none -z-50 overflow-hidden"
        aria-hidden="true"
      >
        <div id={containerId.current} className="w-full h-full" />
      </div>
    );
  }
);
