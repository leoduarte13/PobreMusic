import type { VercelRequest, VercelResponse } from '@vercel/node';

function extractVideoId(input: string): string | null {
  const m = String(input || '').match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
  return m?.[1] || (/^[\w-]{11}$/.test(String(input || '').trim()) ? String(input).trim() : null);
}

function clean(text: string) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\[(official|music video|audio|lyrics?)\]/gi, '')
    .replace(/\((official|official video|official audio|lyrics?|visualizer|audio)\)/gi, '')
    .trim();
}

function score(title: string, query: string, artist: string) {
  const t = clean(title).toLowerCase();
  const q = clean(query).toLowerCase();
  const a = clean(artist).toLowerCase();
  let s = 0;
  if (t.includes(q)) s += 50;
  const words = q.split(/\s+/).filter(w => w.length > 2);
  for (const w of words) if (t.includes(w)) s += 5;
  if (a && t.includes(a)) s += 20;
  if (/official|topic|vevo|audio|lyrics/i.test(title)) s += 4;
  if (/cover|karaoke|reaction|sped up|slowed|8d|nightcore|remix/i.test(title)) s -= 18;
  return s;
}

async function youtubeApi(query: string, artist: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const search = `${query} ${artist}`.trim();
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(search)}&key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data: any = await r.json();
  const items = Array.isArray(data.items) ? data.items : [];
  const ranked = items
    .map((item: any) => ({
      videoId: item?.id?.videoId,
      title: item?.snippet?.title || search,
      channelTitle: item?.snippet?.channelTitle || '',
    }))
    .filter((x: any) => x.videoId)
    .sort((x: any, y: any) => score(y.title, search, artist) - score(x.title, search, artist));
  return ranked[0] || null;
}

async function youtubePage(query: string, artist: string) {
  const search = `${query} ${artist}`.trim();
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (!r.ok) return null;
  const html = await r.text();
  const ids = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(m => m[1]);
  const unique = [...new Set(ids)];
  if (!unique.length) return null;
  return { videoId: unique[0], title: search, channelTitle: 'YouTube' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso: false, error: 'Método não permitido.' });

  const nomeMusica = String(req.query.nome_musica || '').trim();
  const nomeArtista = String(req.query.nome_artista || '').trim();
  const query = String(req.query.q || `${nomeMusica} ${nomeArtista}`).trim();
  if (!query) return res.status(400).json({ sucesso: false, error: 'Termo de busca não informado.' });

  try {
    const result = await youtubeApi(nomeMusica || query, nomeArtista);
    const fallback = result || await youtubePage(nomeMusica || query, nomeArtista);
    if (!fallback?.videoId) return res.status(404).json({ sucesso: false, error: `Nenhum vídeo encontrado para ${query}.` });
    return res.status(200).json({ sucesso: true, query, videoId: extractVideoId(fallback.videoId) || fallback.videoId, titulo: fallback.title, canal: fallback.channelTitle, origem: result ? 'youtube_data_api_v3' : 'youtube_search_page' });
  } catch (error: any) {
    console.error('YouTube search error:', error);
    return res.status(502).json({ sucesso: false, error: 'Falha ao pesquisar no YouTube.', details: error?.message || String(error) });
  }
}
