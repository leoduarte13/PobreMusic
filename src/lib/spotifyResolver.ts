import type { PlaylistData, Track } from '../types';

export function parseSpotifyDetails(input: string): { type: 'playlist' | 'album' | 'track' | null; id: string } {
  const value = String(input || '').trim();
  const m = value.match(/(?:spotify\.com\/(?:intl-[^/]+\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]+)/i);
  if (m) {
    return {
      type: m[1].toLowerCase() as 'playlist' | 'album' | 'track',
      id: m[2]
    };
  }
  // Try raw ID if exactly 22 alphanumeric characters
  if (/^[A-Za-z0-9]{22}$/.test(value)) {
    return { type: 'playlist', id: value };
  }
  return { type: null, id: '' };
}

// Safely parses JSON from a fetch Response, protecting against "<!DOCTYPE html>" syntax errors
export async function safeFetchJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    throw new Error('Servidor retornou uma página HTML em vez de dados JSON.');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Formato de resposta inválido recebido do servidor.');
  }
}

// Client-side fallback extraction when serverless / API is unavailable
export async function extractSpotifyDirectly(spotifyUrl: string): Promise<PlaylistData> {
  const { type, id } = parseSpotifyDetails(spotifyUrl);
  if (!id || !type) {
    throw new Error('Link do Spotify inválido. Certifique-se de colar um link público de playlist, álbum ou música.');
  }

  const embedUrl = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  
  // List of proxies to fetch the public Spotify embed page from browser
  const proxyEndpoints = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(embedUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(embedUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(embedUrl)}`
  ];

  let rawHtml = '';
  for (const proxy of proxyEndpoints) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const text = await res.text();
        if (text && (text.includes('__NEXT_DATA__') || text.includes('Spotify') || text.includes('trackList') || text.includes('initial-state'))) {
          rawHtml = text;
          break;
        }
      }
    } catch {}
  }

  if (rawHtml) {
    try {
      const data = parseSpotifyEmbedHtml(rawHtml, type, id);
      if (data && data.faixas.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Erro ao processar HTML do Spotify embed:', e);
    }
  }

  // Fallback: Try Spotify oEmbed for basic metadata
  try {
    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`);
    if (oembedRes.ok) {
      const oembedData: any = await oembedRes.json();
      const title = String(oembedData.title || 'Playlist do Spotify');
      return {
        sucesso: true,
        playlist_id: id,
        nome_playlist: title,
        capa_playlist: oembedData.thumbnail_url || '',
        total_faixas: 1,
        faixas: [{
          nome_musica: title,
          nome_artista: oembedData.author_name || 'Spotify',
          album: title,
          duracao_ms: 180000,
          capa: oembedData.thumbnail_url || '',
          spotify_id: id
        }]
      };
    }
  } catch {}

  throw new Error('Não foi possível carregar as faixas desta playlist. Verifique se ela é pública no Spotify.');
}

export function parseSpotifyEmbedHtml(html: string, defaultType: string = 'playlist', defaultId: string = ''): PlaylistData {
  let entity: any = null;
  let trackList: any[] = [];

  // Strategy 1: __NEXT_DATA__ JSON script tag
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const state = nextData?.props?.pageProps?.state?.data?.entity;
      if (state) {
        entity = state;
        trackList = state.trackList || state.tracks?.items || [];
      }
    } catch {}
  }

  // Strategy 2: initial-state JSON script tag
  if (!trackList.length) {
    const initialStateMatch = html.match(/<script[^>]*id=["']initial-state["'][^>]*>([\s\S]*?)<\/script>/i);
    if (initialStateMatch) {
      try {
        let content = initialStateMatch[1].trim();
        // Check if base64 encoded
        if (!content.startsWith('{')) {
          content = atob(content);
        }
        const state = JSON.parse(content);
        const entityData = state?.data?.entity || state?.entity;
        if (entityData) {
          entity = entityData;
          trackList = entityData.trackList || entityData.tracks?.items || [];
        }
      } catch {}
    }
  }

  // Strategy 3: Regex match for trackList array in scripts
  if (!trackList.length) {
    const regexMatch = html.match(/"trackList"\s*:\s*(\[[^\]]+\])/);
    if (regexMatch) {
      try {
        trackList = JSON.parse(regexMatch[1]);
      } catch {}
    }
  }

  const playlistId = entity?.id || defaultId || 'spotify-playlist';
  const playlistName = entity?.name || entity?.title || (defaultType === 'album' ? 'Álbum do Spotify' : 'Playlist do Spotify');
  const coverUrl = entity?.coverArt?.sources?.[0]?.url || entity?.images?.[0]?.url || '';

  const faixas = trackList.map((item): Track | null => {
    const tr = item?.track || item;
    const name = tr?.name || tr?.title || item?.title;
    if (!name) return null;
    let artist = tr?.artist || tr?.subtitle || item?.subtitle;
    if (!artist && Array.isArray(tr?.artists)) {
      artist = tr.artists.map((a: any) => a?.name || a).join(', ');
    }
    const duration = Number(tr?.duration_ms || tr?.duration || item?.duration_ms || 0);
    const cover = tr?.coverArt?.sources?.[0]?.url || tr?.images?.[0]?.url || coverUrl;
    return {
      nome_musica: name,
      nome_artista: artist || 'Artista Desconhecido',
      album: tr?.album?.name || playlistName,
      duracao_ms: duration > 1000 ? Math.round(duration) : Math.round(duration * 1000),
      capa: cover,
      spotify_id: tr?.id || ''
    };
  }).filter((t): t is Track => t !== null);

  return {
    sucesso: true,
    playlist_id: playlistId,
    nome_playlist: playlistName,
    capa_playlist: coverUrl || faixas[0]?.capa || '',
    total_faixas: faixas.length,
    faixas
  };
}
