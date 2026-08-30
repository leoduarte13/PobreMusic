import type { VercelRequest, VercelResponse } from '@vercel/node';

const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.lunar.icu',
  'https://api.piped.privacydev.net',
  'https://pipedapi.drgns.space',
  'https://pipedapi.vyper.me',
  'https://api.looleh.xyz'
];

function pickAudio(streams: any[]) {
  const valid = streams.filter((s: any) => s?.url && /^https?:\/\//i.test(String(s.url)) && s?.videoOnly !== true);
  valid.sort((a: any, b: any) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
  return valid.find((s: any) => /^audio\/mp4/i.test(String(s.mimeType || '')))
    || valid.find((s: any) => /^audio\//i.test(String(s.mimeType || '')))
    || valid[0];
}

async function resolve(videoId: string, range?: string) {
  let last = '';
  for (const instance of INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const meta = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!meta.ok) { last = `${instance}: metadata HTTP ${meta.status}`; continue; }
      const data: any = await meta.json();
      const audio = pickAudio(Array.isArray(data.audioStreams) ? data.audioStreams : []);
      if (!audio?.url) { last = `${instance}: sem áudio`; continue; }

      const headers: Record<string,string> = { Accept: 'audio/mp4,audio/*;q=0.9,*/*;q=0.1' };
      if (range) headers.Range = range;
      const upstream = await fetch(String(audio.url), { headers, signal: controller.signal });
      if (!upstream.ok && upstream.status !== 206) { last = `${instance}: áudio HTTP ${upstream.status}`; continue; }
      return { upstream, mime: String(audio.mimeType || 'audio/mp4'), bitrate: Number(audio.bitrate || 0) };
    } catch (e: any) {
      last = `${instance}: ${String(e?.message || e)}`;
    } finally { clearTimeout(timeout); }
  }
  throw new Error(last || 'Nenhuma fonte de áudio disponível.');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();

  const videoId = String(req.query.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ error: 'videoId inválido.' });

  try {
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const { upstream, mime } = await resolve(videoId, range);
    res.status(upstream.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    const length = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    if (length) res.setHeader('Content-Length', length);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (req.method === 'HEAD') return res.end();
    if (!upstream.body) return res.end();

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    res.end();
  } catch (e: any) {
    if (!res.headersSent) res.status(502).json({ error: 'Não foi possível iniciar o áudio.', details: String(e?.message || e) });
    else res.end();
  }
}
