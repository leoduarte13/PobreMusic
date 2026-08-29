import type { VercelRequest, VercelResponse } from '@vercel/node';

let memoryConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || '',
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN || '',
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || '',
  tokenExpiresAt: 0
};

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

async function getValidAccessToken(): Promise<string> {
  const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
  const refreshToken = memoryConfig.refreshToken || process.env.SPOTIFY_REFRESH_TOKEN || '';

  if (!clientId || !clientSecret) {
    throw new Error('Credenciais do Spotify não configuradas (Client ID / Secret ausentes).');
  }

  if (memoryConfig.accessToken && Date.now() < memoryConfig.tokenExpiresAt - 60000) {
    return memoryConfig.accessToken;
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  if (refreshToken) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });

    if (!response.ok) throw new Error(`Falha ao renovar token: ${await response.text()}`);

    const data = await response.json();
    memoryConfig.accessToken = data.access_token;
    memoryConfig.tokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
    if (data.refresh_token) memoryConfig.refreshToken = data.refresh_token;
    return data.access_token;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  if (!response.ok) throw new Error(`Falha na autenticação: ${await response.text()}`);

  const data = await response.json();
  memoryConfig.accessToken = data.access_token;
  memoryConfig.tokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return data.access_token;
}

async function getAllPlaylistItems(playlistId: string, token: string): Promise<any[]> {
  const allItems: any[] = [];
  let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50&market=BR`;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Spotify ${response.status}: ${await response.text()}`);

    const data = await response.json();
    if (Array.isArray(data.items)) allItems.push(...data.items);
    nextUrl = data.next || null;
  }

  return allItems;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';

  if (url.includes('/status') || url.includes('/config-status')) {
    const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
    const hasToken = Boolean(memoryConfig.accessToken || memoryConfig.refreshToken || process.env.SPOTIFY_ACCESS_TOKEN);
    const hasId = Boolean(clientId.trim());
    const hasSecret = Boolean(clientSecret.trim());
    return res.status(200).json({
      configured: hasId && hasSecret,
      hasClientId: hasId,
      hasClientSecret: hasSecret,
      isAuthorized: hasToken,
      spotifyConfigured: hasId && hasSecret
    });
  }

  if (url.includes('/set-credentials') && req.method === 'POST') {
    const { clientId, clientSecret, redirectUri, accessToken, refreshToken } = req.body || {};
    if (clientId) memoryConfig.clientId = String(clientId).trim();
    if (clientSecret) memoryConfig.clientSecret = String(clientSecret).trim();
    if (redirectUri) memoryConfig.redirectUri = String(redirectUri).trim();
    if (accessToken) memoryConfig.accessToken = String(accessToken).trim();
    if (refreshToken) memoryConfig.refreshToken = String(refreshToken).trim();
    memoryConfig.tokenExpiresAt = 0;
    return res.status(200).json({ success: true, configured: Boolean(memoryConfig.clientId && memoryConfig.clientSecret), message: 'Credenciais atualizadas na sessão ativa.' });
  }

  if (url.includes('/login')) {
    const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host = req.headers.host;
    const redirectUri = memoryConfig.redirectUri || process.env.SPOTIFY_REDIRECT_URI || `${proto}://${host}/api?route=callback`;
    if (!clientId) return res.status(400).json({ error: 'SPOTIFY_CLIENT_ID não está configurado.' });
    const scopes = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-private'].join(' ');
    const spotifyAuthUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, scope: scopes, redirect_uri: redirectUri }).toString()}`;
    return res.redirect(302, spotifyAuthUrl);
  }

  if (url.includes('route=callback') || url.includes('/callback')) {
    const code = req.query.code as string;
    const error = req.query.error as string;
    if (error || !code) return res.status(400).send(`Erro na autorização do Spotify: ${error || 'Código ausente'}`);

    try {
      const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
      const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
      const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
      const host = req.headers.host;
      const redirectUri = memoryConfig.redirectUri || process.env.SPOTIFY_REDIRECT_URI || `${proto}://${host}/api?route=callback`;
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
      });

      if (!tokenRes.ok) return res.status(tokenRes.status).json({ error: 'Falha ao trocar código por token', details: await tokenRes.text() });
      const tokenData = await tokenRes.json();
      memoryConfig.accessToken = tokenData.access_token;
      memoryConfig.refreshToken = tokenData.refresh_token || memoryConfig.refreshToken;
      memoryConfig.tokenExpiresAt = Date.now() + Number(tokenData.expires_in || 3600) * 1000;
      return res.redirect(302, '/?auth=success');
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro interno no callback', details: err?.message || String(err) });
    }
  }

  if (url.includes('/my-playlists') || url.includes('route=my-playlists')) {
    try {
      const token = await getValidAccessToken();
      const spotifyRes = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', { headers: { Authorization: `Bearer ${token}` } });
      if (spotifyRes.status === 429) {
        const retryAfter = spotifyRes.headers.get('retry-after') || '5';
        return res.status(429).json({ error: `Limite atingido. Aguarde ${retryAfter} segundos.`, retryAfter });
      }
      return res.status(spotifyRes.status).json(await spotifyRes.json());
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao buscar playlists do usuário', details: err?.message || String(err) });
    }
  }

  if (url.includes('/spotify-playlist') || url.includes('/playlist') || url.includes('playlistId=') || url.includes('/items')) {
    const playlistId = String(req.query.playlistId || req.query.id || req.query.url || url.split('/playlist/')[1]?.split('/')[0]?.split('?')[0] || '').trim();
    if (!playlistId) return res.status(400).json({ sucesso: false, error: 'ID da playlist não fornecido.' });

    try {
      const token = await getValidAccessToken();
      const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?market=BR`, { headers: { Authorization: `Bearer ${token}` } });
      if (!playlistRes.ok) return res.status(playlistRes.status).json({ sucesso: false, error: 'Não foi possível acessar a playlist.', details: await playlistRes.text() });

      const playlist = await playlistRes.json();
      const allItems = await getAllPlaylistItems(playlistId, token);
      const faixas = allItems
        .map((item: any) => item?.track)
        .filter((track: any) => track && track.type === 'track')
        .map((track: any) => ({
          nome_musica: track.name || 'Sem título',
          nome_artista: (track.artists || []).map((artist: any) => artist.name).join(', ') || 'Artista',
          album: track.album?.name || 'Álbum',
          duracao_ms: track.duration_ms || 0,
          capa: track.album?.images?.[0]?.url || '',
          spotify_id: track.id,
          spotify_url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`
        }));

      return res.status(200).json({
        sucesso: true,
        playlist_id: playlist.id,
        nome_playlist: playlist.name || 'Playlist Spotify',
        descricao: playlist.description || '',
        capa_playlist: playlist.images?.[0]?.url || faixas[0]?.capa || '',
        total_faixas: faixas.length,
        total_spotify: allItems.length,
        faixas
      });
    } catch (err: any) {
      return res.status(500).json({ sucesso: false, error: 'Erro ao carregar playlist do Spotify.', details: err?.message || String(err) });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada.' });
}
