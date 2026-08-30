import type { VercelRequest, VercelResponse } from '@vercel/node';
// spotify-url-info is a CommonJS factory: spotify-url-info(fetch) -> { getPreview, getTracks }.
import spotifyUrlInfo from 'spotify-url-info';

const fetchSpotify = async (url: string | URL, options: any = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        ...(options.headers || {}),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
  } finally { clearTimeout(timer); }
};

const spotifyFactory: any = spotifyUrlInfo as any;
const scraper: any = typeof spotifyFactory === 'function' ? spotifyFactory(fetchSpotify) : null;

function playlistIdFromInput(input: string) {
  const value = String(input || '').trim();
  const match = value.match(/(?:playlist[/:]|spotify:playlist:)([A-Za-z0-9]{10,80})/i);
  return match?.[1] || (/^[A-Za-z0-9]{10,80}$/.test(value) ? value : '');
}
function text(...values: any[]) { return values.find(v => typeof v === 'string' && v.trim())?.trim() || ''; }
function imageFrom(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageFrom(value[0]);
  if (Array.isArray(value.sources)) return value.sources.find((s: any) => s?.url)?.url || '';
  if (Array.isArray(value.images)) return imageFrom(value.images);
  return text(value.url);
}
function durationMs(value: any) {
  if (typeof value === 'object' && value) return Math.round(Number(value.totalMilliseconds || value.milliseconds || value.ms || 0));
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n > 1000 ? n : n * 1000) : 0;
}
function normalizeTrack(item: any) {
  const track = item?.track || item;
  const uri = text(track?.uri, item?.uri);
  const id = uri.match(/spotify:track:([^?]+)/i)?.[1] || text(track?.id, item?.id);
  const name = text(track?.name, track?.title, item?.name);
  if (!id || !name) return null;
  const artists = Array.isArray(track?.artists) ? track.artists.map((a: any) => a?.name).filter(Boolean).join(', ') : '';
  return {
    nome_musica: name,
    nome_artista: text(artists, track?.artist, item?.artist, 'Artista'),
    album: text(track?.album?.name, track?.album, item?.album, 'Álbum'),
    duracao_ms: durationMs(track?.duration_ms ?? track?.duration),
    capa: imageFrom(track?.album?.images || track?.images || item?.image),
    spotify_id: id,
    spotify_url: `https://open.spotify.com/track/${id}`,
    preview_url: text(track?.preview_url, item?.preview_url),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso: false, error: 'Método não permitido.' });

  const raw = String(req.query.url || req.query.playlistId || req.query.id || '').trim();
  const playlistId = playlistIdFromInput(raw);
  if (!playlistId) return res.status(400).json({ sucesso: false, error: 'Link ou ID de playlist Spotify inválido.' });
  if (!scraper?.getTracks || !scraper?.getPreview) {
    return res.status(500).json({ sucesso: false, error: 'Leitor público do Spotify indisponível no servidor.', diagnostic: { factoryType: typeof spotifyFactory, methods: Object.keys(scraper || {}) } });
  }

  const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
  try {
    const [preview, rawTracks] = await Promise.all([
      scraper.getPreview(playlistUrl),
      scraper.getTracks(playlistUrl),
    ]);
    const list = Array.isArray(rawTracks) ? rawTracks : (Array.isArray(rawTracks?.tracks) ? rawTracks.tracks : []);
    const faixas = list.map(normalizeTrack).filter(Boolean);
    if (!faixas.length) {
      return res.status(404).json({ sucesso: false, error: 'A playlist foi encontrada, mas nenhuma faixa pública foi retornada pelo Spotify.', playlist_id: playlistId, diagnostico: { tipo: typeof rawTracks, chaves: rawTracks && typeof rawTracks === 'object' ? Object.keys(rawTracks) : [] } });
    }
    return res.status(200).json({
      sucesso: true,
      autenticado: false,
      modo: 'spotify-url-info-public',
      playlist_id: playlistId,
      nome_playlist: text(preview?.title, preview?.track, 'Playlist Spotify'),
      descricao: text(preview?.description, 'Playlist pública do Spotify.'),
      capa_playlist: imageFrom(preview?.image),
      total_faixas: faixas.length,
      faixas,
      aviso: 'Playlist pública importada sem OAuth.',
    });
  } catch (error: any) {
    const message = error?.message || String(error);
    const code = error?.code || error?.status || null;
    console.error('Spotify public playlist error', { message, code, playlistId, stack: error?.stack });
    return res.status(502).json({ sucesso: false, error: 'Falha ao consultar a playlist pública do Spotify.', details: message, code, playlist_id: playlistId });
  }
}
