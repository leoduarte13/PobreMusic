import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Track } from "../types";

export interface BackgroundAudioRef {
  play: () => Promise<void>;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  load: (track: Track) => void;
}

interface Props {
  track: Track | null;
  playing: boolean;
  volume: number;
  onPlaying: () => void;
  onPaused: () => void;
  onTime: (current: number, duration: number) => void;
  onEnded: () => void;
  onError: () => void;
}

export const BackgroundAudioEngine = forwardRef<BackgroundAudioRef, Props>(({ track, playing, volume, onPlaying, onPaused, onTime, onEnded, onError }, ref) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.playsInline = true;
    audioRef.current = audio;
    const time = () => onTime(audio.currentTime || 0, Number.isFinite(audio.duration) ? audio.duration : (track?.duracao_ms || 0) / 1000);
    const ended = () => onEnded();
    const error = () => onError();
    audio.addEventListener("timeupdate", time);
    audio.addEventListener("durationchange", time);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPaused);
    audio.addEventListener("ended", ended);
    audio.addEventListener("error", error);
    return () => { audio.pause(); audio.removeAttribute("src"); audio.load(); audio.removeEventListener("timeupdate", time); audio.removeEventListener("durationchange", time); audio.removeEventListener("playing", onPlaying); audio.removeEventListener("pause", onPaused); audio.removeEventListener("ended", ended); audio.removeEventListener("error", error); };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    const source = track.audioUrl || track.previewUrl;
    if (!source) return;
    if (audio.src !== source) {
      audio.src = source;
      audio.load();
      if (playing) void audio.play().catch(() => {});
    }
  }, [track?.audioUrl, track?.previewUrl, track?.nome_musica, playing]);

  useEffect(() => { const audio = audioRef.current; if (!audio) return; audio.volume = Math.max(0, Math.min(1, volume / 100)); if (playing && audio.src) void audio.play().catch(() => {}); if (!playing) audio.pause(); }, [playing, volume]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({ title: track.nome_musica || "Música", artist: track.nome_artista || "PobreMusic", album: track.album || "PobreMusic", artwork: track.capa ? [{ src: track.capa, sizes: "512x512", type: "image/jpeg" }] : [] });
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => { try { ms.setActionHandler(action, handler); } catch {} };
    set("play", () => { void audioRef.current?.play(); }); set("pause", () => audioRef.current?.pause());
    set("seekbackward", () => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); });
    set("seekforward", () => { if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || Infinity, audioRef.current.currentTime + 10); });
    try { ms.setPositionState({ duration: Math.max(audioRef.current?.duration || track.duracao_ms / 1000 || 0.1, 0.1), position: Math.min(audioRef.current?.currentTime || 0, Math.max(audioRef.current?.duration || track.duracao_ms / 1000 || 0.1, 0.1)), playbackRate: 1 }); } catch {}
    ms.playbackState = playing ? "playing" : "paused";
  }, [track, playing]);

  useImperativeHandle(ref, () => ({
    play: async () => { if (audioRef.current) await audioRef.current.play(); },
    pause: () => audioRef.current?.pause(),
    seekTo: seconds => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, seconds); },
    setVolume: v => { if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, v / 100)); },
    getCurrentTime: () => audioRef.current?.currentTime || 0,
    getDuration: () => audioRef.current?.duration || 0,
    load: t => { const source = t.audioUrl || t.previewUrl; if (audioRef.current && source) { audioRef.current.src = source; audioRef.current.load(); } }
  }), []);

  return null;
});
