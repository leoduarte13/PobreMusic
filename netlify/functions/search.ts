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

function normalize(text: string) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function clean(text: string) {
  return normalize(text).replace(/\b(official|video|music|audio|lyrics|hd|4k|topic|vevo)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(text: string) {
  return clean(text).split(' ').filter(w => w.length > 1);
}

function score(title: string, query: string, artist: string, uploader = '') {
  const t = clean(title);
  const q = clean(query);
  const a = clean(artist);
  const u = clean(uploader);
  const tw = new Set(words(t));
  const qw = words(q);
  let s = 0;
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

function extractVideoId(value: unknown) {
  const s = String(value || '');
  return s.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]
    || s.match(/\/watch\/([A-Za-z0-9_-]{11})/)?.[1]
    || s.match(/^([A-Za-z0-9_-]{11})$/)?.[1]
    || '';
}

async function searchTrack(query: string) {
  // Method 1: YouTube Search Scraping
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(m => m[1]);
      const unique = [...new Set(matches)];
      if (unique.length > 0) {
        return {
          items: unique.map(id => ({ url: `https://www.youtube.com/watch?v=${id}`, id })),
          instance: 'youtube'
        };
      }
    }
  } catch {}

  // Method 2: Piped Instances Fallback
  for (const instance of FALLBACK_INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'PobreMusic/1.0' }, signal: controller.signal });
      if (!res.ok) continue;
      const data: any = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length > 0) return { items, instance };
    } catch {
    } finally {
      clearTimeout(timeout);
    }
  }
  return { items: [], instance: '' };
}

export const handler: Handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  const params = event.queryStringParameters || {};
  const nomeMusica = String(params.nome_musica || '').trim();
  const nomeArtista = String(params.nome_artista || '').trim();
  const query = `${nomeMusica} ${nomeArtista}`.trim();

  if (!nomeMusica) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ sucesso: false, error: 'Nome da música não informado.' })
    };
  }

  try {
    const { items, instance } = await searchTrack(query);
    if (!items.length) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ sucesso: false, error: 'Música não encontrada.' })
      };
    }

    const ranked = items
      .map((x: any) => ({
        videoId: extractVideoId(x.url || x.id),
        titulo: String(x.title || ''),
        canal: String(x.uploaderName || x.uploader || ''),
        duracao: Number(x.duration || 0),
        capa: x.thumbnail || x.thumbnailUrl || ''
      }))
      .filter((x: any) => x.videoId)
      .sort((a: any, b: any) => score(b.titulo, nomeMusica, nomeArtista, b.canal) - score(a.titulo, nomeMusica, nomeArtista, a.canal));

    const best = ranked[0];
    if (!best) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ sucesso: false, error: 'Nenhum vídeo válido encontrado.' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sucesso: true,
        videoId: best.videoId,
        titulo: best.titulo,
        canal: best.canal,
        duracao: best.duracao,
        capa: best.capa,
        instance
      })
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ sucesso: false, error: String(e?.message || e) })
    };
  }
};
