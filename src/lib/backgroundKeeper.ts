// Background Audio & WakeLock Engine
// Solves mobile browser background audio suspensions on Chrome/Android and Safari/iOS

export const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let silentAudioElement: HTMLAudioElement | null = null;
let wakeLockSentinel: any = null;
let audioContext: AudioContext | null = null;
let isAudioKeeperActive = false;

// -------------------------------------------------------------
// SCREEN WAKE LOCK (Impede a tela de desligar no celular)
// -------------------------------------------------------------

export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }
  try {
    if (!wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    }
    return true;
  } catch {
    // Wake lock can fail if battery saver is on or document is hidden
    return false;
  }
}

export function releaseScreenWakeLock(): void {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

export function isWakeLockActive(): boolean {
  return !!wakeLockSentinel;
}

export async function toggleScreenWakeLock(): Promise<boolean> {
  if (wakeLockSentinel) {
    releaseScreenWakeLock();
    return false;
  } else {
    return await requestScreenWakeLock();
  }
}

// -------------------------------------------------------------
// BACKGROUND AUDIO KEEPER (Mantém a pipeline de áudio viva)
// -------------------------------------------------------------

export function startBackgroundAudioKeeper(): void {
  if (typeof window === 'undefined') return;
  isAudioKeeperActive = true;

  // 1. Silent HTML5 audio tag in a continuous loop
  if (!silentAudioElement) {
    silentAudioElement = new Audio(SILENT_WAV);
    silentAudioElement.loop = true;
    silentAudioElement.volume = 0.001; // tiny volume so mobile browsers allocate OS audio session
  }

  silentAudioElement.play().catch(() => {
    // Unlocked by user click/tap
  });

  // 2. Web Audio API oscillator keepalive
  try {
    if (!audioContext || audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        gain.gain.value = 0.0001; // Inaudible
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
      }
    } else if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  } catch {}

  // 3. Keep screen alive
  requestScreenWakeLock();
}

export function pauseBackgroundAudioKeeper(): void {
  isAudioKeeperActive = false;
  if (silentAudioElement) {
    silentAudioElement.pause();
  }
  if (audioContext && audioContext.state === 'running') {
    try {
      audioContext.suspend();
    } catch {}
  }
  releaseScreenWakeLock();
}

export function isBackgroundAudioActive(): boolean {
  return isAudioKeeperActive;
}

// Re-request wake lock automatically if the tab regains visibility while music was playing
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isAudioKeeperActive) {
      requestScreenWakeLock();
    }
  });
}
