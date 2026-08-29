import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE = 'https://api.soundcloud.com';
const TOKEN_URL = 'https://secure.soundcloud.com/oauth/token';
let cachedToken = '';
let cachedTokenExpiresAt = 0;

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
}

async function getAccessToken(): Promise<string> {
  const configured = String(process.env.SOUNDCLOUD_ACCESS_TOKEN || '').trim();
  if (configured) return configured;
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60_000) return cachedToken;

  const clientId = String(process.env.SOUNDCLOUD_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.SOUNDCLOUD_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('SoundCloud não configurado. Defina SOUNDCLOUD_CLIENT_ID e SOUNDCLOUD_CLIENT_SECRET no Vercel.');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json; charset=utf-8',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!response.ok) throw new Error(`SoundCloud OAuth ${response.status}: ${await response.text()}`);
  const data = await response.json();
  cachedToken = String(data.access_token || '');
  cachedTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  if (!cachedToken) throw new Error('SoundCloud não retornou access_token.');
  return cachedToken;
}

async function scFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json; charset=utf-8',
      Authorization: `OAuth ${token}`,
      ...(init?.headers || {}),
    },
  });
}

function normalizeTrack(track: any) {
  const user = track?.user || {};
  return {
    nome_musica: String(track?.title || 'Sem título'),
    nome_artista: String(track?.metadata_artist || user?.username || user?.permalink || 'Artista'),
    album: String(track?.release || 'SoundCloud'),
    duracao_ms: Number(track?.duration || 0),
    capa: track?.artwork_url || track?.user?.avatar_url || '',
    audioUrl: `/api/soundcloud?trackId=${encodeURIComponent(String(track?.id || ''))}`,
    origem: 'soundcloud',
    soundcloud_id: String(track?.id || ''),
    soundcloud_url: track?.permalink_url || '',
  };
}

async function resolveResource(url: string) {
  const response = await scFetch(`/resolve?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error(`SoundCloud resolve ${response.status}: ${await response.text()}`);
  return response.json();
}

async function getPlaylistTracks(resource: any): Promise<any[]> {
  if (Array.isArray(resource?.tracks)) return resource.tracks;
  const href = typeof resource?.tracks?.href === 'string' ? resource.tracks.href : '';
  if (!href) return [];
  const response = await fetch(href, { headers: { Accept: 'application/json; charset=utf-8', Authorization: `OAuth ${await getAccessToken()}` } });
  if (!response.ok) throw new Error(`SoundCloud playlist tracks ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return Array.isArray(data?.collection) ? data.collection : Array.isArray(data) ? data : [];
}

async function searchTracks(query: string) {
  const response = await scFetch(`/tracks?q=${encodeURIComponent(query)}&access=playable&limit=25&linked_partitioning=true`);
  if (!response.ok) throw new Error(`SoundCloud search ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return Array.isArray(data?.collection) ? data.collection.map(normalizeTrack) : [];
}

async function getStreamUrl(trackId: string) {
  const response = await scFetch(`/tracks/${encodeURIComponent(trackId)}/stream`);
  if (!response.ok) throw new Error(`SoundCloud stream ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const transcodings = Array.isArray(data?.transcodings) ? data.transcodings : [];
  const progressive = transcodings.find((t: any) => t?.format?.protocol === 'progressive');
  const hlsAac = transcodings.find((t: any) => t?.format?.protocol === 'hls' && /audio|mpeg|aac/i.test(String(t?.format?.mime_type || '')));
  const chosen = progressive || hlsAac || transcodings[0];
  if (!chosen?.url) throw new Error('Esta faixa do SoundCloud não possui stream reproduzível.');
  const signed = await fetch(chosen.url, { headers: { Authorization: `OAuth ${await getAccessToken()}` } });
  if (!signed.ok) throw new Error(`SoundCloud transcoding ${signed.status}: ${await signed.text()}`);
  const resolved = await signed.json().catch(() => null);
  const location = resolved?.url || resolved?.redirect || resolved?.location;
  if (typeof location === 'string' && location.startsWith('http')) return location;
  if (chosen.url.startsWith('http')) return chosen.url;
  throw new Error('SoundCloud não retornou uma URL de áudio válida.');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const trackId = typeof req.query.trackId === 'string' ? req.query.trackId.trim() : '';
    if (trackId) {
      const location = await getStreamUrl(trackId);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Location', location);
      return res.status(302).end();
    }

    const input = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!input && !query) return res.status(400).json({ sucesso: false, error: 'Informe uma URL do SoundCloud ou uma busca.' });

    if (query) return res.status(200).json({ sucesso: true, tracks: await searchTracks(query), modo: 'soundcloud' });

    const resource = await resolveResource(input);
    if (resource?.kind === 'playlist' || Array.isArray(resource?.tracks)) {
      const rawTracks = await getPlaylistTracks(resource);
      const playable = rawTracks.filter((t: any) => t?.kind === 'track' && t?.access !== 'blocked');
      const tracks = playable.map(normalizeTrack);
      return res.status(200).json({
        sucesso: tracks.length > 0,
        playlist_id: String(resource?.id || ''),
        nome_playlist: String(resource?.title || 'Playlist SoundCloud'),
        descricao: String(resource?.description || ''),
        capa_playlist: resource?.artwork_url || resource?.tracks?.[0]?.artwork_url || '',
        total_faixas: tracks.length,
        faixas: tracks,
        modo: 'soundcloud',
        aviso: 'Áudio transmitido pelo SoundCloud. Algumas faixas podem estar indisponíveis por restrições do criador ou região.',
      });
    }

    if (resource?.kind === 'track' || resource?.id) {
      const track = normalizeTrack(resource);
      return res.status(200).json({ sucesso: true, playlist_id: String(resource.id), nome_playlist: track.nome_musica, descricao: 'Faixa do SoundCloud', capa_playlist: track.capa, total_faixas: 1, faixas: [track], modo: 'soundcloud' });
    }

    return res.status(404).json({ sucesso: false, error: 'Recurso do SoundCloud não encontrado.' });
  } catch (error: any) {
    const message = error?.message || String(error);
    const status = /não configurado/i.test(message) ? 503 : /blocked|não possui stream|restri/i.test(message) ? 403 : 500;
    return res.status(status).json({ sucesso: false, error: message });
  }
}
