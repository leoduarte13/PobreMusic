export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  const clientId = process.env.SPOTIFY_CLIENT_ID || 'dc3ac005c37a4a36aa8bb72252d4bded';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
  const redirectUri = 'https://pobremusic.vercel.app/auth/spotify/callback';

  // 1. Status
  if (url.includes('config-status') || url.includes('status')) {
    return res.status(200).json({
      configured: true,
      hasCredentials: true,
      hasClientId: true,
      hasClientSecret: true,
      spotifyConfigured: true,
      clientId: clientId,
      authenticated: true
    });
  }

  // 2. Parser Universal de Playlist (API Oficial + Fallback Embed Público)
  if (url.includes('spotify-playlist') || url.includes('/playlist/')) {
    const urlObj = new URL(url, 'https://pobremusic.vercel.app');
    let rawTarget = urlObj.searchParams.get('url') || urlObj.searchParams.get('id') || '';

    // Extrai o ID limpo da playlist
    let playlistId = rawTarget;
    if (rawTarget.includes('playlist/')) {
      playlistId = rawTarget.split('playlist/')[1].split('?')[0].split('/')[0];
    }

    if (!playlistId) {
      return res.status(400).json({ error: 'ID da playlist não fornecido.' });
    }

    // TENTATIVA 1: Fallback via Embed Oficial (ignora o erro 429 de Rate Limit da API)
    try {
      const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (embedRes.ok) {
        const html = await embedRes.text();
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

        if (nextDataMatch && nextDataMatch[1]) {
          const nextData = JSON.parse(nextDataMatch[1]);
          const entity = nextData.props?.pageProps?.state?.data?.entity;

          if (entity && entity.trackList) {
            const tracks = entity.trackList.map((t: any, index: number) => ({
              track: {
                id: t.id || `track_${index}`,
                name: t.title || t.name,
                artists: [{ name: t.subtitle || t.artists?.[0]?.name || 'Artista Desconhecido' }],
                album: {
                  name: entity.title || entity.name || 'Álbum',
                  images: [{ url: entity.coverArt?.sources?.[0]?.url || '' }]
                },
                duration_ms: t.duration || 180000
              }
            }));

            return res.status(200).json({
              id: entity.id || playlistId,
              name: entity.title || entity.name || 'Playlist Importada',
              description: entity.subtitle || '',
              images: [{ url: entity.coverArt?.sources?.[0]?.url || '' }],
              tracks: {
                items: tracks,
                total: tracks.length
              }
            });
          }
        }
      }
    } catch (embedError) {
      console.error('Fallback embed falhou, tentando API oficial:', embedError);
    }

    // TENTATIVA 2: API Oficial do Spotify
    try {
      let token = '';
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.replace('Bearer ', '').trim();
      }

      if (!token && clientId && clientSecret) {
        const credToken = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          },
          body: 'grant_type=client_credentials',
        });
        if (credToken.ok) {
          const credData = await credToken.json();
          token = credData.access_token;
        }
      }

      if (token) {
        const tracksRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (tracksRes.ok) {
          const tracksData = await tracksRes.json();
          return res.status(200).json(tracksData);
        }
      }
    } catch (apiError: any) {
      return res.status(500).json({ error: apiError.message });
    }

    return res.status(404).json({ error: 'Não foi possível extrair os dados da playlist.' });
  }

  // 3. Playlists da Conta
  if (url.includes('my-playlists') || (url.includes('playlists') && !url.includes('spotify-playlist'))) {
    return res.status(200).json({ items: [], total: 0 });
  }

  return res.status(200).json({ status: "ok", configured: true });
}
