import type { VercelRequest, VercelResponse } from '@vercel/node';

type SpotifyType = 'playlist' | 'album' | 'track';

function parseSpotify(input: string): { id: string; type: SpotifyType } {
  const value = String(input || '').trim();
  const m = value.match(/(?:spotify\.com\/[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i) || value.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  if (m) return { type: m[1].toLowerCase() as SpotifyType, id: m[2] };
  const id = value.split('?')[0].split('/').pop()?.replace(/[^A-Za-z0-9]/g, '') || '';
  return { type: 'playlist', id };
}

const headers: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://open.spotify.com/',
};

function firstString(...values: any[]) { return values.find(v => typeof v === 'string' && v.trim())?.trim() || ''; }
function image(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return image(value[0]);
  if (Array.isArray(value.sources)) return firstString(...value.sources.map((x: any) => x?.url));
  if (Array.isArray(value.images)) return image(value.images);
  if (Array.isArray(value.covers)) return image(value.covers);
  return firstString(value.url);
}

function parseJsonScripts(html: string): any[] {
  const results: any[] = [];
  const patterns = [
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi,
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      try { results.push(JSON.parse(raw)); } catch {
        try { results.push(JSON.parse(raw.replace(/&quot;/g, '"').replace(/&#x27;/g, "'"))); } catch {}
      }
    }
  }
  return results;
}

function findTrackList(node: any, depth = 0, seen = new Set<any>()): any[] | null {
  if (!node || depth > 14 || typeof node !== 'object' || seen.has(node)) return null;
  seen.add(node);
  if (Array.isArray(node.trackList) && node.trackList.length) return node.trackList;
  if (Array.isArray(node.tracks?.items) && node.tracks.items.length) return node.tracks.items;
  if (Array.isArray(node.items) && node.items.length && node.items.some((x: any) => x?.track || x?.item?.type === 'track')) return node.items;
  for (const value of Object.values(node)) {
    const found = findTrackList(value, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function findEntity(node: any, depth = 0, seen = new Set<any>()): any | null {
  if (!node || depth > 14 || typeof node !== 'object' || seen.has(node)) return null;
  seen.add(node);
  if (Array.isArray(node.trackList) || Array.isArray(node.tracks?.items)) return node;
  if (node.entity && typeof node.entity === 'object') {
    const e = findEntity(node.entity, depth + 1, seen);
    if (e) return e;
  }
  for (const value of Object.values(node)) {
    const found = findEntity(value, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function extractTrackListFromText(html: string): any[] {
  // Spotify's embed has historically exposed the initial entity as JSON. This fallback
  // finds a trackList JSON array even when the surrounding script structure changes.
  const markers = ['"trackList":', '"trackList" :', '\\"trackList\\":'];
  for (const marker of markers) {
    const start = html.indexOf(marker);
    if (start < 0) continue;
    const arrayStart = html.indexOf('[', start + marker.length);
    if (arrayStart < 0) continue;
    let depth = 0, inString = false, escaped = false;
    for (let i = arrayStart; i < html.length; i++) {
      const c = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) {
          const raw = html.slice(arrayStart, i + 1).replace(/\\"/g, '"');
          try { const parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length) return parsed; } catch {}
          break;
        }
      }
    }
  }
  return [];
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
  return { nome_musica: name, nome_artista: artist || 'Artista Desconhecido', album: firstString(tr?.album?.name, tr?.album, item?.album, playlistName), duracao_ms: duration > 1000 ? Math.round(duration) : Math.round(duration * 1000), capa: cover, spotify_id: id, spotify_url: id ? `https://open.spotify.com/track/${id}` : '' };
}

async function fetchEmbed(type: SpotifyType, id: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const url = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    const html = await response.text();
    return { status: response.status, htmlLength: html.length, html };
  } finally { clearTimeout(timeout); }
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

  try {
    const result = await fetchEmbed(parsed.type, parsed.id);
    if (result.status < 200 || result.status >= 300) {
      return res.status(502).json({ sucesso: false, error: 'Spotify recusou o acesso ao Embed público.', playlist_id: parsed.id, diagnostic: { status: result.status, htmlLength: result.htmlLength } });
    }

    const scripts = parseJsonScripts(result.html);
    let entity: any = null;
    let rawList: any[] = [];
    for (const data of scripts) {
      rawList = findTrackList(data) || [];
      if (rawList.length) { entity = findEntity(data) || {}; break; }
    }
    if (!rawList.length) rawList = extractTrackListFromText(result.html);
    if (!entity && rawList.length) entity = {};

    const playlistName = firstString(entity?.title, entity?.name, 'Playlist do Spotify');
    const coverUrl = image(entity?.coverArt) || image(entity?.images) || image(entity?.visualIdentity?.image);
    const faixas = rawList.map(item => normalizeTrack(item, playlistName, coverUrl)).filter(Boolean);

    if (!faixas.length) {
      return res.status(502).json({ sucesso: false, error: 'O Spotify entregou o Embed, mas não foi possível extrair as faixas.', playlist_id: parsed.id, diagnostic: { status: result.status, htmlLength: result.htmlLength, jsonScripts: scripts.length, rawTracks: rawList.length, containsTrackList: result.html.includes('trackList') } });
    }

    return res.status(200).json({ sucesso: true, autenticado: false, modo: 'spotify_embed_extractor', playlist_id: parsed.id, nome_playlist: playlistName, descricao: firstString(entity?.subtitle, entity?.description, 'Playlist pública do Spotify.'), capa_playlist: coverUrl || faixas[0]?.capa || '', total_faixas: faixas.length, faixas });
  } catch (error: any) {
    console.error('[spotify-playlist]', error?.message || error);
    return res.status(502).json({ sucesso: false, error: 'Não foi possível consultar o Spotify agora.', details: error?.name === 'AbortError' ? 'Spotify demorou mais de 4,5 segundos para responder.' : String(error?.message || error), playlist_id: parsed.id });
  }
}
