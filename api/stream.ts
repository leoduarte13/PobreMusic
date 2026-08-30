import type { VercelRequest, VercelResponse } from '@vercel/node';

const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee'
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso:false, error:'Método não permitido.' });

  const videoId = String(req.query.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ sucesso:false, error:'videoId inválido.' });

  let lastError = '';
  for (const instance of INSTANCES) {
    try {
      const r = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) { lastError = `${instance}: HTTP ${r.status}`; continue; }
      const data: any = await r.json();
      const streams = Array.isArray(data.audioStreams) ? data.audioStreams : [];
      const valid = streams.filter((s:any) => s?.url && /^https?:\/\//i.test(s.url));
      valid.sort((a:any,b:any) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      const preferred = valid.find((s:any) => /audio\/(mp4|mpeg|aac)/i.test(String(s.mimeType || '')))
        || valid.find((s:any) => /audio\//i.test(String(s.mimeType || '')))
        || valid[0];
      if (!preferred) { lastError = `${instance}: sem áudio disponível`; continue; }
      return res.status(200).json({
        sucesso:true,
        url:preferred.url,
        mimeType:preferred.mimeType || 'audio/mp4',
        bitrate:Number(preferred.bitrate || 0),
        quality:String(preferred.quality || ''),
        duration:Number(data.duration || 0),
        origem:'piped'
      });
    } catch (error:any) {
      lastError = String(error?.message || error);
    }
  }
  return res.status(502).json({ sucesso:false, error:'Não foi possível obter o áudio desta música agora.', details:lastError });
}
