import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PlaybackStatus, Track } from "../types";

export interface BackgroundAudioPlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadAudio: (url: string) => void;
}

interface Props {
  track: Track | null;
  volume: number;
  onStatusChange: (status: PlaybackStatus) => void;
  onTimeUpdate: (current: number, duration: number) => void;
  onEnded: () => void;
  onError: () => void;
}

const BackgroundAudioPlayer = forwardRef<BackgroundAudioPlayerRef, Props>(function BackgroundAudioPlayer({ track, volume, onStatusChange, onTimeUpdate, onEnded, onError }, ref) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callbacks = useRef({ onStatusChange, onTimeUpdate, onEnded, onError });
  const requestId = useRef(0);
  useEffect(() => { callbacks.current = { onStatusChange, onTimeUpdate, onEnded, onError }; });

  useImperativeHandle(ref, () => ({
    play: () => { void audioRef.current?.play(); },
    pause: () => audioRef.current?.pause(),
    seekTo: (seconds) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, seconds); },
    setVolume: (value) => { if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, value / 100)); },
    getCurrentTime: () => audioRef.current?.currentTime || 0,
    getDuration: () => audioRef.current?.duration || 0,
    loadAudio: (url) => { if (audioRef.current) { audioRef.current.src = url; audioRef.current.load(); void audioRef.current.play(); } },
  }), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    let cancelled = false;
    const currentRequest = ++requestId.current;

    const configureMediaSession = () => {
      if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.nome_musica,
          artist: track.nome_artista,
          album: track.album || "PobreMusic",
          artwork: track.capa ? [{ src: track.capa, sizes: "512x512", type: "image/jpeg" }] : [],
        });
        const handlers: [MediaSessionAction, () => void][] = [
          ["play", () => void audio.play()],
          ["pause", () => audio.pause()],
          ["seekbackward", () => { audio.currentTime = Math.max(0, audio.currentTime - 10); }],
          ["seekforward", () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); }],
          ["previoustrack", () => window.dispatchEvent(new CustomEvent("pobremusic:previous"))],
          ["nexttrack", () => window.dispatchEvent(new CustomEvent("pobremusic:next"))],
        ];
        for (const [action, handler] of handlers) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
      } catch {}
    };

    const start = async () => {
      let url = track.audioUrl || track.previewUrl || "";
      if (!url) {
        callbacks.current.onStatusChange("buffering");
        try {
          const response = await fetch(`/api/jamendo-search?nome_musica=${encodeURIComponent(track.nome_musica)}&nome_artista=${encodeURIComponent(track.nome_artista)}`, { signal: AbortSignal.timeout(9000) });
          if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
            const data = await response.json();
            if (data?.sucesso && typeof data.audioUrl === "string") url = data.audioUrl;
          }
        } catch {}
      }
      if (cancelled || currentRequest !== requestId.current || !url) {
        if (!url && !cancelled) callbacks.current.onError();
        return;
      }
      configureMediaSession();
      if (audio.src !== url) {
        audio.src = url;
        audio.load();
      }
      try {
        await audio.play();
      } catch {
        callbacks.current.onStatusChange("paused");
      }
    };

    void start();
    return () => { cancelled = true; audio.pause(); audio.removeAttribute("src"); audio.load(); };
  }, [track?.audioUrl, track?.previewUrl, track?.nome_musica, track?.nome_artista, track?.album, track?.capa]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const play = () => { callbacks.current.onStatusChange("playing"); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; };
    const pause = () => { callbacks.current.onStatusChange("paused"); if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; };
    const waiting = () => callbacks.current.onStatusChange("buffering");
    const ended = () => callbacks.current.onEnded();
    const error = () => callbacks.current.onError();
    const time = () => callbacks.current.onTimeUpdate(audio.currentTime, audio.duration || 0);
    audio.addEventListener("play", play); audio.addEventListener("playing", play); audio.addEventListener("pause", pause); audio.addEventListener("waiting", waiting); audio.addEventListener("ended", ended); audio.addEventListener("error", error); audio.addEventListener("timeupdate", time);
    return () => { audio.removeEventListener("play", play); audio.removeEventListener("playing", play); audio.removeEventListener("pause", pause); audio.removeEventListener("waiting", waiting); audio.removeEventListener("ended", ended); audio.removeEventListener("error", error); audio.removeEventListener("timeupdate", time); };
  }, []);

  useEffect(() => {
    const previous = () => callbacks.current.onTimeUpdate(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0);
    const next = () => callbacks.current.onEnded();
    window.addEventListener("pobremusic:previous", previous); window.addEventListener("pobremusic:next", next);
    return () => { window.removeEventListener("pobremusic:previous", previous); window.removeEventListener("pobremusic:next", next); };
  }, []);

  return <audio ref={audioRef} preload="auto" playsInline style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none", bottom: 0, left: 0 }} aria-label="PobreMusic áudio" />;
});

export default BackgroundAudioPlayer;
