import type { VercelRequest, VercelResponse } from '@vercel/node';

const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
  'https://api-piped.mha.fi',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.qdi.fi',
  'https://piped-api.hostux.net',
  'https://pdapi.vern.cc',
  'https://pipedapi.pfcd.me',
  'https://api.piped.yt',
  'https://pipedapi.osphost.fi',
  'https://pipedapi.simpleprivacy.fr',
  'https://pipedapi.drgns.space'
];

function pickAudio(streams: any[]) {
  const valid = streams.filter((s: any) => s?.url && /^https?:\/\//i.test(String(s.url)) && s?.videoOnly !== true);
  valid.sort((a: any, b: any) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
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
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ sucesso: false, error: 'videoId inválido.' });

  let lastError = '';
  for (const instance of INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!r.ok) { lastError = `${instance}: HTTP ${r.status}`; continue; }
      const data: any = await r.json();
      const preferred = pickAudio(Array.isArray(data.audioStreams) ? data.audioStreams : []);
      if (!preferred) { lastError = `${instance}: sem áudio disponível`; continue; }
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
    } finally {
      clearTimeout(timeout);
    }
  }

  return res.status(502).json({ sucesso: false, error: 'Não foi possível obter uma fonte de áudio para esta música agora.', details: lastError });
}
