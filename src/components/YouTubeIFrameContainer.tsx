import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { PlaybackStatus } from "../types";
import { Youtube, Maximize2, Minimize2, X, Play, Pause, Volume2, Pipette as PictureInPicture } from "lucide-react";

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
    const containerId = useRef(`yt-player-${Math.random().toString(36).substring(7)}`);
    const [ready, setReady] = useState(false);
    const [preview, setPreview] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [playing, setPlaying] = useState(false);
    const timer = useRef<any>(null);
    const lastEnded = useRef(0);
    const loaded = useRef<string>();
    const callbacks = useRef({ onStatusChange, onTimeUpdate, onTrackEnded, onError });

    useEffect(() => {
      callbacks.current = { onStatusChange, onTimeUpdate, onTrackEnded, onError };
    });

    useImperativeHandle(ref, () => ({
      play: () => playerRef.current?.playVideo?.(),
      pause: () => playerRef.current?.pauseVideo?.(),
      seekTo: (s) => playerRef.current?.seekTo?.(s, true),
      setVolume: (v) => playerRef.current?.setVolume?.(v),
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0,
      getDuration: () => playerRef.current?.getDuration?.() || 0,
      loadVideo: (id) => {
        if (!id) return;
        loaded.current = id;
        playerRef.current?.loadVideoById?.({ videoId: id, startSeconds: 0 });
      },
      cueVideo: (id) => {
        if (!id) return;
        loaded.current = id;
        playerRef.current?.cueVideoById?.(id);
      },
    }));

    const ended = () => {
      const n = Date.now();
      if (n - lastEnded.current < 1200) return;
      lastEnded.current = n;
      callbacks.current.onStatusChange("ended");
      callbacks.current.onTrackEnded();
    };

    useEffect(() => {
      const init = () => {
        if (!window.YT?.Player) return;
        playerRef.current = new window.YT.Player(containerId.current, {
          height: "202",
          width: "360",
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
                setPlaying(true);
                callbacks.current.onStatusChange("playing");
              } else if (e.data === 2) {
                setPlaying(false);
                callbacks.current.onStatusChange("paused");
              } else if (e.data === 3) {
                callbacks.current.onStatusChange("buffering");
              } else if (e.data === 0) {
                setPlaying(false);
                ended();
              } else if (e.data === 5) {
                callbacks.current.onStatusChange("cued");
              } else {
                setPlaying(false);
                callbacks.current.onStatusChange("unstarted");
              }
            },
            onError: (e: any) => callbacks.current.onError(e.data),
          },
        });
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
            onTimeUpdate(playerRef.current.getCurrentTime() || 0, playerRef.current.getDuration() || 0);
          } catch {}
        }
      }, 800);

      return () => {
        if (timer.current) clearInterval(timer.current);
        playerRef.current?.destroy?.();
        playerRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (!ready || !currentVideoId || !playerRef.current?.cueVideoById || loaded.current === currentVideoId) return;
      loaded.current = currentVideoId;
      playerRef.current.cueVideoById({ videoId: currentVideoId, startSeconds: 0 });
      setPlaying(false);
    }, [currentVideoId, ready]);

    useEffect(() => {
      if (ready) playerRef.current?.setVolume?.(volume);
    }, [volume, ready]);

    const toggle = () => {
      const s = playerRef.current?.getPlayerState?.();
      s === 1 ? playerRef.current?.pauseVideo?.() : playerRef.current?.playVideo?.();
    };

    return (
      <>
        <div
          className="fixed z-[70]"
          style={{
            width: preview ? (expanded ? 620 : 420) : 280,
            height: preview ? "auto" : 160,
            opacity: preview ? 1 : 0.01,
            pointerEvents: preview ? "auto" : "none",
            right: preview ? 24 : -9999,
            bottom: preview ? 90 : -9999,
            overflow: "hidden",
          }}
          aria-hidden={!preview}
        >
          <div className="rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-700 shadow-2xl">
            {preview && (
              <div className="flex items-center justify-between h-11 px-3 border-b border-zinc-800 bg-zinc-900/95">
                <div className="flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-semibold">Tocando agora</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white"
                  >
                    {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      setPreview(false);
                      setExpanded(false);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="w-full aspect-video bg-black">
              <div id={containerId.current} className="w-full h-full" />
            </div>
            {preview && (
              <div className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <Youtube className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">Música atual</div>
                    <div className="text-xs text-zinc-400">Reprodução contínua</div>
                  </div>
                  <button
                    onClick={toggle}
                    className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center"
                  >
                    {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>
                  <Volume2 className="w-4 h-4 text-zinc-500" />
                </div>
              </div>
            )}
          </div>
        </div>
        {currentVideoId && !preview && (
          <button
            onClick={() => setPreview(true)}
            className="fixed bottom-20 sm:bottom-24 right-3 sm:right-6 z-50 min-h-10 flex items-center gap-2 px-3.5 py-2 rounded-full bg-zinc-900/95 border border-zinc-700 text-xs font-semibold shadow-xl backdrop-blur-md pointer-events-auto"
          >
            <Play className="w-4 h-4 text-emerald-400 fill-current" />
            <span>Vídeo</span>
          </button>
        )}
      </>
    );
  }
);
