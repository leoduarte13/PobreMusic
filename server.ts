import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

const FALLBACK_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services'
];

function normalize(text: string) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function clean(text: string) {
  return normalize(text).replace(/\b(official|video|music|audio|lyrics|hd|4k|topic|vevo)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(text: string) {
  return clean(text).split(' ').filter(w => w.length > 1);
}

function score(title: string, query: string, artist: string, uploader = '') {
  const t = clean(title);
  const q = clean(query);
  const a = clean(artist);
  const u = clean(uploader);
  const tw = new Set(words(t));
  const qw = words(q);
  let s = 0;
  if (t === q) s += 250;
  if (t.includes(q)) s += 110;
  for (const w of qw) if (tw.has(w)) s += 12;
  const artistWords = words(a);
  if (a && t.includes(a)) s += 100;
  if (artistWords.length && artistWords.every(w => tw.has(w) || u.includes(w))) s += 90;
  if (/official|topic|vevo|audio/i.test(title)) s += 12;
  if (/cover|karaoke|reaction|sped up|slowed|nightcore|8d|remix|live|fan made/i.test(title)) s -= 45;
  return s;
}

function extractVideoId(value: unknown) {
  const s = String(value || '');
  return s.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]
    || s.match(/\/watch\/([A-Za-z0-9_-]{11})/)?.[1]
    || s.match(/^([A-Za-z0-9_-]{11})$/)?.[1]
    || '';
}

async function searchTrack(query: string) {
  // Method 1: YouTube Search Scraping (Fastest and 100% reliable)
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map(m => m[1]);
      const unique = [...new Set(matches)];
      if (unique.length > 0) {
        return {
          items: unique.map(id => ({ url: `https://www.youtube.com/watch?v=${id}`, id })),
          instance: 'youtube'
        };
      }
    }
  } catch (e) {
    // Fallback to piped instances
  }

  // Method 2: Piped Instances Fallback
  for (const instance of FALLBACK_INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'PobreMusic/1.0' }, signal: controller.signal });
      if (!res.ok) continue;
      const data: any = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length > 0) return { items, instance };
    } catch {
      // try next instance
    } finally {
      clearTimeout(timeout);
    }
  }
  return { items: [], instance: '' };
}

// API: Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// -------------------------------------------------------------
// FULL TRACK AUDIO SEARCH ENGINE (SoundCloud & Audius Full Length)
// Eliminates 30-second previews and provides full song playback
// -------------------------------------------------------------

let cachedSoundCloudClientId = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';
let lastSoundCloudIdFetch = Date.now();

async function getSoundCloudClientId(): Promise<string> {
  if (cachedSoundCloudClientId && Date.now() - lastSoundCloudIdFetch < 3600000 * 6) {
    return cachedSoundCloudClientId;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const page = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: controller.signal
    }).then(r => r.text());
    clearTimeout(timeout);
    const scriptUrls = [...page.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m => m[1]);
    for (const url of scriptUrls.slice(-6)) {
      const fullUrl = url.startsWith('http') ? url : `https://soundcloud.com${url}`;
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 3000);
      const js = await fetch(fullUrl, { signal: ctrl.signal }).then(r => r.text());
      clearTimeout(tm);
      const match = js.match(/client_id[:=]"([a-zA-Z0-9]{32})"/);
      if (match && match[1]) {
        cachedSoundCloudClientId = match[1];
        lastSoundCloudIdFetch = Date.now();
        return cachedSoundCloudClientId;
      }
    }
  } catch (e) {
    console.warn('SoundCloud client_id refresh failed, using cached fallback');
  }
  return cachedSoundCloudClientId || 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';
}

interface FullTrackAudioResult {
  audioUrl: string;
  titulo: string;
  canal: string;
  duracao: number; // in seconds, MUST be >= 60 seconds (full track)
  capa: string;
  source: 'soundcloud' | 'audius';
}

async function searchFullTrackAudio(title: string, artist: string): Promise<FullTrackAudioResult | null> {
  const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  const cleanArtist = artist.replace(/feat\..*$/i, '').trim();
  const q = `${cleanTitle} ${cleanArtist}`.trim();

  // 1. Search SoundCloud for FULL TRACK (must be >= 60 seconds)
  try {
    const clientId = await getSoundCloudClientId();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=12`;
    const res = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      const tracks = Array.isArray(data.collection) ? data.collection : [];
      for (const t of tracks) {
        // Enforce FULL track: minimum 60s duration (filters out 30s previews and snippet samples!)
        const durSec = Math.round((t.duration || 0) / 1000);
        if (durSec < 60) continue;

        // Find progressive stream (native MP3) or hls
        const trans = t.media?.transcodings?.find((x: any) => x.format?.protocol === 'progressive') ||
                      t.media?.transcodings?.find((x: any) => x.format?.protocol === 'hls' && x.format?.mime_type?.includes('mpeg'));
        if (!trans?.url) continue;

        try {
          const sCtrl = new AbortController();
          const sTimeout = setTimeout(() => sCtrl.abort(), 3500);
          const streamRes = await fetch(`${trans.url}?client_id=${clientId}`, { signal: sCtrl.signal });
          clearTimeout(sTimeout);
          if (streamRes.ok) {
            const streamData: any = await streamRes.json();
            if (streamData?.url) {
              const capa = (t.artwork_url || t.user?.avatar_url || '').replace('large', 't500x500');
              return {
                audioUrl: streamData.url,
                titulo: t.title || title,
                canal: t.user?.username || artist,
                duracao: durSec,
                capa: capa,
                source: 'soundcloud'
              };
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('SoundCloud full track search error:', e);
  }

  // 2. Search Audius for FULL TRACK (must be >= 60 seconds)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=ProbeMusic`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data.data) && data.data.length > 0) {
        // Enforce duration >= 60
        const item = data.data.find((x: any) => (x.duration || 0) >= 60);
        if (item && item.id) {
          return {
            audioUrl: `https://api.audius.co/v1/tracks/${item.id}/stream?app_name=ProbeMusic`,
            titulo: item.title || title,
            canal: item.user?.name || artist,
            duracao: item.duration || 180,
            capa: item.artwork?.['480x480'] || item.artwork?.['150x150'] || '',
            source: 'audius'
          };
        }
      }
    }
  } catch {}

  // NOTE: Deezer and iTunes 30-second previews are intentionally NOT used
  // to ensure songs always play the full duration from start to finish.
  return null;
}

// API: HTML5 Full Audio Direct Search
app.get('/api/html5-audio', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const nomeMusica = String(req.query.nome_musica || req.query.title || '').trim();
  const nomeArtista = String(req.query.nome_artista || req.query.artist || '').trim();
  if (!nomeMusica) return res.status(400).json({ sucesso: false, error: 'Título não informado.' });

  try {
    const audio = await searchFullTrackAudio(nomeMusica, nomeArtista);
    if (!audio) return res.status(404).json({ sucesso: false, error: 'Áudio completo não localizado.' });
    return res.json({ sucesso: true, ...audio });
  } catch (e: any) {
    return res.status(500).json({ sucesso: false, error: String(e?.message || e) });
  }
});

// API: Search track (HTML5 Full Audio prioritized, YouTube fallback)
app.get('/api/search', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const nomeMusica = String(req.query.nome_musica || '').trim();
  const nomeArtista = String(req.query.nome_artista || '').trim();
  const query = `${nomeMusica} ${nomeArtista}`.trim();
  if (!nomeMusica) return res.status(400).json({ sucesso: false, error: 'Nome da música não informado.' });

  try {
    // 1. Fetch HTML5 full audio stream first (runs in parallel with YouTube search)
    const [fullAudioResult, ytResult] = await Promise.allSettled([
      searchFullTrackAudio(nomeMusica, nomeArtista),
      searchTrack(query)
    ]);

    const fullAudio = fullAudioResult.status === 'fulfilled' ? fullAudioResult.value : null;
    let ytBest: any = null;

    if (ytResult.status === 'fulfilled' && ytResult.value.items?.length) {
      const ranked = ytResult.value.items
        .map((x: any) => ({
          videoId: extractVideoId(x.url || x.id),
          titulo: String(x.title || ''),
          canal: String(x.uploaderName || x.uploader || ''),
          duracao: Number(x.duration || 0),
          capa: x.thumbnail || x.thumbnailUrl || ''
        }))
        .filter((x: any) => x.videoId)
        .sort((a: any, b: any) => score(b.titulo, nomeMusica, nomeArtista, b.canal) - score(a.titulo, nomeMusica, nomeArtista, a.canal));

      ytBest = ranked[0] || null;
    }

    if (!fullAudio && !ytBest) {
      return res.status(404).json({ sucesso: false, error: 'Música não encontrada nos provedores de áudio.' });
    }

    return res.json({
      sucesso: true,
      audioUrl: fullAudio?.audioUrl || '',
      videoId: ytBest?.videoId || '',
      titulo: fullAudio?.titulo || ytBest?.titulo || nomeMusica,
      canal: fullAudio?.canal || ytBest?.canal || nomeArtista,
      duracao: fullAudio?.duracao || ytBest?.duracao || 0,
      capa: fullAudio?.capa || ytBest?.capa || '',
      source: fullAudio ? fullAudio.source : 'youtube'
    });
  } catch (e: any) {
    return res.status(500).json({ sucesso: false, error: String(e?.message || e) });
  }
});

// API: Audio stream proxy
app.get('/api/audio', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const videoId = String(req.query.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ error: 'videoId inválido.' });

  for (const instance of FALLBACK_INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const meta = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'PobreMusic/1.0' },
        signal: controller.signal
      });
      if (!meta.ok) continue;
      const data: any = await meta.json();
      const streams: any[] = Array.isArray(data.audioStreams) ? data.audioStreams : [];
      const valid = streams.filter(s => s?.url && /^https?:\/\//i.test(String(s.url)));
      valid.sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      const chosen = valid.find(s => /^audio\/mp4/i.test(String(s.mimeType || ''))) || valid[0];
      if (!chosen?.url) continue;

      const headers: Record<string, string> = { Accept: '*/*' };
      if (req.headers.range) headers.Range = req.headers.range as string;

      const upstream = await fetch(String(chosen.url), { headers, signal: controller.signal });
      if (!upstream.ok && upstream.status !== 206) continue;

      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', String(chosen.mimeType || 'audio/mp4'));
      res.setHeader('Accept-Ranges', 'bytes');
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);

      if (!upstream.body) {
        clearTimeout(timeout);
        return res.end();
      }

      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
        clearTimeout(timeout);
      }
      return res.end();
    } catch {
      clearTimeout(timeout);
    }
  }

  return res.status(502).json({ error: 'Nenhuma fonte de áudio disponível no momento.' });
});

// API: Public Spotify Playlist Extraction
app.get('/api/public-playlist', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rawUrl = String(req.query.url || '').trim();
  const m = rawUrl.match(/(?:spotify\.com\/(?:intl-[^/]+\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]+)/i);
  const type = m ? m[1].toLowerCase() : 'playlist';
  const id = m ? m[2] : rawUrl.split('?')[0].split('/').pop()?.replace(/[^A-Za-z0-9]/g, '') || '';

  if (!id || id.length < 10) {
    return res.status(400).json({ sucesso: false, error: 'Link do Spotify inválido. Cole o link de uma playlist, álbum ou música.' });
  }

  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
      }
    });

    const html = await embedRes.text();
    let entity: any = null;
    let trackList: any[] = [];

    // Method 1: __NEXT_DATA__
    const jsonMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonMatch) {
      try {
        const nextData = JSON.parse(jsonMatch[1]);
        const state = nextData?.props?.pageProps?.state?.data?.entity;
        if (state) {
          entity = state;
          trackList = state.trackList || state.tracks?.items || [];
        }
      } catch {}
    }

    // Method 2: initial-state (Base64 / JSON)
    if (!trackList.length) {
      const initialStateMatch = html.match(/<script[^>]*id=["']initial-state["'][^>]*>([\s\S]*?)<\/script>/i);
      if (initialStateMatch) {
        try {
          let content = initialStateMatch[1].trim();
          if (!content.startsWith('{')) {
            content = Buffer.from(content, 'base64').toString('utf-8');
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

    // Method 3: Regex trackList
    if (!trackList.length) {
      const regexMatch = html.match(/"trackList"\s*:\s*(\[[^\]]+\])/);
      if (regexMatch) {
        try { trackList = JSON.parse(regexMatch[1]); } catch {}
      }
    }

    const playlistName = entity?.name || entity?.title || (type === 'album' ? 'Álbum do Spotify' : 'Playlist do Spotify');
    const coverUrl = entity?.coverArt?.sources?.[0]?.url || entity?.images?.[0]?.url || '';

    const faixas = trackList.map(item => {
      const tr = item?.track || item;
      const name = tr?.name || tr?.title || item?.title;
      if (!name) return null;
      let artist = tr?.artist || tr?.subtitle || item?.subtitle;
      if (!artist && Array.isArray(tr?.artists)) artist = tr.artists.map((a: any) => a?.name || a).join(', ');
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
    }).filter(Boolean);

    if (faixas.length > 0) {
      return res.json({
        sucesso: true,
        nome_playlist: playlistName,
        capa_playlist: coverUrl || faixas[0]?.capa || '',
        total_faixas: faixas.length,
        faixas
      });
    }

    // Method 4: oEmbed Fallback
    try {
      const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`);
      if (oembedRes.ok) {
        const oembedData: any = await oembedRes.json();
        const title = String(oembedData.title || 'Playlist do Spotify');
        return res.json({
          sucesso: true,
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
        });
      }
    } catch {}

    return res.status(404).json({
      sucesso: false,
      error: 'Nenhuma música encontrada nesta playlist. Verifique se o link é público.'
    });
  } catch (e: any) {
    return res.status(502).json({
      sucesso: false,
      error: 'Erro ao consultar Spotify: ' + String(e?.message || e)
    });
  }
});

// API: Public YouTube Playlist Extraction
app.get('/api/youtube-playlist', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const listId = String(req.query.list || '').trim();

  if (!listId) {
    return res.status(400).json({ sucesso: false, error: 'ID da playlist do YouTube não informado.' });
  }

  try {
    const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
    const ytRes = await fetch(playlistUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!ytRes.ok) {
      return res.status(ytRes.status).json({ sucesso: false, error: 'Não foi possível carregar a playlist do YouTube.' });
    }

    const html = await ytRes.text();
    let title = 'Playlist do YouTube';
    const tracks: any[] = [];

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace('- YouTube', '').trim();
    }

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
      } catch {}
    }

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

    if (tracks.length === 0) {
      return res.status(404).json({ sucesso: false, error: 'Nenhuma música encontrada nesta playlist do YouTube.' });
    }

    return res.json({
      sucesso: true,
      playlist_id: listId,
      nome_playlist: title,
      capa_playlist: tracks[0]?.capa || '',
      total_faixas: tracks.length,
      faixas: tracks
    });
  } catch (e: any) {
    return res.status(502).json({
      sucesso: false,
      error: 'Erro ao consultar YouTube: ' + String(e?.message || e)
    });
  }
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
