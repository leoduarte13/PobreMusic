// Silent audio loop generator (1-second silent WAV base64)
// Playing an HTML5 <audio> tag is recognized by mobile OS browsers (Chrome/Safari/Samsung)
// as an active media session, which prevents the browser from sleeping or pausing when the screen locks.
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let silentAudioElement: HTMLAudioElement | null = null;
let wakeLockSentinel: any = null;

export async function requestScreenWakeLock(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      if (!wakeLockSentinel) {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
      }
    } catch {
      // Wake lock can fail if battery saver is active or tab is not active
    }
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

export function startBackgroundAudioKeeper(): void {
  if (typeof window === 'undefined') return;
  if (!silentAudioElement) {
    silentAudioElement = new Audio(SILENT_WAV);
    silentAudioElement.loop = true;
    silentAudioElement.volume = 0.01; // tiny volume so mobile browsers keep audio pipeline alive
  }
  silentAudioElement.play().catch(() => {
    // Autoplay will be unlocked upon the user's first touch/click
  });
  requestScreenWakeLock();
}

export function pauseBackgroundAudioKeeper(): void {
  if (silentAudioElement) {
    silentAudioElement.pause();
  }
  releaseScreenWakeLock();
}
