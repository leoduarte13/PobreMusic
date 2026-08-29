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
    if (track?.audioUrl || track?.previewUrl) {
      const url = track.audioUrl || track.previewUrl || "";
      if (audio.src !== url) {
        audio.src = url;
        audio.load();
        void audio.play().catch(() => callbacks.current.onStatusChange("paused"));
      }
      if ("mediaSession" in navigator && "MediaMetadata" in window) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.nome_musica,
            artist: track.nome_artista,
            album: track.album || "PobreMusic",
            artwork: track.capa ? [{ src: track.capa, sizes: "512x512", type: "image/jpeg" }] : [],
          });
          navigator.mediaSession.playbackState = "playing";
          const handlers: [string, () => void][] = [
            ["play", () => void audio.play()],
            ["pause", () => audio.pause()],
            ["seekbackward", () => { audio.currentTime = Math.max(0, audio.currentTime - 10); }],
            ["seekforward", () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); }],
            ["previoustrack", () => window.dispatchEvent(new CustomEvent("pobremusic:previous"))],
            ["nexttrack", () => window.dispatchEvent(new CustomEvent("pobremusic:next"))],
          ];
          handlers.forEach(([action, handler]) => { try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler); } catch {} });
        } catch {}
      }
    }
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
