import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PlaybackStatus, Track } from "../types";

export interface BackgroundAudioPlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadAudio: (url: string, autoplay?: boolean) => void;
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
  const requestedPlay = useRef(false);
  useEffect(() => { callbacks.current = { onStatusChange, onTimeUpdate, onEnded, onError }; });

  useImperativeHandle(ref, () => ({
    play: () => { requestedPlay.current = true; void audioRef.current?.play(); },
    pause: () => { requestedPlay.current = false; audioRef.current?.pause(); },
    seekTo: (seconds) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, seconds); },
    setVolume: (value) => { if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, value / 100)); },
    getCurrentTime: () => audioRef.current?.currentTime || 0,
    getDuration: () => audioRef.current?.duration || 0,
    loadAudio: (url, autoplay = false) => {
      const audio = audioRef.current;
      if (!audio) return;
      requestedPlay.current = autoplay;
      audio.pause();
      audio.src = url;
      audio.load();
      if (autoplay) void audio.play().catch(() => callbacks.current.onStatusChange("paused"));
    },
  }), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  // This component is deliberately passive when the selected track changes.
  // It must never autoplay a Spotify/YouTube preview merely because a playlist was loaded.
  // Native background playback is only started by an explicit user play action through loadAudio(url, true).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track?.audioUrl) return;
    if (audio.src !== track.audioUrl) {
      audio.pause();
      requestedPlay.current = false;
      audio.src = track.audioUrl;
      audio.load();
    }
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.nome_musica,
        artist: track.nome_artista,
        album: track.album || "PobreMusic",
        artwork: track.capa ? [{ src: track.capa, sizes: "512x512", type: "image/jpeg" }] : [],
      });
      const handlers: [MediaSessionAction, () => void][] = [
        ["play", () => { requestedPlay.current = true; void audio.play(); }],
        ["pause", () => { requestedPlay.current = false; audio.pause(); }],
        ["seekbackward", () => { audio.currentTime = Math.max(0, audio.currentTime - 10); }],
        ["seekforward", () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); }],
        ["previoustrack", () => window.dispatchEvent(new CustomEvent("pobremusic:previous"))],
        ["nexttrack", () => window.dispatchEvent(new CustomEvent("pobremusic:next"))],
      ];
      for (const [action, handler] of handlers) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
    } catch {}
  }, [track?.audioUrl, track?.nome_musica, track?.nome_artista, track?.album, track?.capa]);

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

  return <audio ref={audioRef} preload="none" playsInline style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none", bottom: 0, left: 0 }} aria-label="PobreMusic áudio" />;
});

export default BackgroundAudioPlayer;
