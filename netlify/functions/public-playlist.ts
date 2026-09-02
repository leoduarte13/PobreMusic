import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  const params = event.queryStringParameters || {};
  const rawUrl = String(params.url || '').trim();
  const m = rawUrl.match(/(?:spotify\.com\/(?:intl-[^/]+\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]+)/i);
  const type = m ? m[1].toLowerCase() : 'playlist';
  const id = m ? m[2] : rawUrl.split('?')[0].split('/').pop()?.replace(/[^A-Za-z0-9]/g, '') || '';

  if (!id || id.length < 10) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ sucesso: false, error: 'Link do Spotify inválido. Cole o link de uma playlist, álbum ou música.' })
    };
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
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          sucesso: true,
          nome_playlist: playlistName,
          capa_playlist: coverUrl || faixas[0]?.capa || '',
          total_faixas: faixas.length,
          faixas
        })
      };
    }

    // Method 4: oEmbed Fallback
    try {
      const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`);
      if (oembedRes.ok) {
        const oembedData: any = await oembedRes.json();
        const title = String(oembedData.title || 'Playlist do Spotify');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
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
          })
        };
      }
    } catch {}

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        sucesso: false,
        error: 'Nenhuma música encontrada nesta playlist. Verifique se o link é público.'
      })
    };
  } catch (e: any) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ sucesso: false, error: 'Erro ao consultar Spotify: ' + String(e?.message || e) })
    };
  }
};
