import type { VercelRequest, VercelResponse } from '@vercel/node';

const API = 'https://api.audius.co/v1';

function headers() {
  const key = String(process.env.AUDIUS_API_KEY || '').trim();
  return { Accept: 'application/json', ...(key ? { 'X-API-Key': key } : {}) };
}

async function audius(path: string) {
  const r = await fetch(`${API}${path}`, { headers: headers(), cache: 'no-store' });
  const text = await r.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(data?.message || data?.error || `Audius ${r.status}`);
  return data;
}

function trackToPobre(t: any) {
  const artist = t?.user?.name || t?.user?.handle || 'Artista';
  const cover = t?.artwork?.['480x480'] || t?.artwork?.['150x150'] || t?.artwork?.['1000x1000'] || '';
  return {
    id: String(t?.id || ''),
    nome_musica: String(t?.title || 'Sem título'),
    nome_artista: String(artist),
    album: 'Audius',
    capa: cover,
    duracao_ms: Number(t?.duration || 0) * 1000,
    audioUrl: `/api/audius?stream=${encodeURIComponent(String(t?.id || ''))}`,
    origem: 'audius',
    audius_id: String(t?.id || ''),
    sourceUrl: t?.permalink ? `https://audius.co${t.permalink}` : '',
    isStreamable: t?.isStreamable !== false,
  };
}

async function search(q: string) {
  const data = await audius(`/tracks/search?query=${encodeURIComponent(q)}&limit=10&sort_method=relevant`);
  return Array.isArray(data?.data) ? data.data.filter((t: any) => t?.isStreamable !== false).map(trackToPobre) : [];
}

async function stream(id: string) {
  const r = await fetch(`${API}/tracks/${encodeURIComponent(id)}/stream`, { headers: headers(), redirect: 'manual' });
  if (r.status < 300 || r.status >= 400) {
    const text = await r.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    throw new Error(data?.message || data?.error || `Audius stream ${r.status}`);
  }
  const location = r.headers.get('location');
  if (!location) throw new Error('Audius não retornou uma URL de áudio.');
  return location;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso: false, error: 'Método não permitido.' });

  try {
    if (!process.env.AUDIUS_API_KEY) {
      return res.status(503).json({ sucesso: false, error: 'Audius ainda não configurado. Adicione AUDIUS_API_KEY nas variáveis do Vercel.' });
    }
    const streamId = typeof req.query.stream === 'string' ? req.query.stream.trim() : '';
    if (streamId) {
      const location = await stream(streamId);
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.setHeader('Location', location);
      return res.status(302).end();
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).json({ sucesso: false, error: 'Informe q.' });
    const tracks = await search(q);
    return res.status(200).json({ sucesso: true, origem: 'audius', tracks });
  } catch (error: any) {
    console.error('Audius error:', error);
    return res.status(502).json({ sucesso: false, error: error?.message || String(error) });
  }
}
