/**
 * PobreMusic - Spotify / YouTube API handler
 *
 * Objetivo:
 * - Autenticar a conta Spotify via OAuth.
 * - Listar as playlists do usuário.
 * - Ler itens das playlists que o usuário possui/colabora.
 * - Importar somente metadados das músicas.
 * - Opcionalmente pesquisar a música no YouTube Data API para obter um videoId.
 *
 * Variáveis de ambiente:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   YOUTUBE_API_KEY (opcional, necessário para /youtube-search)
 *
 * Redirect URI:
 *   https://pobremusic.vercel.app/auth/spotify/callback
 */

export default async function handler(req: any, res: any) {
  const requestUrl = new URL(
    req.url || '/',
    `https://${req.headers.host || 'pobremusic.vercel.app'}`
  );

  const path = requestUrl.pathname;

  const clientId = process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
  const youtubeApiKey = process.env.YOUTUBE_API_KEY || '';

  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ||
    'https://pobremusic.vercel.app/auth/spotify/callback';

  // CORS: não use "*" junto com credentials=true.
  const origin = req.headers.origin || '';
  const allowedOrigins = new Set([
    'https://pobremusic.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ]);

  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,OPTIONS,PATCH,DELETE,POST,PUT'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
  ].join(' ');

  const authUrl =
    `https://accounts.spotify.com/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      show_dialog: 'true',
    }).toString();

  function getBearerToken() {
    const header = req.headers.authorization || '';
    return header.replace(/^Bearer\s+/i, '').trim();
  }

  function getPlaylistId(value: string) {
    if (!value) return '';

    let input = value.trim();

    // spotify:playlist:ID
    const uriMatch = input.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
    if (uriMatch) return uriMatch[1];

    // URL: https://open.spotify.com/playlist/ID?... 
    try {
      const parsed = new URL(input);
      const match = parsed.pathname.match(/\/playlist\/([A-Za-z0-9]+)/);
      if (match) return match[1];
    } catch {
      // Não é uma URL; pode ser somente o ID.
    }

    // /playlist/ID ou playlist/ID
    const pathMatch = input.match(/(?:^|\/)playlist\/([A-Za-z0-9]+)/);
    if (pathMatch) return pathMatch[1];

    // Somente ID
    if (/^[A-Za-z0-9]{10,}$/.test(input)) return input;

    return '';
  }

  async function spotifyRequest(
    endpoint: string,
    token: string,
    init: RequestInit = {}
  ) {
    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    let data: any = null;
    const text = await response.text();

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return { response, data };
  }

  function spotifyErrorResponse(
    resObj: any,
    response: Response,
    data: any,
    fallback: string
  ) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) resObj.setHeader('Retry-After', retryAfter);

      return resObj.status(429).json({
        error: 'SPOTIFY_RATE_LIMIT',
        message:
          'O Spotify limitou temporariamente as requisições. Aguarde e tente novamente.',
        retryAfter,
        spotifyStatus: 429,
      });
    }

    if (response.status === 401) {
      return resObj.status(401).json({
        error: 'SPOTIFY_UNAUTHORIZED',
        message: 'A conexão com o Spotify expirou. Conecte novamente.',
        spotifyStatus: 401,
      });
    }

    if (response.status === 403) {
      return resObj.status(403).json({
        error: 'SPOTIFY_FORBIDDEN',
        message:
          'O Spotify não permite que esta playlist seja lida por esta conta.',
        spotifyStatus: 403,
        details: data?.error?.message || null,
      });
    }

    return resObj.status(response.status || 500).json({
      error: 'SPOTIFY_ERROR',
      message: data?.error?.message || fallback,
      spotifyStatus: response.status,
      details: data?.error || null,
    });
  }

  // 1. URL para iniciar OAuth
  if (
    path === '/auth/spotify/url' ||
    (path === '/auth/spotify' && req.method === 'GET')
  ) {
    if (!clientId) {
      return res.status(500).json({
        error: 'SPOTIFY_NOT_CONFIGURED',
        message: 'SPOTIFY_CLIENT_ID não está configurado.',
      });
    }

    if (
      req.headers.accept &&
      req.headers.accept.includes('application/json')
    ) {
      return res.status(200).json({
        url: authUrl,
        authUrl,
      });
    }

    return res.redirect(302, authUrl);
  }

  // 2. Callback OAuth
  if (path === '/auth/spotify/callback') {
    const code = requestUrl.searchParams.get('code');
    const oauthError = requestUrl.searchParams.get('error');

    if (oauthError) {
      return res.status(400).send(
        `Autorização do Spotify cancelada ou negada: ${oauthError}`
      );
    }

    if (!code) {
      return res.status(400).send('Código de autorização não encontrado.');
    }

    if (!clientId || !clientSecret) {
      return res.status(500).send(
        'Spotify não configurado no servidor. Defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET.'
      );
    }

    try {
      const tokenRes = await fetch(
        'https://accounts.spotify.com/api/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization:
              'Basic ' +
              Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }).toString(),
        }
      );

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        return res.status(tokenRes.status).send(
          `Erro Spotify: ${
            tokenData.error_description || tokenData.error || 'falha ao obter token'
          }`
        );
      }

      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const userData = await meRes.json();

      if (!meRes.ok) {
        return res.status(meRes.status).send(
          `Erro ao obter perfil Spotify: ${
            userData?.error?.message || 'falha'
          }`
        );
      }

      const payload = {
        type: 'SPOTIFY_AUTH_SUCCESS',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresIn: tokenData.expires_in || 3600,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
        user: userData,
      };

      // postMessage é usado apenas para a janela que abriu o OAuth.
      // A origem é limitada ao domínio do app.
      const safeOrigin = 'https://pobremusic.vercel.app';

      return res.status(200).send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Spotify conectado</title>
</head>
<body style="background:#121212;color:#1DB954;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center">
    <h2>Spotify conectado!</h2>
    <p style="color:#fff">Atualizando suas playlists...</p>
  </div>

  <script>
    const payload = ${JSON.stringify(payload)};

    localStorage.setItem('spotify_token', payload.accessToken);
    localStorage.setItem('spotify_access_token', payload.accessToken);
    localStorage.setItem('spotify_refresh_token', payload.refreshToken || '');
    localStorage.setItem('spotify_expires_at', String(payload.expiresAt));
    localStorage.setItem('spotify_user', JSON.stringify(payload.user));

    try {
      if (window.opener) {
        window.opener.postMessage(
          payload,
          ${JSON.stringify(safeOrigin)}
        );
      }
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      if (window.opener) {
        window.close();
      } else {
        window.location.href = '/';
      }
    }, 1000);
  </script>
</body>
</html>
      `);
    } catch (err: any) {
      return res.status(500).send(
        `Erro interno ao conectar Spotify: ${err?.message || 'erro desconhecido'}`
      );
    }
  }

  // 3. Renovação do access token
  if (path === '/auth/spotify/refresh') {
    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: 'SPOTIFY_NOT_CONFIGURED',
        message:
          'SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET precisam estar configurados.',
      });
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};

    const refreshToken = body.refreshToken || '';

    if (!refreshToken) {
      return res.status(400).json({
        error: 'REFRESH_TOKEN_REQUIRED',
        message: 'Refresh token não informado.',
      });
    }

    try {
      const tokenRes = await fetch(
        'https://accounts.spotify.com/api/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization:
              'Basic ' +
              Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }).toString(),
        }
      );

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        return res.status(tokenRes.status).json({
          error: 'SPOTIFY_REFRESH_FAILED',
          message:
            tokenData.error_description ||
            tokenData.error ||
            'Não foi possível renovar o token.',
        });
      }

      return res.status(200).json({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken,
        expiresIn: tokenData.expires_in || 3600,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'SPOTIFY_REFRESH_ERROR',
        message: err?.message || 'Erro ao renovar token.',
      });
    }
  }

  // 4. Status real da configuração
  if (path === '/config-status' || path === '/status') {
    return res.status(200).json({
      configured: Boolean(clientId && clientSecret),
      hasCredentials: Boolean(clientId && clientSecret),
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      spotifyConfigured: Boolean(clientId && clientSecret),
      hasYouTubeKey: Boolean(youtubeApiKey),
      clientId: clientId || null,
      authenticated: Boolean(getBearerToken()),
    });
  }

  // 5. Perfil Spotify
  if (path === '/auth/me' || path === '/me') {
    const token = getBearerToken();

    if (!token) {
      return res.status(401).json({
        authenticated: false,
        message: 'Token Spotify não informado.',
      });
    }

    try {
      const { response, data } = await spotifyRequest('/me', token);

      if (!response.ok) {
        return spotifyErrorResponse(
          res,
          response,
          data,
          'Não foi possível obter o perfil Spotify.'
        );
      }

      return res.status(200).json({
        authenticated: true,
        user: data,
      });
    } catch (err: any) {
      return res.status(500).json({
        authenticated: false,
        error: 'SPOTIFY_CONNECTION_ERROR',
        message: err?.message || 'Erro de conexão.',
      });
    }
  }

  // 6. Minhas playlists
  if (
    path === '/my-playlists' ||
    path === '/playlists' ||
    path === '/spotify-playlists'
  ) {
    const token = getBearerToken();

    if (!token) {
      return res.status(401).json({
        error: 'SPOTIFY_TOKEN_REQUIRED',
        message: 'Conecte sua conta Spotify primeiro.',
      });
    }

    try {
      const allItems: any[] = [];
      let nextUrl =
        'https://api.spotify.com/v1/me/playlists?limit=50';

      // Paginação para não perder playlists além da primeira página.
      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const data = await response.json();

        if (!response.ok) {
          return spotifyErrorResponse(
            res,
            response,
            data,
            'Não foi possível carregar suas playlists.'
          );
        }

        if (Array.isArray(data.items)) {
          allItems.push(...data.items);
        }

        nextUrl = data.next || '';
      }

      return res.status(200).json({
        items: allItems,
        total: allItems.length,
        limit: allItems.length,
        offset: 0,
        next: null,
        previous: null,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'PLAYLISTS_LOAD_ERROR',
        message: err?.message || 'Erro ao carregar playlists.',
      });
    }
  }

  // 7. Carregar uma playlist específica do usuário.
  // IMPORTANTE: usa /items, que é o endpoint atual do Spotify.
  if (
    path === '/spotify-playlist' ||
    path === '/playlist' ||
    path === '/playlist-items' ||
    path === '/spotify/playlist'
  ) {
    const token = getBearerToken();

    if (!token) {
      return res.status(401).json({
        error: 'SPOTIFY_TOKEN_REQUIRED',
        message: 'Conecte sua conta Spotify primeiro.',
      });
    }

    const rawTarget =
      requestUrl.searchParams.get('url') ||
      requestUrl.searchParams.get('id') ||
      '';

    const playlistId = getPlaylistId(rawTarget);

    if (!playlistId) {
      return res.status(400).json({
        error: 'INVALID_PLAYLIST_ID',
        message: 'Não foi possível identificar o ID da playlist.',
      });
    }

    try {
      // Primeiro pega os metadados.
      const playlistResult = await spotifyRequest(
        `/playlists/${encodeURIComponent(playlistId)}`,
        token
      );

      if (!playlistResult.response.ok) {
        return spotifyErrorResponse(
          res,
          playlistResult.response,
          playlistResult.data,
          'Não foi possível acessar esta playlist.'
        );
      }

      const playlist = playlistResult.data;

      // Desde fevereiro de 2026, o Spotify usa /items e o campo items.
      const importedItems: any[] = [];
      let nextUrl =
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(
          playlistId
        )}/items?limit=50`;

      while (nextUrl) {
        const itemsRes = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const itemsData = await itemsRes.json();

        if (!itemsRes.ok) {
          return spotifyErrorResponse(
            res,
            itemsRes,
            itemsData,
            'Não foi possível carregar as músicas da playlist.'
          );
        }

        if (Array.isArray(itemsData.items)) {
          importedItems.push(...itemsData.items);
        }

        nextUrl = itemsData.next || '';
      }

      // Normaliza somente o que o PobreMusic precisa para pesquisar no YouTube.
      const tracks = importedItems
        .map((entry: any, index: number) => {
          const item = entry?.item || entry?.track || null;

          if (!item || item.type === 'episode') return null;

          const artists = Array.isArray(item.artists)
            ? item.artists.map((artist: any) => artist?.name).filter(Boolean)
            : [];

          return {
            position: index,
            spotifyId: item.id || null,
            spotifyUri: item.uri || null,
            name: item.name || 'Música sem nome',
            artist: artists.join(', '),
            artists,
            album: item.album?.name || '',
            albumImage:
              item.album?.images?.[0]?.url ||
              item.album?.images?.[1]?.url ||
              '',
            duration_ms: item.duration_ms || 0,
            spotifyUrl:
              item.external_urls?.spotify ||
              `https://open.spotify.com/track/${item.id || ''}`,
            youtubeQuery: `${item.name || ''} ${artists.join(' ')}`.trim(),
          };
        })
        .filter(Boolean);

      return res.status(200).json({
        id: playlist.id || playlistId,
        name: playlist.name || 'Playlist Importada',
        description: playlist.description || '',
        images: playlist.images || [],
        owner: playlist.owner || null,
        spotifyUrl:
          playlist.external_urls?.spotify ||
          `https://open.spotify.com/playlist/${playlistId}`,
        total: tracks.length,
        tracks: {
          items: tracks,
          total: tracks.length,
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'PLAYLIST_LOAD_ERROR',
        message: err?.message || 'Erro ao carregar playlist.',
      });
    }
  }

  // 8. Pesquisa de músicas no YouTube Data API v3.
  // Retorna somente metadados/videoId para o frontend usar no player permitido.
  if (path === '/youtube-search' || path === '/youtube/search') {
    if (!youtubeApiKey) {
      return res.status(503).json({
        error: 'YOUTUBE_NOT_CONFIGURED',
        message: 'YOUTUBE_API_KEY não está configurada.',
      });
    }

    const query =
      requestUrl.searchParams.get('q') ||
      requestUrl.searchParams.get('query') ||
      '';

    if (!query.trim()) {
      return res.status(400).json({
        error: 'YOUTUBE_QUERY_REQUIRED',
        message: 'Informe o nome da música para pesquisar.',
      });
    }

    try {
      const ytUrl =
        'https://www.googleapis.com/youtube/v3/search?' +
        new URLSearchParams({
          part: 'snippet',
          q: query.trim(),
          type: 'video',
          maxResults: '5',
          videoEmbeddable: 'true',
          videoSyndicated: 'true',
          key: youtubeApiKey,
        }).toString();

      const ytRes = await fetch(ytUrl);
      const ytData = await ytRes.json();

      if (!ytRes.ok) {
        return res.status(ytRes.status).json({
          error: 'YOUTUBE_API_ERROR',
          message:
            ytData?.error?.message ||
            'Erro ao pesquisar no YouTube.',
          details: ytData?.error?.errors || null,
        });
      }

      const results = (ytData.items || [])
        .filter((item: any) => item?.id?.videoId)
        .map((item: any) => ({
          videoId: item.id.videoId,
          title: item.snippet?.title || '',
          channelTitle: item.snippet?.channelTitle || '',
          description: item.snippet?.description || '',
          thumbnail:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            '',
          youtubeUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          embedUrl: `https://www.youtube.com/embed/${item.id.videoId}`,
        }));

      return res.status(200).json({
        query,
        results,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'YOUTUBE_SEARCH_ERROR',
        message: err?.message || 'Erro ao pesquisar no YouTube.',
      });
    }
  }

  // 9. Health check
  if (path === '/' || path === '/api' || path === '/health') {
    return res.status(200).json({
      status: 'ok',
      configured: Boolean(clientId && clientSecret),
      spotify: Boolean(clientId && clientSecret),
      youtube: Boolean(youtubeApiKey),
    });
  }

  return res.status(404).json({
    error: 'NOT_FOUND',
    path,
  });
}
