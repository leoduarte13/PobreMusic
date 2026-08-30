import type { VercelRequest, VercelResponse } from '@vercel/node';

function normalize(text: string) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function clean(text: string) {
  return normalize(text).replace(/\b(official|video|music|audio|lyrics|hd|4k|topic|vevo)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function words(text: string) { return clean(text).split(' ').filter(w => w.length > 1); }
function score(title: string, query: string, artist: string) {
  const t = clean(title); const q = clean(query); const a = clean(artist);
  const tw = new Set(words(t)); const qw = words(q); let s = 0;
  if (t === q) s += 200;
  if (t.includes(q)) s += 100;
  for (const w of qw) if (tw.has(w)) s += 12;
  if (a && t.includes(a)) s += 90;
  const artistWords = words(a);
  if (artistWords.length && artistWords.every(w => tw.has(w))) s += 80;
  if (/official|topic|vevo|audio/i.test(title)) s += 10;
  if (/cover|karaoke|reaction|sped up|slowed|nightcore|8d|remix|live/i.test(title)) s -= 35;
  return s;
}

async function youtubeApi(query: string, artist: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(`${query} ${artist}`.trim())}&key=${encodeURIComponent(key)}`;
  const r = await fetch(url); if (!r.ok) return [];
  const data: any = await r.json();
  return (Array.isArray(data.items) ? data.items : []).map((item: any) => ({
    videoId: item?.id?.videoId, title: item?.snippet?.title || '', channelTitle: item?.snippet?.channelTitle || ''
  })).filter((x: any) => x.videoId);
}

async function youtubePage(query: string, artist: string) {
  const search = `${query} ${artist}`.trim();
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' }
  });
  if (!r.ok) return [];
  const html = await r.text();
  const candidates: {videoId:string; title:string; channelTitle:string}[] = [];
  const seen = new Set<string>();
  const re = /"videoId":"([A-Za-z0-9_-]{11})"[\s\S]{0,2500}?"title":\{"runs":\[\{"text":"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && candidates.length < 20) {
    if (!seen.has(m[1])) { seen.add(m[1]); candidates.push({ videoId: m[1], title: m[2], channelTitle: 'YouTube' }); }
  }
  if (!candidates.length) {
    for (const id of [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(x => x[1])) {
      if (!seen.has(id)) { seen.add(id); candidates.push({ videoId: id, title: search, channelTitle: 'YouTube' }); }
      if (candidates.length >= 20) break;
    }
  }
  return candidates;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso:false, error:'Método não permitido.' });

  const nomeMusica = String(req.query.nome_musica || '').trim();
  const nomeArtista = String(req.query.nome_artista || '').trim();
  const query = String(req.query.q || nomeMusica || '').trim();
  if (!query) return res.status(400).json({ sucesso:false, error:'Termo de busca não informado.' });

  try {
    const candidates = await youtubeApi(query, nomeArtista);
    const list = candidates.length ? candidates : await youtubePage(query, nomeArtista);
    const ranked = list.sort((a,b) => score(b.title, query, nomeArtista) - score(a.title, query, nomeArtista));
    const best = ranked[0];
    if (!best) return res.status(404).json({ sucesso:false, error:`Nenhum resultado encontrado para ${query}.` });
    return res.status(200).json({ sucesso:true, query, videoId:best.videoId, titulo:best.title, canal:best.channelTitle, origem:candidates.length ? 'youtube_data_api_v3' : 'youtube_search_page', score:score(best.title, query, nomeArtista), candidates:ranked.slice(0,8) });
  } catch (error:any) {
    return res.status(502).json({ sucesso:false, error:'Falha ao pesquisar a música.', details:String(error?.message || error) });
  }
}
