import type { VercelRequest, VercelResponse } from '@vercel/node';

function playlistIdFromInput(input: string) {
  const value = String(input || '').trim();
  const match = value.match(/(?:playlist[/:]|spotify:playlist:)([A-Za-z0-9]{10,80})/i);
  if (match) return match[1];
  if (/^[A-Za-z0-9]{10,80}$/.test(value)) return value;
  return '';
}

function firstString(...values: any[]) {
  return values.find((v) => typeof v === 'string' && v.trim())?.trim() || '';
}

function imageFrom(value: any) {
  const sources = value?.sources;
  if (Array.isArray(sources) && sources.length) {
    return firstString(sources.find((s: any) => s?.width >= 300)?.url, sources[0]?.url);
  }
  if (typeof value === 'string') return value;
  return '';
}

function durationMs(track: any) {
  const raw = track?.duration_ms ?? track?.durationMs ?? track?.duration?.totalMilliseconds ?? track?.duration?.milliseconds ?? track?.duration;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

function artistNames(track: any) {
  const artists = track?.artists?.items || track?.artists || track?.artist?.items || [];
  if (!Array.isArray(artists)) return firstString(track?.artist?.name, track?.artistName, 'Artista');
  return artists.map((a: any) => firstString(a?.profile?.name, a?.name, a?.artist?.name)).filter(Boolean).join(', ') || 'Artista';
}

function collectTracks(root: any) {
  const result: any[] = [];
  const seen = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const uri = firstString(node?.uri, node?._uri);
    const name = firstString(node?.name);
    const isTrack = /^spotify:track:[A-Za-z0-9]+$/i.test(uri) && Boolean(name);
    if (isTrack && !seen.has(uri)) {
      seen.add(uri);
      const album = node?.albumOfTrack || node?.album || node?.albumOfTrack?.data || {};
      const cover = imageFrom(node?.albumOfTrack?.coverArt) || imageFrom(node?.album?.images?.[0]) || imageFrom(node?.coverArt);
      result.push({
        nome_musica: name,
        nome_artista: artistNames(node),
        album: firstString(album?.name, album?.title, 'Álbum'),
        duracao_ms: durationMs(node),
        capa: cover,
        spotify_id: uri.split(':').pop(),
        spotify_url: `https://open.spotify.com/track/${uri.split(':').pop()}`
      });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'trackAudio') continue;
      visit(value);
    }
  };
  visit(root);
  return result;
}

function findPlaylistEntity(root: any): any {
  let found: any = null;
  const visit = (node: any) => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    const uri = firstString(node?.uri, node?._uri);
    const type = String(node?.type || '').toUpperCase();
    if ((type === 'PLAYLIST' || type === 'PLAYLIST_V2') && (uri.startsWith('spotify:playlist:') || node?.trackList || node?.items)) {
      found = node;
      return;
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(root);
  return found;
}

function parseNextData(html: string) {
  const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
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

  const embedUrl = `https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}`;
  try {
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) return res.status(response.status).json({ sucesso: false, error: `Spotify retornou HTTP ${response.status}. A playlist pode ser privada, removida ou indisponível.` });

    const html = await response.text();
    const nextData = parseNextData(html);
    if (!nextData) return res.status(502).json({ sucesso: false, error: 'O Spotify não forneceu os dados públicos da playlist.' });

    const entity = findPlaylistEntity(nextData);
    const faixas = collectTracks(nextData);
    if (!faixas.length) return res.status(404).json({ sucesso: false, error: 'Nenhuma faixa pública foi encontrada nessa playlist.' });

    const playlistName = firstString(entity?.name, entity?.title, 'Playlist Spotify');
    const description = firstString(entity?.description, entity?.subtitle, 'Importada de uma playlist pública do Spotify.');
    const cover = imageFrom(entity?.coverArt) || imageFrom(entity?.images?.[0]) || faixas[0]?.capa || '';

    return res.status(200).json({
      sucesso: true,
      modo: 'public_embed',
      autenticado: false,
      isPrivate: false,
      playlist_id: playlistId,
      nome_playlist: playlistName,
      descricao: description,
      capa_playlist: cover,
      total_faixas: faixas.length,
      faixas,
      aviso: 'Playlist pública importada sem login Spotify. Playlists privadas exigem autenticação compatível com as regras atuais do Spotify.'
    });
  } catch (error: any) {
    return res.status(502).json({ sucesso: false, error: 'Não foi possível consultar a página pública do Spotify.', details: error?.message || String(error) });
  }
}
