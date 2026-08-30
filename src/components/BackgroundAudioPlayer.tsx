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

// Generate a valid 2-second silent WAV as base64 URL with proper WAV headers
const createSilentAudioUrl = (): string => {
  // 1-second 44.1kHz 16-bit stereo PCM silence
  const sampleRate = 44100;
  const numChannels = 2;
  const bytesPerSample = 2;
  const numSamples = sampleRate * 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
};

let cachedSilentUrl: string | null = null;
const getSilentUrl = () => {
  if (!cachedSilentUrl && typeof window !== "undefined") {
    try {
      cachedSilentUrl = createSilentAudioUrl();
    } catch {
      cachedSilentUrl = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    }
  }
  return cachedSilentUrl || "";
};

const BackgroundAudioPlayer = forwardRef<BackgroundAudioPlayerRef, Props>(function BackgroundAudioPlayer(
  { volume, isPlaying, onStatusChange, onTimeUpdate, onEnded, onError },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isAnchorModeRef = useRef<boolean>(false);
  const wakeLockRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

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

  // User gesture unlock for AudioContext and background pipeline on mobile devices
  useEffect(() => {
    const unlockAudio = () => {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }
      if (audioRef.current && !audioRef.current.src) {
        audioRef.current.src = getSilentUrl();
        audioRef.current.load();
      }
    };

    window.addEventListener("click", unlockAudio, { once: true, passive: true });
    window.addEventListener("touchstart", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true, passive: true });

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // Web Audio continuous inaudible hardware engine to maintain OS audio focus on mobile
  const startWebAudioAnchor = () => {
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }

      if (audioContextRef.current) {
        if (audioContextRef.current.state === "suspended") {
          void audioContextRef.current.resume();
        }

        if (!oscillatorRef.current && !gainNodeRef.current) {
          const osc = audioContextRef.current.createOscillator();
          const gain = audioContextRef.current.createGain();

          // Sub-audible frequency (10Hz) at near-zero gain (0.0001) keeps hardware pipeline active
          osc.type = "sine";
          osc.frequency.setValueAtTime(10, audioContextRef.current.currentTime);
          gain.gain.setValueAtTime(0.0001, audioContextRef.current.currentTime);

          osc.connect(gain);
          gain.connect(audioContextRef.current.destination);

          osc.start();
          oscillatorRef.current = osc;
          gainNodeRef.current = gain;
        }
      }
    } catch (e) {
      console.warn("[BackgroundAudio] WebAudio anchor error:", e);
    }
  };

  const stopWebAudioAnchor = () => {
    try {
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
        oscillatorRef.current = null;
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
      }
    } catch {}
  };

  // Screen WakeLock Management
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && typeof (navigator as any).wakeLock?.request === "function") {
        if (!wakeLockRef.current) {
          const lock = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current = lock;
          lock.addEventListener?.("release", () => {
            wakeLockRef.current = null;
          });
        }
      }
    } catch {}
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release?.().catch(() => {});
      } catch {}
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    if (isPlaying) {
      startWebAudioAnchor();
      void requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isPlaying) {
        void requestWakeLock();
        if (audioContextRef.current?.state === "suspended") {
          void audioContextRef.current.resume();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseWakeLock();
    };
  }, [isPlaying]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        startWebAudioAnchor();
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
        startWebAudioAnchor();
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
        startWebAudioAnchor();
        const audio = audioRef.current;
        if (!audio) return;
        isAnchorModeRef.current = true;
        const silentUrl = getSilentUrl();
        if (audio.src !== silentUrl) {
          audio.src = silentUrl;
        }
        audio.loop = true;
        void audio.play().catch(() => {});
      },
      stopBackgroundAnchor: () => {
        stopWebAudioAnchor();
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

  // Sync volume to HTML5 audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  // Direct Audio Element Listeners
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

  return (
    <audio
      ref={audioRef}
      playsInline
      preload="auto"
      className="hidden"
      aria-hidden="true"
    />
  );
});

export default BackgroundAudioPlayer;
