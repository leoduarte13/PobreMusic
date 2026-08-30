import type { VercelRequest, VercelResponse } from '@vercel/node';

// Keep a small, current set of public Piped backends. The first one is the
// official instance; the others are fallbacks when an instance is unavailable.
const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.lunar.icu',
  'https://api.piped.privacydev.net',
  'https://pipedapi.drgns.space',
  'https://pipedapi.vyper.me',
  'https://pipedapi.looleh.xyz'
];

function pickAudio(streams: any[]) {
  const valid = streams.filter((s: any) =>
    s?.url && /^https?:\/\//i.test(String(s.url)) && s?.videoOnly !== true
  );
  valid.sort((a: any, b: any) => {
    const bitrate = Number(b.bitrate || 0) - Number(a.bitrate || 0);
    if (bitrate) return bitrate;
    return Number(b.contentLength || 0) - Number(a.contentLength || 0);
  });
  return valid.find((s: any) => /^audio\/mp4/i.test(String(s.mimeType || '')))
    || valid.find((s: any) => /^audio\//i.test(String(s.mimeType || '')))
    || valid[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso: false, error: 'Método não permitido.' });

  const videoId = String(req.query.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ sucesso: false, error: 'videoId inválido.' });
  }

  let lastError = '';
  for (const instance of INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const r = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!r.ok) {
        lastError = `${instance}: HTTP ${r.status}`;
        continue;
      }

      const data: any = await r.json();
      const preferred = pickAudio(Array.isArray(data.audioStreams) ? data.audioStreams : []);
      if (!preferred) {
        lastError = `${instance}: sem áudio disponível`;
        continue;
      }

      return res.status(200).json({
        sucesso: true,
        url: String(preferred.url),
        mimeType: String(preferred.mimeType || 'audio/mp4'),
        codec: String(preferred.codec || ''),
        bitrate: Number(preferred.bitrate || 0),
        quality: String(preferred.quality || ''),
        duration: Number(data.duration || 0),
        origem: 'piped',
        instancia: instance
      });
    } catch (error: any) {
      lastError = `${instance}: ${String(error?.message || error)}`;
    }
  }

  return res.status(502).json({
    sucesso: false,
    error: 'Não foi possível obter uma fonte de áudio para esta música agora.',
    details: lastError
  });
}
