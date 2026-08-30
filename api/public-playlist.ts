import type { VercelRequest, VercelResponse } from '@vercel/node';

function parseSpotify(input: string): { id: string; type: 'playlist' | 'album' | 'track' } {
  const value = String(input || '').trim();
  const m = value.match(/(?:spotify\.com\/[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i) || value.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  if (m) return { type: m[1].toLowerCase() as any, id: m[2] };
  const id = value.split('?')[0].split('/').pop()?.replace(/[^A-Za-z0-9]/g, '') || '';
  return { type: 'playlist', id };
}

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
};

function firstString(...values: any[]) {
  return values.find(v => typeof v === 'string' && v.trim())?.trim() || '';
}

function image(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return image(value[0]);
  if (Array.isArray(value.sources)) return firstString(...value.sources.map((x: any) => x?.url));
  if (Array.isArray(value.images)) return image(value.images);
  return firstString(value.url);
}

function parseNextData(html: string): any | null {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function findEntity(data: any): any | null {
  const direct = data?.props?.pageProps?.state?.data?.entity || data?.props?.pageProps?.entity;
  if (direct) return direct;
  const seen = new Set<any>();
  const walk = (node: any, depth = 0): any => {
    if (!node || depth > 7 || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    if ((node.entityType === 'playlist' || node.entityType === 'album') && (node.trackList || node.tracks || node.title || node.name)) return node;
    for (const value of Object.values(node)) { const found = walk(value, depth + 1); if (found) return found; }
    return null;
  };
  return walk(data);
}

function normalizeTrack(item: any, playlistName: string, coverUrl: string) {
  const tr = item?.track || item;
  const name = firstString(tr?.title, tr?.name, item?.title, item?.name);
  if (!name) return null;
  let artist = firstString(tr?.subtitle, item?.subtitle, tr?.artist?.name, tr?.artist);
  if (!artist && Array.isArray(tr?.artists)) artist = tr.artists.map((a: any) => typeof a === 'string' ? a : a?.name).filter(Boolean).join(', ');
  const id = firstString(tr?.uri, item?.uri).replace(/^spotify:track:/i, '') || firstString(tr?.id, item?.id);
  const cover = image(tr?.coverArt) || image(tr?.album?.images) || image(tr?.images) || coverUrl;
  const duration = Number(tr?.duration_ms || tr?.duration || item?.duration_ms || item?.duration || 0);
  return {
    nome_musica: name,
    nome_artista: artist || 'Artista Desconhecido',
    album: firstString(tr?.album?.name, tr?.album, item?.album, playlistName),
    duracao_ms: duration > 1000 ? Math.round(duration) : Math.round(duration * 1000),
    capa: cover,
    spotify_id: id,
    spotify_url: id ? `https://open.spotify.com/track/${id}` : '',
  };
}

async function extractFromEmbed(type: 'playlist' | 'album' | 'track', id: string) {
  const attempts: Array<'playlist' | 'album' | 'track'> = [type];
  if (type !== 'playlist') attempts.push('playlist');
  if (type !== 'album') attempts.push('album');
  if (type !== 'track') attempts.push('track');

  for (const currentType of attempts) {
    try {
      const response = await fetch(`https://open.spotify.com/embed/${currentType}/${id}`, { headers, redirect: 'follow' });
      if (!response.ok) continue;
      const html = await response.text();
      const data = parseNextData(html);
      if (!data) continue;
      const entity = findEntity(data);
      if (!entity) continue;

      const playlistName = firstString(entity.title, entity.name, currentType === 'album' ? 'Álbum do Spotify' : 'Playlist do Spotify');
      const coverUrl = image(entity.coverArt) || image(entity.images);
      let rawList: any[] = [];
      if (Array.isArray(entity.trackList)) rawList = entity.trackList;
      else if (Array.isArray(entity.tracks?.items)) rawList = entity.tracks.items;
      else if (currentType === 'track' || entity.entityType === 'track') rawList = [entity];

      const faixas = rawList.map(item => normalizeTrack(item, playlistName, coverUrl)).filter(Boolean);
      if (!faixas.length) continue;
      return { sucesso: true, autenticado: false, modo: 'spotify_embed_extractor', playlist_id: id, nome_playlist: playlistName, descricao: firstString(entity.subtitle, entity.description, 'Playlist pública do Spotify.'), capa_playlist: coverUrl || faixas[0]?.capa || '', total_faixas: faixas.length, faixas };
    } catch (error) {
      console.warn(`[Spotify Embed] ${currentType}/${id} failed`, error);
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso: false, error: 'Método não permitido.' });

  const raw = String(req.query.url || req.query.playlistId || req.query.id || '').trim();
  const parsed = parseSpotify(raw);
  if (!parsed.id || parsed.id.length < 10) return res.status(400).json({ sucesso: false, error: 'Link ou ID Spotify inválido.' });

  const result = await extractFromEmbed(parsed.type, parsed.id);
  if (result) return res.status(200).json(result);

  return res.status(502).json({
    sucesso: false,
    error: 'Não foi possível carregar a playlist pública do Spotify.',
    details: 'O Spotify não disponibilizou as faixas no HTML público do Embed para esta playlist.',
    playlist_id: parsed.id,
  });
}
