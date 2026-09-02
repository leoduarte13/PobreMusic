import type { PlaylistData, Track } from '../types';
import { parseSpotifyDetails, extractSpotifyDirectly, safeFetchJson } from './spotifyResolver';

export type DetectedLinkType =
  | { kind: 'spotify'; type: 'playlist' | 'album' | 'track'; id: string; url: string }
  | { kind: 'youtube_playlist'; listId: string; url: string }
  | { kind: 'youtube_video'; videoId: string; url: string }
  | { kind: 'direct_audio'; audioUrl: string; filename: string }
  | { kind: 'search_query'; query: string };

/**
 * Detects the nature of the user input (Spotify, YouTube Video, YouTube Playlist, Direct Audio, or Search Query)
 */
export function detectInputType(input: string): DetectedLinkType {
  const trimmed = input.trim();

  // 1. Direct Audio file link (.mp3, .m4a, .aac, .wav, .ogg, .flac)
  const audioMatch = trimmed.match(/^https?:\/\/[^\s]+?\.(mp3|m4a|aac|wav|ogg|flac)(\?[^\s]*)?$/i);
  if (audioMatch) {
    let filename = 'Áudio da Web';
    try {
      const urlObj = new URL(trimmed);
      const pathname = urlObj.pathname;
      const rawName = pathname.split('/').pop() || 'audio';
      filename = decodeURIComponent(rawName).replace(/\.[^.]+$/, '');
    } catch {}
    return {
      kind: 'direct_audio',
      audioUrl: trimmed,
      filename
    };
  }

  // 2. Spotify Links
  const spotify = parseSpotifyDetails(trimmed);
  if (spotify.id && spotify.type) {
    return {
      kind: 'spotify',
      type: spotify.type,
      id: spotify.id,
      url: trimmed
    };
  }

  // 3. YouTube Playlist Link
  const ytPlaylistMatch = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/i)
    || trimmed.match(/youtube\.com\/playlist\?list=([A-Za-z0-9_-]+)/i);
  if (ytPlaylistMatch && ytPlaylistMatch[1] && ytPlaylistMatch[1] !== 'WL' && ytPlaylistMatch[1] !== 'LL') {
    return {
      kind: 'youtube_playlist',
      listId: ytPlaylistMatch[1],
      url: trimmed
    };
  }

  // 4. YouTube Video Link (watch?v=, youtu.be/, shorts/, music.youtube.com/)
  const ytVideoMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i);
  if (ytVideoMatch && ytVideoMatch[1]) {
    return {
      kind: 'youtube_video',
      videoId: ytVideoMatch[1],
      url: trimmed
    };
  }

  // 5. Normal text query
  return {
    kind: 'search_query',
    query: trimmed
  };
}

/**
 * Resolves metadata for a YouTube single video (without loading video player UI)
 */
export async function resolveYouTubeVideo(videoId: string, originalUrl: string): Promise<Track> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const defaultTrack: Track = {
    nome_musica: `Vídeo ${videoId}`,
    nome_artista: 'YouTube',
    videoId: videoId,
    duracao_ms: 210000,
    capa: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  };

  // Try YouTube oEmbed for official title and author
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data: any = await res.json();
      let title = String(data.title || '').trim();
      let author = String(data.author_name || '').trim();

      // Clean up title if formatted as "Artist - Song"
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        if (!author || author.toLowerCase().includes('topic') || author.toLowerCase().includes('vevo')) {
          author = parts[0].trim();
        }
        title = parts.slice(1).join(' - ').trim();
      }

      return {
        nome_musica: title || defaultTrack.nome_musica,
        nome_artista: author || 'Artista Desconhecido',
        videoId: videoId,
        duracao_ms: 210000,
        capa: data.thumbnail_url || defaultTrack.capa
      };
    }
  } catch (e) {
    console.warn('Erro ao resolver oEmbed do YouTube:', e);
  }

  return defaultTrack;
}

/**
 * Resolves a YouTube playlist
 */
export async function resolveYouTubePlaylist(listId: string, originalUrl: string): Promise<PlaylistData> {
  // Step 1: Try server endpoint
  try {
    const res = await fetch(`/api/youtube-playlist?list=${encodeURIComponent(listId)}`);
    if (res.ok) {
      const data: PlaylistData = await safeFetchJson(res);
      if (data && data.faixas && data.faixas.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Endpoint /api/youtube-playlist indisponível:', e);
  }

  // Step 2: Fallback extraction via proxy
  const playlistUrl = `https://www.youtube.com/playlist?list=${listId}`;
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(playlistUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(playlistUrl)}`
  ];

  for (const p of proxies) {
    try {
      const r = await fetch(p, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const html = await r.text();
        const data = parseYouTubePlaylistHtml(html, listId);
        if (data && data.faixas.length > 0) {
          return data;
        }
      }
    } catch {}
  }

  throw new Error('Não foi possível carregar as músicas desta playlist do YouTube. Verifique se a playlist é pública.');
}

/**
 * Parses raw HTML of a YouTube playlist
 */
export function parseYouTubePlaylistHtml(html: string, listId: string): PlaylistData {
  let title = 'Playlist do YouTube';
  const tracks: Track[] = [];

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace('- YouTube', '').trim();
  }

  // Extract initialData JSON
  const initialDataMatch = html.match(/var ytInitialData\s*=\s*({[\s\S]+?});<\/script>/i)
    || html.match(/window\["ytInitialData"\]\s*=\s*({[\s\S]+?});/i);

  if (initialDataMatch) {
    try {
      const json = JSON.parse(initialDataMatch[1]);
      const contents = json?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents
        || [];

      for (const item of contents) {
        const vr = item?.playlistVideoRenderer;
        if (!vr || !vr.videoId) continue;
        const vTitle = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Música';
        const vAuthor = vr.shortBylineText?.runs?.[0]?.text || 'YouTube';
        const durationSec = Number(vr.lengthSeconds || 180);
        const thumb = vr.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;

        tracks.push({
          nome_musica: vTitle,
          nome_artista: vAuthor,
          videoId: vr.videoId,
          duracao_ms: durationSec * 1000,
          capa: thumb
        });
      }
    } catch (e) {
      console.warn('Erro ao processar JSON do YouTube:', e);
    }
  }

  // Fallback: regex for videoIds
  if (tracks.length === 0) {
    const videoMatches = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(m => m[1]);
    const uniqueIds = [...new Set(videoMatches)].filter(id => id.length === 11);
    for (let i = 0; i < Math.min(uniqueIds.length, 50); i++) {
      const vid = uniqueIds[i];
      tracks.push({
        nome_musica: `Faixa ${i + 1}`,
        nome_artista: 'YouTube',
        videoId: vid,
        duracao_ms: 210000,
        capa: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
      });
    }
  }

  return {
    sucesso: true,
    playlist_id: listId,
    nome_playlist: title,
    capa_playlist: tracks[0]?.capa || '',
    total_faixas: tracks.length,
    faixas: tracks
  };
}
