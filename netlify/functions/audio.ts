import type { Handler } from '@netlify/functions';

const FALLBACK_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services'
];

export const handler: Handler = async (event) => {
  const params = event.queryStringParameters || {};
  const videoId = String(params.videoId || '').trim();

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'videoId inválido.' })
    };
  }

  for (const instance of FALLBACK_INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const meta = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'PobreMusic/1.0' },
        signal: controller.signal
      });
      if (!meta.ok) continue;
      const data: any = await meta.json();
      const streams: any[] = Array.isArray(data.audioStreams) ? data.audioStreams : [];
      const valid = streams.filter(s => s?.url && /^https?:\/\//i.test(String(s.url)));
      valid.sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      const chosen = valid.find(s => /^audio\/mp4/i.test(String(s.mimeType || ''))) || valid[0];
      if (!chosen?.url) continue;

      // Redirect directly to the chosen audio stream URL for high efficiency on serverless
      return {
        statusCode: 302,
        headers: {
          'Location': chosen.url,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
        body: ''
      };
    } catch {
      clearTimeout(timeout);
    }
  }

  return {
    statusCode: 502,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: 'Nenhuma fonte de áudio disponível no momento.' })
  };
};
