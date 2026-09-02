import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  const params = event.queryStringParameters || {};
  const listId = String(params.list || '').trim();

  if (!listId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ sucesso: false, error: 'ID da playlist do YouTube não informado.' })
    };
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
      return {
        statusCode: ytRes.status,
        headers,
        body: JSON.stringify({ sucesso: false, error: 'Não foi possível carregar a playlist do YouTube.' })
      };
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
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ sucesso: false, error: 'Nenhuma música encontrada nesta playlist do YouTube.' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sucesso: true,
        playlist_id: listId,
        nome_playlist: title,
        capa_playlist: tracks[0]?.capa || '',
        total_faixas: tracks.length,
        faixas: tracks
      })
    };
  } catch (e: any) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        sucesso: false,
        error: 'Erro ao consultar YouTube: ' + String(e?.message || e)
      })
    };
  }
};
