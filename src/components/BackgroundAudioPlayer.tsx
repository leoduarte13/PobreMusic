import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PlaybackStatus } from "../types";

export interface BackgroundAudioPlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadAudio: (url: string, autoplay?: boolean) => void;
  startBackgroundAnchor: () => void;
  stopBackgroundAnchor: () => void;
}

interface Props {
  volume: number;
  isPlaying: boolean;
  onStatusChange: (status: PlaybackStatus) => void;
  onTimeUpdate: (current: number, duration: number) => void;
  onEnded: () => void;
  onError: () => void;
}

// 1-second silent stereo WAV encoded in base64 to keep the mobile audio pipeline active
const SILENT_AUDIO_URI = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

const BackgroundAudioPlayer = forwardRef<BackgroundAudioPlayerRef, Props>(function BackgroundAudioPlayer(
  {
    volume,
    isPlaying,
    onStatusChange,
    onTimeUpdate,
    onEnded,
    onError,
  },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isAnchorModeRef = useRef<boolean>(false);
  const wakeLockRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const callbacks = useRef({
    onStatusChange,
    onTimeUpdate,
    onEnded,
    onError,
  });

  useEffect(() => {
    callbacks.current = {
      onStatusChange,
      onTimeUpdate,
      onEnded,
      onError,
    };
  });

  // Keep AudioContext active on mobile user interaction
  const ensureAudioContext = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }
    } catch {}
  };

  // Manage Screen WakeLock during active playback
  useEffect(() => {
    let released = false;
    if (isPlaying) {
      ensureAudioContext();
      if ("wakeLock" in navigator && typeof (navigator as any).wakeLock?.request === "function") {
        (navigator as any).wakeLock
          .request("screen")
          .then((lock: any) => {
            if (released) {
              lock?.release?.().catch(() => {});
            } else {
              wakeLockRef.current = lock;
            }
          })
          .catch(() => {});
      }
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
    }
    return () => {
      released = true;
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isPlaying]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        ensureAudioContext();
        const audio = audioRef.current;
        if (!audio) return;
        void audio.play().catch(() => {});
      },
      pause: () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
      },
      seekTo: (seconds) => {
        const audio = audioRef.current;
        if (audio && !isAnchorModeRef.current) {
          audio.currentTime = Math.max(0, seconds);
        }
      },
      setVolume: (value) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = Math.max(0, Math.min(1, value / 100));
      },
      getCurrentTime: () => {
        const audio = audioRef.current;
        return isAnchorModeRef.current ? 0 : audio?.currentTime || 0;
      },
      getDuration: () => {
        const audio = audioRef.current;
        return isAnchorModeRef.current ? 0 : audio?.duration || 0;
      },
      loadAudio: (url, autoplay = true) => {
        ensureAudioContext();
        const audio = audioRef.current;
        if (!audio) return;
        isAnchorModeRef.current = false;
        audio.loop = false;
        audio.pause();
        audio.src = url;
        audio.load();
        if (autoplay) {
          void audio.play().catch(() => callbacks.current.onStatusChange("paused"));
        }
      },
      startBackgroundAnchor: () => {
        ensureAudioContext();
        const audio = audioRef.current;
        if (!audio) return;
        isAnchorModeRef.current = true;
        if (audio.src !== SILENT_AUDIO_URI) {
          audio.src = SILENT_AUDIO_URI;
        }
        audio.loop = true;
        void audio.play().catch(() => {});
      },
      stopBackgroundAnchor: () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isAnchorModeRef.current) {
          isAnchorModeRef.current = false;
          audio.pause();
          audio.loop = false;
        }
      },
    }),
    []
  );

  // Volume synchronization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  // Direct Audio element event listeners and power suspension diagnostics
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const logState = (event: string, extra: Record<string, any> = {}) => {
      console.log(`[PobreMusic AudioEngine] Event: ${event}`, {
        visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
        isAnchorMode: isAnchorModeRef.current,
        currentTime: audio.currentTime,
        duration: audio.duration,
        paused: audio.paused,
        ended: audio.ended,
        audioContextState: audioContextRef.current?.state,
        timestamp: new Date().toISOString(),
        ...extra,
      });
    };

    const handlePlay = () => {
      logState("play");
      if (!isAnchorModeRef.current) {
        callbacks.current.onStatusChange("playing");
      }
    };
    const handlePause = () => {
      logState("pause", { reason: "Audio element paused" });
      if (!isAnchorModeRef.current) {
        callbacks.current.onStatusChange("paused");
      }
    };
    const handleWaiting = () => {
      logState("waiting (buffering)");
      if (!isAnchorModeRef.current) {
        callbacks.current.onStatusChange("buffering");
      }
    };
    const handleEnded = () => {
      logState("ended", { reason: "Audio track finished playback" });
      if (!isAnchorModeRef.current) {
        callbacks.current.onEnded();
      }
    };
    const handleError = (e: any) => {
      logState("error", { error: audio.error });
      if (!isAnchorModeRef.current) {
        callbacks.current.onError();
      }
    };
    const handleSuspend = () => {
      logState("suspend (browser paused media data download / energy saving)");
    };
    const handleStalled = () => {
      logState("stalled (media data fetch stalled)");
    };
    const handleTimeUpdate = () => {
      if (!isAnchorModeRef.current) {
        callbacks.current.onTimeUpdate(audio.currentTime, audio.duration || 0);
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("playing", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("suspend", handleSuspend);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("suspend", handleSuspend);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, []);

  // Listen for browser lifecycle & power suspension events (visibilitychange, freeze, resume, pagehide, pageshow)
  useEffect(() => {
    const handleVisibility = () => {
      const state = document.visibilityState;
      console.warn(`[PobreMusic Lifecycle] visibilitychange -> ${state} | isPlaying=${isPlaying} | AudioContext=${audioContextRef.current?.state}`);
      if (state === "visible" && isPlaying) {
        ensureAudioContext();
        if (!isAnchorModeRef.current && audioRef.current && audioRef.current.paused) {
          console.log("[PobreMusic Lifecycle] Resuming audio after returning to visible state");
          void audioRef.current.play().catch((err) => console.warn("[PobreMusic Lifecycle] Resume play error:", err));
        }
      }
    };

    const handleFreeze = () => {
      console.warn("[PobreMusic Lifecycle] 'freeze' event fired by browser! The page is being suspended for energy conservation.");
    };

    const handleResume = () => {
      console.log("[PobreMusic Lifecycle] 'resume' event fired by browser. Page unfrozen.");
      ensureAudioContext();
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      console.warn(`[PobreMusic Lifecycle] 'pagehide' event fired (persisted: ${e.persisted})`);
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      console.log(`[PobreMusic Lifecycle] 'pageshow' event fired (persisted: ${e.persisted})`);
      ensureAudioContext();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("freeze", handleFreeze);
    window.addEventListener("resume", handleResume);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("freeze", handleFreeze);
      window.removeEventListener("resume", handleResume);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [isPlaying]);

  return (
    <audio
      ref={audioRef}
      preload="auto"
      playsInline
      style={{
        position: "fixed",
        width: 1,
        height: 1,
        opacity: 0.01,
        pointerEvents: "none",
        bottom: 0,
        left: 0,
        zIndex: -1,
      }}
      aria-label="PobreMusic Background Audio Engine"
    />
  );
});

export default BackgroundAudioPlayer;
