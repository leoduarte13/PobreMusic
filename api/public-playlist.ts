import type { VercelRequest, VercelResponse } from '@vercel/node';

type SpotifyType = 'playlist' | 'album' | 'track';

function parseSpotify(input: string): { id: string; type: SpotifyType } {
  const value = String(input || '').trim();
  const m = value.match(/(?:spotify\.com\/[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i) || value.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  if (m) return { type: m[1].toLowerCase() as SpotifyType, id: m[2] };
  const id = value.split('?')[0].split('/').pop()?.replace(/[^A-Za-z0-9]/g, '') || '';
  return { type: 'playlist', id };
}

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
  Referer: 'https://open.spotify.com/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
};

function firstString(...values: any[]) { return values.find(v => typeof v === 'string' && v.trim())?.trim() || ''; }
function image(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return image(value[0]);
  if (Array.isArray(value.sources)) return firstString(...value.sources.map((x: any) => x?.url));
  if (Array.isArray(value.images)) return image(value.images);
  return firstString(value.url);
}

function parseNextData(html: string): any | null {
  const patterns = [
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>\s*([\s\S]*?)\s*<\/script>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) { try { return JSON.parse(match[1]); } catch {} }
  }
  return null;
}

function findTrackList(node: any, depth = 0, seen = new Set<any>()): any[] | null {
  if (!node || depth > 10 || typeof node !== 'object' || seen.has(node)) return null;
  seen.add(node);
  if (Array.isArray(node.trackList) && node.trackList.length) return node.trackList;
  if (Array.isArray(node.tracks?.items) && node.tracks.items.length) return node.tracks.items;
  for (const value of Object.values(node)) {
    const found = findTrackList(value, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function findEntity(data: any): any | null {
  const direct = data?.props?.pageProps?.state?.data?.entity || data?.props?.pageProps?.entity;
  if (direct) return direct;
  const seen = new Set<any>();
  const walk = (node: any, depth = 0): any => {
    if (!node || depth > 10 || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node.trackList) || Array.isArray(node.tracks?.items)) return node;
    for (const value of Object.values(node)) { const found = walk(value, depth + 1); if (found) return found; }
    return null;
  };
  return walk(data);
}

function normalizeTrack(item: any, playlistName: string, coverUrl: string) {
  const tr = item?.track || item?.item || item;
  const name = firstString(tr?.title, tr?.name, item?.title, item?.name);
  if (!name) return null;
  let artist = firstString(tr?.subtitle, item?.subtitle, tr?.artist?.name, tr?.artist);
  if (!artist && Array.isArray(tr?.artists)) artist = tr.artists.map((a: any) => typeof a === 'string' ? a : a?.name).filter(Boolean).join(', ');
  const rawUri = firstString(tr?.uri, item?.uri);
  const id = rawUri.replace(/^spotify:track:/i, '') || firstString(tr?.id, item?.id);
  const cover = image(tr?.coverArt) || image(tr?.album?.images) || image(tr?.images) || coverUrl;
  const duration = Number(tr?.duration_ms ?? tr?.duration ?? tr?.maxDuration ?? item?.duration_ms ?? item?.duration ?? 0);
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

async function fetchEmbed(type: SpotifyType, id: string) {
  const url = `https://open.spotify.com/embed/${type}/${id}`;
  let lastStatus = 0;
  let lastLength = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${url}?utm_source=generator`, { headers, redirect: 'follow', cache: 'no-store' });
      lastStatus = response.status;
      const html = await response.text();
      lastLength = html.length;
      if (!response.ok) continue;
      const data = parseNextData(html);
      if (!data) continue;
      const entity = findEntity(data);
      const rawList = findTrackList(entity || data) || [];
      if (!rawList.length) continue;
      return { data, entity, rawList, status: response.status, htmlLength: html.length };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return { data: null, entity: null, rawList: [], status: lastStatus, htmlLength: lastLength };
}

async function extractFromSpotifyEmbed(type: SpotifyType, id: string) {
  const types: SpotifyType[] = [type];
  if (type !== 'playlist') types.push('playlist');
  if (type !== 'album') types.push('album');
  if (type !== 'track') types.push('track');

  let diagnostic: any = {};
  for (const currentType of types) {
    const result = await fetchEmbed(currentType, id);
    diagnostic = { ...diagnostic, [currentType]: { status: result.status, htmlLength: result.htmlLength, tracks: result.rawList.length } };
    if (!result.rawList.length) continue;
    const entity = result.entity || {};
    const playlistName = firstString(entity.title, entity.name, currentType === 'album' ? 'Álbum do Spotify' : 'Playlist do Spotify');
    const coverUrl = image(entity.coverArt) || image(entity.images) || image(entity.visualIdentity?.image);
    const faixas = result.rawList.map(item => normalizeTrack(item, playlistName, coverUrl)).filter(Boolean);
    if (!faixas.length) continue;
    return { sucesso: true, autenticado: false, modo: 'spotify_embed_extractor', playlist_id: id, nome_playlist: playlistName, descricao: firstString(entity.subtitle, entity.description, 'Playlist pública do Spotify.'), capa_playlist: coverUrl || faixas[0]?.capa || '', total_faixas: faixas.length, faixas };
  }
  return { sucesso: false, diagnostic };
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

  const result = await extractFromSpotifyEmbed(parsed.type, parsed.id);
  if (result.sucesso) return res.status(200).json(result);

  return res.status(502).json({
    sucesso: false,
    error: 'Não foi possível carregar a playlist pública do Spotify.',
    details: 'O servidor do Spotify não entregou as faixas no Embed público.',
    playlist_id: parsed.id,
    diagnostic: result.diagnostic,
  });
}
