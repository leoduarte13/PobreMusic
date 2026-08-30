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

  // Manage Screen WakeLock during active playback
  useEffect(() => {
    let released = false;
    if (isPlaying && "wakeLock" in navigator && typeof (navigator as any).wakeLock?.request === "function") {
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

  // Direct Audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      if (!isAnchorModeRef.current) {
        callbacks.current.onStatusChange("playing");
      }
    };
    const handlePause = () => {
      if (!isAnchorModeRef.current) {
        callbacks.current.onStatusChange("paused");
      }
    };
    const handleWaiting = () => {
      if (!isAnchorModeRef.current) {
        callbacks.current.onStatusChange("buffering");
      }
    };
    const handleEnded = () => {
      if (!isAnchorModeRef.current) {
        callbacks.current.onEnded();
      }
    };
    const handleError = () => {
      if (!isAnchorModeRef.current) {
        callbacks.current.onError();
      }
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
    audio.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("playing", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, []);

  // Listen for background visibility change to ensure lockscreen wake-up
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isPlaying) {
        if (!isAnchorModeRef.current && audioRef.current && audioRef.current.paused) {
          void audioRef.current.play().catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
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
