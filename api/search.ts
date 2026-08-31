import type { VercelRequest, VercelResponse } from '@vercel/node';

const FALLBACK_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi-libre.kavin.rocks',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.ducks.party',
  'https://piped-api.codespace.cz',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services',
  'https://pipedapi.orangenet.cc'
];

function normalize(text: string) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function clean(text: string) {
  return normalize(text).replace(/\b(official|video|music|audio|lyrics|hd|4k|topic|vevo)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function words(text: string) { return clean(text).split(' ').filter(w => w.length > 1); }
function score(title: string, query: string, artist: string, uploader = '') {
  const t = clean(title); const q = clean(query); const a = clean(artist); const u = clean(uploader);
  const tw = new Set(words(t)); const qw = words(q); let s = 0;
  if (t === q) s += 250;
  if (t.includes(q)) s += 110;
  for (const w of qw) if (tw.has(w)) s += 12;
  const artistWords = words(a);
  if (a && t.includes(a)) s += 100;
  if (artistWords.length && artistWords.every(w => tw.has(w) || u.includes(w))) s += 90;
  if (/official|topic|vevo|audio/i.test(title)) s += 12;
  if (/cover|karaoke|reaction|sped up|slowed|nightcore|8d|remix|live|fan made/i.test(title)) s -= 45;
  return s;
}

async function getInstances() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch('https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md', { signal: controller.signal, headers: { Accept: 'text/plain' } });
    clearTimeout(timeout);
    if (!r.ok) return FALLBACK_INSTANCES;
    const text = await r.text();
    const urls = [...text.matchAll(/\|\s*(https?:\/\/[^\s|]+)\s*\|/g)].map(m => m[1].replace(/\/$/, ''));
    const dynamic = [...new Set(urls)].filter(u => /^https:\/\//i.test(u));
    return [...new Set([...dynamic, ...FALLBACK_INSTANCES])];
  } catch {
    return FALLBACK_INSTANCES;
  }
}

async function pipedSearch(query: string, instance: string) {
  for (const filter of ['music_songs', 'music_videos', 'all']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=${filter}`;
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'PobreMusic/1.0' }, signal: controller.signal });
      if (!r.ok) continue;
      const data: any = await r.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const streams = items.filter((x: any) => x?.type === 'stream' || typeof x?.url === 'string');
      if (streams.length) return streams;
    } catch {
      // Try the next filter/instance.
    } finally {
      clearTimeout(timeout);
    }
  }
  return [];
}

function extractVideoId(value: unknown) {
  const s = String(value || '');
  return s.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]
    || s.match(/\/watch\/([A-Za-z0-9_-]{11})/)?.[1]
    || s.match(/^([A-Za-z0-9_-]{11})$/)?.[1]
    || '';
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
  const query = `${nomeMusica} ${nomeArtista}`.trim();
  if (!nomeMusica) return res.status(400).json({ sucesso:false, error:'Nome da música não informado.' });

  // 1. First priority: Direct YouTube Web Search (instant and reliable)
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const ytRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (ytRes.ok) {
      const html = await ytRes.text();
      const matches = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(m => m[1]);
      const unique = [...new Set(matches)];
      if (unique.length > 0) {
        return res.status(200).json({
          sucesso: true,
          videoId: unique[0],
          titulo: `${nomeMusica} - ${nomeArtista}`,
          canal: nomeArtista,
          duracao: 180,
          capa: `https://i.ytimg.com/vi/${unique[0]}/hqdefault.jpg`,
          origem: 'youtube'
        });
      }
    }
  } catch (e) {
    // fallback to piped instances
  }

  const instances = await getInstances();
  let lastError = '';
  for (const instance of instances) {
    try {
      const candidates = await pipedSearch(query, instance);
      if (!candidates.length) continue;
      const ranked = candidates
        .map((x:any) => ({
          videoId: extractVideoId(x.url || x.id),
          titulo: String(x.title || ''),
          canal: String(x.uploaderName || x.uploader || x.uploaderUrl || ''),
          duracao: Number(x.duration || 0),
          capa: x.thumbnail || x.thumbnailUrl || ''
        }))
        .filter((x:any) => x.videoId)
        .sort((a:any,b:any) => score(b.titulo, nomeMusica, nomeArtista, b.canal) - score(a.titulo, nomeMusica, nomeArtista, a.canal));
      const best = ranked[0];
      if (!best) continue;
      return res.status(200).json({ sucesso:true, videoId:best.videoId, titulo:best.titulo, canal:best.canal, duracao:best.duracao, capa:best.capa, origem:'piped', instance, score:score(best.titulo, nomeMusica, nomeArtista, best.canal) });
    } catch (error:any) {
      lastError = `${instance}: ${String(error?.message || error)}`;
    }
  }
  return res.status(502).json({ sucesso:false, error:'Não foi possível encontrar uma fonte de áudio para esta música.', details:lastError, instancesTestadas:instances.length });
}
