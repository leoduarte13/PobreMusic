import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore - spotify-url-info is CommonJS and exposes its fetch factory at runtime.
import * as spotifyUrlInfoPkg from 'spotify-url-info';

const spotifyUrlInfo: any = (spotifyUrlInfoPkg as any).default || spotifyUrlInfoPkg;

const browserFetch = (url: string | URL, options: any = {}) => fetch(url, {
  ...options,
  headers: {
    ...(options.headers || {}),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
  },
});

const scraper: any = typeof spotifyUrlInfo === 'function' ? spotifyUrlInfo(browserFetch) : null;

function playlistIdFromInput(input: string) {
  const value = String(input || '').trim();
  const match = value.match(/(?:playlist[/:]|spotify:playlist:)([A-Za-z0-9]{10,80})/i);
  if (match) return match[1];
  return /^[A-Za-z0-9]{10,80}$/.test(value) ? value : '';
}

function text(...values: any[]) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

function imageFrom(value: any) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageFrom(value[0]);
  if (Array.isArray(value.sources)) {
    const sources = value.sources.filter((source: any) => source?.url);
    return sources.sort((a: any, b: any) => (Number(b?.width) || 0) - (Number(a?.width) || 0))[0]?.url || '';
  }
  if (Array.isArray(value.images)) return imageFrom(value.images);
  return text(value.url);
}

function durationMs(value: any) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1000 ? Math.round(value) : Math.round(value * 1000);
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1000 ? Math.round(numeric) : Math.round(numeric * 1000);
  if (value && typeof value === 'object') {
    const raw = Number(value.totalMilliseconds ?? value.milliseconds ?? value.ms);
    if (Number.isFinite(raw) && raw > 0) return Math.round(raw);
  }
  return 0;
}

function trackId(uri: any) {
  return text(uri).match(/spotify:track:([^?]+)/i)?.[1] || '';
}

function normalizeTrack(track: any) {
  const id = trackId(track?.uri);
  const name = text(track?.name, track?.title);
  if (!id || !name) return null;
  return {
    nome_musica: name,
    nome_artista: text(track?.artist, track?.subtitle, 'Artista'),
    album: text(track?.album, 'Álbum'),
    duracao_ms: durationMs(track?.duration),
    capa: imageFrom(track?.image),
    spotify_id: id,
    spotify_url: `https://open.spotify.com/track/${id}`,
    preview_url: text(track?.previewUrl),
  };
}

function makePlaylistUrl(input: string) {
  if (/^https?:\/\//i.test(input)) return input;
  return `https://open.spotify.com/playlist/${input}`;
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
  if (!scraper?.getDetails) return res.status(500).json({ sucesso: false, error: 'O scraper público do Spotify não foi carregado no servidor.' });

  try {
    // Same library and browser-fetch strategy used by server.ts in AI Studio.
    const details = await scraper.getDetails(makePlaylistUrl(raw));
    const preview = details?.preview || {};
    const rawTracks = Array.isArray(details?.tracks) ? details.tracks : [];
    const faixas = rawTracks.map(normalizeTrack).filter(Boolean);

    if (!faixas.length) {
      return res.status(404).json({ sucesso: false, error: 'A playlist foi encontrada, mas nenhuma faixa foi retornada pelo Spotify.', playlist_id: playlistId });
    }

    return res.status(200).json({
      sucesso: true,
      autenticado: false,
      modo: 'spotify_url_info_public',
      playlist_id: playlistId,
      nome_playlist: text(preview?.title, 'Playlist Spotify'),
      descricao: text(preview?.description, 'Playlist pública do Spotify.'),
      capa_playlist: text(preview?.image),
      total_faixas: faixas.length,
      faixas,
      aviso: 'Playlist pública importada sem OAuth. Playlists privadas continuam sujeitas às regras do Spotify.',
    });
  } catch (error: any) {
    console.error('Spotify public playlist error:', error);
    return res.status(502).json({ sucesso: false, error: 'Não foi possível carregar a playlist pública do Spotify.', details: error?.message || String(error), playlist_id: playlistId });
  }
}
