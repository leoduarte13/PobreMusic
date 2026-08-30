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

async function pipedSearch(query: string, instance: string) {
  for (const filter of ['music_songs', 'videos']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=${filter}`, {
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!r.ok) continue;
      const data: any = await r.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const streams = items.filter((x: any) => x?.type === 'stream');
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
  const match = s.match(/[?&]v=([A-Za-z0-9_-]{11})/) || s.match(/\/watch\/([A-Za-z0-9_-]{11})/);
  return match?.[1] || '';
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

  let lastError = '';
  for (const instance of INSTANCES) {
    try {
      const candidates = await pipedSearch(query, instance);
      if (!candidates.length) continue;
      const ranked = candidates
        .map((x:any) => ({
          videoId: extractVideoId(x.url || x.id),
          titulo: String(x.title || ''),
          canal: String(x.uploaderName || x.uploaderUrl || ''),
          duracao: Number(x.duration || 0),
          capa: x.thumbnail || ''
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
  return res.status(502).json({ sucesso:false, error:'Não foi possível encontrar uma fonte de áudio para esta música.', details:lastError });
}
