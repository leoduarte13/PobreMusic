import type { VercelRequest, VercelResponse } from '@vercel/node';

// Configurações lidas do ambiente Vercel
let memoryConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || '',
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN || '',
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || '',
  tokenExpiresAt: 0
};

// Configuração de CORS
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

// Renovar token expirado
async function getValidAccessToken(): Promise<string> {
  const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
  const refreshToken = memoryConfig.refreshToken || process.env.SPOTIFY_REFRESH_TOKEN || '';

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais do Spotify não configuradas (Client ID / Secret ausentes).');
  }

  // Se já temos um access token válido e não expirou, reutiliza
  if (memoryConfig.accessToken && Date.now() < memoryConfig.tokenExpiresAt - 60000) {
    return memoryConfig.accessToken;
  }

  // Se temos refresh token do usuário, renova o token do usuário
  if (refreshToken) {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Falha ao renovar token com refresh_token: ${errText}`);
    }

    const data = await response.json();
    memoryConfig.accessToken = data.access_token;
    memoryConfig.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    return data.access_token;
  }

  // Fallback: Client Credentials (apenas para itens 100% públicos)
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Falha na autenticação client_credentials: ${errText}`);
  }

  const data = await response.json();
  memoryConfig.accessToken = data.access_token;
  memoryConfig.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return data.access_token;
  async function getAllPlaylistItems(
  playlistId: string,
  token: string
): Promise<any[]> {
  const allItems: any[] = [];
  let url:
    | string
    | null =
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(
      playlistId
    )}/items?limit=50&market=BR`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Spotify ${response.status}: ${text}`
      );
    }

    const data = await response.json();

    if (Array.isArray(data.items)) {
      allItems.push(...data.items);
    }

    url = data.next || null;
  }

  return allItems;
}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';

  // 1. ROTA DE STATUS REAL
  if (url.includes('/status') || url.includes('/config-status')) {
    const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
    const hasToken = Boolean(memoryConfig.accessToken || memoryConfig.refreshToken || process.env.SPOTIFY_ACCESS_TOKEN);

    const hasId = Boolean(clientId && clientId.trim() !== '');
    const hasSecret = Boolean(clientSecret && clientSecret.trim() !== '');

    return res.status(200).json({
      configured: hasId && hasSecret,
      hasClientId: hasId,
      hasClientSecret: hasSecret,
      isAuthorized: hasToken,
      spotifyConfigured: hasId && hasSecret
    });
  }

  // 2. SALVAR CREDENCIAIS
  if (url.includes('/set-credentials') && req.method === 'POST') {
    const { clientId, clientSecret, redirectUri, accessToken, refreshToken } = req.body || {};

    if (clientId) memoryConfig.clientId = clientId.trim();
    if (clientSecret) memoryConfig.clientSecret = clientSecret.trim();
    if (redirectUri) memoryConfig.redirectUri = redirectUri.trim();
    if (accessToken) memoryConfig.accessToken = accessToken.trim();
    if (refreshToken) memoryConfig.refreshToken = refreshToken.trim();

    return res.status(200).json({
      success: true,
      configured: Boolean(memoryConfig.clientId && memoryConfig.clientSecret),
      message: 'Credenciais atualizadas na sessão ativa.'
    });
  }

  // 3. ROTA DE LOGIN OAUTH (Redirecionamento)
  if (url.includes('/login')) {
    const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const redirectUri = memoryConfig.redirectUri || process.env.SPOTIFY_REDIRECT_URI || `${proto}://${host}/api?route=callback`;

    if (!clientId) {
      return res.status(400).json({ error: 'SPOTIFY_CLIENT_ID não está configurado.' });
    }

    const scopes = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-private'].join(' ');
    const spotifyAuthUrl = `https://accounts.spotify.com/authorize?` + new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri
    }).toString();

    return res.redirect(302, spotifyAuthUrl);
  }

  // 4. ROTA DE CALLBACK OAUTH
  if (url.includes('route=callback') || url.includes('/callback')) {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error || !code) {
      return res.status(400).send(`Erro na autorização do Spotify: ${error || 'Código ausente'}`);
    }

    try {
      const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
      const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const redirectUri = memoryConfig.redirectUri || process.env.SPOTIFY_REDIRECT_URI || `${proto}://${host}/api?route=callback`;

      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });

      if (!tokenRes.ok) {
        const errorData = await tokenRes.text();
        return res.status(tokenRes.status).json({ error: 'Falha ao trocar código por token', details: errorData });
      }

      const tokenData = await tokenRes.json();
      memoryConfig.accessToken = tokenData.access_token;
      memoryConfig.refreshToken = tokenData.refresh_token;
      memoryConfig.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);

      // Redireciona de volta para a raiz do app
      return res.redirect(302, '/?auth=success');
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro interno no callback', details: err.message });
    }
  }

  // 5. BUSCAR PLAYLISTS DO USUÁRIO (/me/playlists)
  if (url.includes('/my-playlists') || url.includes('route=my-playlists')) {
    try {
      const token = await getValidAccessToken();
      const spotifyRes = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (spotifyRes.status === 429) {
        const retryAfter = spotifyRes.headers.get('retry-after') || '5';
        return res.status(429).json({ error: `Limite atingido. Aguarde ${retryAfter} segundos.`, retryAfter });
      }

      const data = await spotifyRes.json();
      return res.status(spotifyRes.status).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao buscar playlists do usuário', details: err.message });
    }
  }

  // 6. BUSCAR ITENS DE UMA PLAYLIST ESPECÍFICA
if (
  url.includes('/spotify-playlist') ||
  url.includes('/playlist') ||
  url.includes('playlistId=') ||
  url.includes('/items')
) {
  const playlistId =
    (req.query.playlistId ||
      req.query.id ||
      req.query.url ||
      url.split('/playlist/')[1]?.split('/')[0]?.split('?')[0]) as string;

  if (!playlistId) {
    return res.status(400).json({
      sucesso: false,
      error: 'ID da playlist não fornecido.'
    });
  }

  try {
    const token = await getValidAccessToken();

    // Buscar metadados da playlist
    const playlistRes = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(
        playlistId
      )}?market=BR`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!playlistRes.ok) {
      const errorText = await playlistRes.text();

      return res.status(playlistRes.status).json({
        sucesso: false,
        error: 'Não foi possível acessar a playlist.',
        details: errorText
      });
    }

    const playlist = await playlistRes.json();

    // Spotify 2026: /items, não /tracks
    const itemsRes = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(
        playlistId
      )}/items?limit=50&market=BR`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (itemsRes.status === 429) {
      const retryAfter =
        itemsRes.headers.get('retry-after') || '5';

      return res.status(429).json({
        sucesso: false,
        error: `Spotify bloqueou temporariamente. Aguarde ${retryAfter}s.`,
        retryAfter
      });
    }

    if (!itemsRes.ok) {
      const errorText = await itemsRes.text();

      return res.status(itemsRes.status).json({
        sucesso: false,
        error: 'Não foi possível carregar as músicas da playlist.',
        details: errorText
      });
    }

    const itemsData = await itemsRes.json();

    const faixas = (itemsData.items || [])
      .map((item: any) => item?.track)
      .filter((track: any) => track && track.type === 'track')
      .map((track: any) => ({
        nome_musica: track.name || 'Sem título',
        nome_artista:
          (track.artists || [])
            .map((artist: any) => artist.name)
            .join(', ') || 'Artista',
        album: track.album?.name || 'Álbum',
        duracao_ms: track.duration_ms || 0,
        capa:
          track.album?.images?.[0]?.url || '',
        spotify_id: track.id,
        spotify_url:
          track.external_urls?.spotify ||
          `https://open.spotify.com/track/${track.id}`
      }));

    return res.status(200).json({
      sucesso: true,
      playlist_id: playlist.id,
      nome_playlist: playlist.name || 'Playlist Spotify',
      descricao: playlist.description || '',
      capa_playlist:
        playlist.images?.[0]?.url ||
        faixas[0]?.capa ||
        '',
      total_faixas: faixas.length,
      total_spotify:
        itemsData.total ?? playlist.items?.total ?? faixas.length,
      faixas
    });
  } catch (err: any) {
    return res.status(500).json({
      sucesso: false,
      error: 'Erro ao carregar playlist do Spotify.',
      details: err?.message || String(err)
    });
  }
}
