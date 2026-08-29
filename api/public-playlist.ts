import type { VercelRequest, VercelResponse } from '@vercel/node';

function playlistIdFromInput(input: string) {
  const value = String(input || '').trim();
  const match = value.match(/(?:playlist[/:]|spotify:playlist:)([A-Za-z0-9]{10,80})/i);
  if (match) return match[1];
  return /^[A-Za-z0-9]{10,80}$/.test(value) ? value : '';
}

function firstString(...values: any[]) {
  return values.find((v) => typeof v === 'string' && v.trim())?.trim() || '';
}

function imageFrom(value: any) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageFrom(value[0]);
  if (Array.isArray(value.sources)) return firstString(value.sources.find((s: any) => s?.url)?.url);
  if (Array.isArray(value.images)) return imageFrom(value.images);
  return firstString(value.url);
}

function durationMs(track: any) {
  const raw = track?.duration_ms ?? track?.durationMs ?? track?.duration?.totalMilliseconds ?? track?.duration?.milliseconds ?? track?.duration;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 200000;
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

function artistNames(track: any) {
  const artists = track?.artists?.items || track?.artists || track?.artist?.items || [];
  if (!Array.isArray(artists)) return firstString(track?.artist?.name, track?.artistName, 'Artista');
  return artists.map((a: any) => firstString(a?.profile?.name, a?.name, a?.artist?.name)).filter(Boolean).join(', ') || 'Artista';
}

function normalizeTrack(raw: any) {
  const track = raw?.track || raw?.item || raw;
  const uri = firstString(track?.uri, track?._uri, raw?.uri);
  const id = firstString(track?.id, uri.match(/spotify:track:([^?]+)/i)?.[1]);
  const name = firstString(track?.name, raw?.name);
  if (!id || !name) return null;
  const album = track?.albumOfTrack || track?.album || {};
  const cover = imageFrom(album?.coverArt) || imageFrom(album?.images) || imageFrom(track?.coverArt);
  return {
    nome_musica: name,
    nome_artista: artistNames(track),
    album: firstString(album?.name, album?.title, 'Álbum'),
    duracao_ms: durationMs(track),
    capa: cover,
    spotify_id: id,
    spotify_url: `https://open.spotify.com/track/${id}`,
  };
}

function parseNextData(html: string) {
  // Spotify's embed page currently exposes the playlist in __NEXT_DATA__.
  // Keep the attribute matching flexible because the order of script attributes can change.
  const match = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function extractEntity(data: any) {
  return data?.props?.pageProps?.state?.data?.entity
    || data?.props?.pageProps?.state?.data?.entityData
    || data?.props?.pageProps?.entity
    || null;
}

function extractTracks(entity: any) {
  const list = entity?.trackList || entity?.tracks?.items || entity?.items || [];
  if (!Array.isArray(list)) return [];
  return list.map(normalizeTrack).filter(Boolean);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso: false, error: 'Método não permitido.' });

  const raw = String(req.query.url || req.query.playlistId || req.query.id || '');
  const playlistId = playlistIdFromInput(raw);
  if (!playlistId) return res.status(400).json({ sucesso: false, error: 'Cole um link válido de uma playlist pública do Spotify.' });

  const embedUrl = `https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}?utm_source=pobremusic`;
  try {
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = await response.text();
    if (!response.ok) return res.status(response.status).json({ sucesso: false, error: `Spotify retornou HTTP ${response.status}.` });

    const nextData = parseNextData(html);
    if (!nextData) return res.status(502).json({ sucesso: false, error: 'O Spotify não forneceu __NEXT_DATA__ no embed público.', playlist_id: playlistId });

    const entity = extractEntity(nextData);
    if (!entity) return res.status(502).json({ sucesso: false, error: 'O Spotify forneceu o embed, mas a entidade da playlist não foi encontrada.', playlist_id: playlistId });

    const faixas = extractTracks(entity);
    if (!faixas.length) return res.status(404).json({ sucesso: false, error: 'A playlist foi encontrada, mas nenhuma faixa pública foi exposta pelo embed.', playlist_id: playlistId });

    return res.status(200).json({
      sucesso: true,
      autenticado: false,
      modo: 'spotify_embed_public',
      playlist_id: playlistId,
      nome_playlist: firstString(entity?.name, entity?.title, 'Playlist Spotify'),
      descricao: firstString(entity?.description, entity?.subtitle, 'Playlist pública do Spotify.'),
      capa_playlist: imageFrom(entity?.coverArt) || imageFrom(entity?.images) || faixas[0]?.capa || '',
      total_faixas: faixas.length,
      faixas,
      aviso: 'Playlist pública importada sem OAuth. Playlists privadas continuam sujeitas às regras de autenticação do Spotify.',
    });
  } catch (error: any) {
    return res.status(502).json({ sucesso: false, error: 'Falha ao consultar o embed público do Spotify.', details: error?.message || String(error) });
  }
}
