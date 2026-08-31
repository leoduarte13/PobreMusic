// Global YouTube IFrame API declaration for TypeScript
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

let isApiLoading = false;
let isApiReady = false;
const readyCallbacks: Array<() => void> = [];

export function loadYouTubeAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    readyCallbacks.push(resolve);

    if (!isApiLoading) {
      isApiLoading = true;
      const originalReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        isApiReady = true;
        if (originalReady) originalReady();
        while (readyCallbacks.length > 0) {
          const cb = readyCallbacks.shift();
          if (cb) cb();
        }
      };

      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  });
}
