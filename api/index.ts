import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const COOKIE_NAME = 'pobremusic_spotify';

let memoryConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID || '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || '',
  accessToken: process.env.SPOTIFY_ACCESS_TOKEN || '',
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || '',
  tokenExpiresAt: 0
};

function getSecret() {
  return process.env.SPOTIFY_SESSION_SECRET || memoryConfig.clientSecret || 'pobremusic-local-session-secret';
}

function getKey() {
  return createHash('sha256').update(getSecret()).digest();
}

function encryptSession(value: object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptSession(value?: string) {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')) as {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
    };
  } catch {
    return null;
  }
}

function parseCookies(req: VercelRequest) {
  const header = String(req.headers.cookie || '');
  return Object.fromEntries(header.split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

function setSpotifyCookie(res: VercelResponse, session: { accessToken: string; refreshToken?: string; expiresAt: number }) {
  const value = encryptSession(session);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
}

function clearSpotifyCookie(res: VercelResponse) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

function getDefaultRedirectUri(req: VercelRequest) {
  if (memoryConfig.redirectUri) return memoryConfig.redirectUri;
  if (process.env.SPOTIFY_REDIRECT_URI) return process.env.SPOTIFY_REDIRECT_URI;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers.host;
  return `${proto}://${host}/auth/spotify/callback`;
}

function getRequestRedirectUri(req: VercelRequest) {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '';
  const fallback = getDefaultRedirectUri(req);
  if (!requested) return fallback;
  try {
    const requestedUrl = new URL(requested);
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host = req.headers.host || '';
    if (requestedUrl.origin === `${proto}://${host}` && (requestedUrl.pathname === '/auth/spotify/callback' || requestedUrl.pathname === '/auth/spotify/callback/')) return requested;
  } catch {}
  return fallback;
}

function popupResponse(res: VercelResponse, type: string, payload: unknown, status = 200) {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  return res.status(status).send(`<!doctype html><html><body style="background:#090d16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><p>Spotify: ${status === 200 ? 'Conectado' : 'Erro'}. Esta janela será fechada.</p><script>try{if(window.opener){window.opener.postMessage({type:${JSON.stringify(type)},...${serialized}},window.location.origin);}}catch(e){}setTimeout(function(){window.close()},500);</script></body></html>`);
}

async function exchangeRefreshToken(refreshToken: string, clientId: string, clientSecret: string) {
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  if (!response.ok) throw new Error(`Falha ao renovar token Spotify: ${await response.text()}`);
  return response.json();
}

async function getValidAccessToken(req: VercelRequest, res: VercelResponse): Promise<string> {
  const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
  const authHeader = String(req.headers.authorization || '');
  const headerToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (headerToken) return headerToken;

  const cookieSession = decryptSession(parseCookies(req)[COOKIE_NAME]);
  if (cookieSession?.accessToken && Date.now() < Number(cookieSession.expiresAt || 0) - 60000) return cookieSession.accessToken;

  if (cookieSession?.refreshToken && clientId && clientSecret) {
    const refreshed = await exchangeRefreshToken(cookieSession.refreshToken, clientId, clientSecret);
    const expiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
    setSpotifyCookie(res, { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || cookieSession.refreshToken, expiresAt });
    return refreshed.access_token;
  }

  const refreshToken = memoryConfig.refreshToken || process.env.SPOTIFY_REFRESH_TOKEN || '';
  if (refreshToken && clientId && clientSecret) {
    const refreshed = await exchangeRefreshToken(refreshToken, clientId, clientSecret);
    memoryConfig.accessToken = refreshed.access_token;
    memoryConfig.refreshToken = refreshed.refresh_token || refreshToken;
    memoryConfig.tokenExpiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
    return refreshed.access_token;
  }

  if (memoryConfig.accessToken && Date.now() < memoryConfig.tokenExpiresAt - 60000) return memoryConfig.accessToken;

  if (!clientId || !clientSecret) throw new Error('Credenciais do Spotify não configuradas.');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });
  if (!response.ok) throw new Error(`Falha na autenticação Spotify: ${await response.text()}`);
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
    if (response.status === 429) throw new Error(`Spotify 429: Limite atingido. Aguarde ${response.headers.get('retry-after') || '5'} segundos.`);
    if (!response.ok) throw new Error(`Spotify ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (Array.isArray(data.items)) allItems.push(...data.items);
    nextUrl = typeof data.next === 'string' && data.next ? data.next : null;
  }
  return allItems;
}

async function fetchSpotifyUser(token: string) {
  const response = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Spotify user ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return { id: data.id, display_name: data.display_name || data.id, email: data.email || '', images: data.images || [], product: data.product || 'free' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const defaultRedirectUri = getDefaultRedirectUri(req);

  if (url.includes('/status') || url.includes('/config-status')) {
    const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
    const configured = Boolean(clientId.trim() && clientSecret.trim());
    const session = decryptSession(parseCookies(req)[COOKIE_NAME]);
    return res.status(200).json({ configured, hasClientId: Boolean(clientId.trim()), hasClientSecret: Boolean(clientSecret.trim()), isAuthorized: Boolean(session?.accessToken || memoryConfig.accessToken), spotifyConfigured: configured });
  }

  if (url.includes('/auth/spotify/url')) {
    const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
    if (!clientId) return res.status(400).json({ configured: false, error: 'SPOTIFY_CLIENT_ID não configurado.' });
    const spotifyRedirect = getRequestRedirectUri(req);
    const state = randomBytes(24).toString('hex');
    const scopes = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-private', 'user-read-email', 'user-library-read'].join(' ');
    const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, scope: scopes, redirect_uri: spotifyRedirect, state }).toString()}`;
    res.setHeader('Set-Cookie', `pobremusic_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return res.status(200).json({ configured: true, url: authUrl, redirectUri: spotifyRedirect });
  }

  if (url.includes('/set-credentials') && req.method === 'POST') {
    const { clientId, clientSecret, redirectUri: suppliedRedirect } = req.body || {};
    if (!clientId || !clientSecret) return res.status(400).json({ error: 'Client ID e Client Secret são obrigatórios.' });
    memoryConfig.clientId = String(clientId).trim();
    memoryConfig.clientSecret = String(clientSecret).trim();
    if (suppliedRedirect) memoryConfig.redirectUri = String(suppliedRedirect).trim();
    memoryConfig.accessToken = '';
    memoryConfig.refreshToken = '';
    memoryConfig.tokenExpiresAt = 0;
    return res.status(200).json({ success: true, configured: true, message: 'Credenciais do Spotify salvas na sessão ativa.', redirectUri: memoryConfig.redirectUri || defaultRedirectUri });
  }

  if (url.includes('/auth/spotify/set-token') && req.method === 'POST') {
    const rawToken = req.body?.token || req.body?.accessToken;
    if (!rawToken || typeof rawToken !== 'string') return res.status(400).json({ error: 'Token do Spotify não informado.' });
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();
    try {
      const user = await fetchSpotifyUser(token);
      setSpotifyCookie(res, { accessToken: token, expiresAt: Date.now() + 3600 * 1000 });
      return res.status(200).json({ success: true, authenticated: true, user, message: `Conectado como ${user.display_name}!` });
    } catch (err: any) {
      return res.status(401).json({ error: 'Token do Spotify inválido ou expirado.', details: err?.message || String(err) });
    }
  }

  if (url.includes('/auth/spotify/demo-login') && req.method === 'POST') {
    clearSpotifyCookie(res);
    return res.status(200).json({ success: true, authenticated: true, user: { id: 'spottube_demo_user', display_name: 'Spotify VIP (Demo)', email: 'demo@spottube.app', images: [], product: 'premium' }, message: 'Modo Demonstração do Spotify ativado!' });
  }

  if (url.includes('route=callback') || url.includes('/callback')) {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const error = typeof req.query.error === 'string' ? req.query.error : '';
    if (error || !code) return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: error || 'Código ausente' }, 400);
    const cookies = parseCookies(req);
    const expectedState = cookies.pobremusic_oauth_state;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!expectedState || !state || state !== expectedState) return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: 'Falha de segurança: estado OAuth inválido ou expirado.' }, 400);

    try {
      const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
      const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
      const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : defaultRedirectUri;
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
      });
      if (!tokenRes.ok) return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: await tokenRes.text() }, tokenRes.status);
      const tokenData = await tokenRes.json();
      const expiresAt = Date.now() + Number(tokenData.expires_in || 3600) * 1000;
      setSpotifyCookie(res, { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, expiresAt });
      const user = await fetchSpotifyUser(tokenData.access_token);
      res.setHeader('Set-Cookie', [
        `${COOKIE_NAME}=${encodeURIComponent(encryptSession({ accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, expiresAt }))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        'pobremusic_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
      ]);
      return popupResponse(res, 'SPOTIFY_AUTH_SUCCESS', { user });
    } catch (err: any) {
      return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: err?.message || String(err) }, 500);
    }
  }

  if (url.includes('/auth/me')) {
    const session = decryptSession(parseCookies(req)[COOKIE_NAME]);
    if (!session?.accessToken) return res.status(200).json({ authenticated: false, user: null });
    try {
      const user = await fetchSpotifyUser(session.accessToken);
      return res.status(200).json({ authenticated: true, user });
    } catch {
      if (session.refreshToken) {
        try {
          const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || '';
          const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
          const refreshed = await exchangeRefreshToken(session.refreshToken, clientId, clientSecret);
          const expiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
          setSpotifyCookie(res, { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || session.refreshToken, expiresAt });
          const user = await fetchSpotifyUser(refreshed.access_token);
          return res.status(200).json({ authenticated: true, user });
        } catch {}
      }
      clearSpotifyCookie(res);
      return res.status(200).json({ authenticated: false, user: null, expired: true });
    }
  }

  if (url.includes('/auth/logout')) {
    clearSpotifyCookie(res);
    return res.status(200).json({ success: true, message: 'Desconectado do Spotify com sucesso.' });
  }

  if (url.includes('/my-playlists') || url.includes('route=my-playlists')) {
    try {
      const token = await getValidAccessToken(req, res);
      const all: any[] = [];
      let nextUrl: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';
      while (nextUrl) {
        const spotifyRes = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (spotifyRes.status === 401 || spotifyRes.status === 403) return res.status(401).json({ authenticated: false, needsAuth: true, error: 'A autorização do Spotify expirou.' });
        if (spotifyRes.status === 429) return res.status(429).json({ error: `Limite atingido. Aguarde ${spotifyRes.headers.get('retry-after') || '5'} segundos.` });
        if (!spotifyRes.ok) return res.status(spotifyRes.status).json({ error: await spotifyRes.text() });
        const data = await spotifyRes.json();
        if (Array.isArray(data.items)) all.push(...data.items);
        nextUrl = typeof data.next === 'string' && data.next ? data.next : null;
      }
      const playlists = all.map((p: any) => ({ id: p.id, name: p.name, description: p.description || '', total_tracks: p.items?.total ?? p.tracks?.total ?? 0, image_url: p.images?.[0]?.url || '', is_public: p.public, owner_name: p.owner?.display_name || 'Você' }));
      return res.status(200).json({ total: playlists.length, playlists });
    } catch (err: any) {
      return res.status(401).json({ error: 'Não foi possível carregar suas playlists do Spotify.', needsAuth: true, details: err?.message || String(err) });
    }
  }

  if (url.includes('/spotify-playlist') || url.includes('/playlist') || url.includes('playlistId=') || url.includes('/items')) {
    const rawInput = String(req.query.url || req.query.playlistId || req.query.id || '').trim();
    const match = rawInput.match(/(?:open\.spotify\.com\/)?(?:intl-[^/]+\/)?playlist\/([A-Za-z0-9]{10,40})/i);
    const playlistId = (match?.[1] || rawInput.split('?')[0].split('/').pop() || '').trim();
    if (!playlistId) return res.status(400).json({ sucesso: false, error: 'ID da playlist não fornecido.' });
    try {
      const token = await getValidAccessToken(req, res);
      const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?market=BR`, { headers: { Authorization: `Bearer ${token}` } });
      if (playlistRes.status === 401 || playlistRes.status === 403) return res.status(401).json({ sucesso: false, needsAuth: true, error: 'Conecte sua conta Spotify para acessar esta playlist.' });
      if (!playlistRes.ok) return res.status(playlistRes.status).json({ sucesso: false, error: 'Não foi possível acessar a playlist.', details: await playlistRes.text() });
      const playlist = await playlistRes.json();
      const allItems = await getAllPlaylistItems(playlistId, token);
      const faixas = allItems.map((item: any) => item?.track || item?.item).filter((track: any) => track && track.type === 'track').map((track: any) => ({
        nome_musica: track.name || 'Sem título',
        nome_artista: (track.artists || []).map((artist: any) => artist.name).join(', ') || 'Artista',
        album: track.album?.name || 'Álbum',
        duracao_ms: track.duration_ms || 0,
        capa: track.album?.images?.[0]?.url || '',
        spotify_id: track.id,
        spotify_url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`
      }));
      return res.status(200).json({ sucesso: true, playlist_id: playlist.id, nome_playlist: playlist.name || 'Playlist Spotify', descricao: playlist.description || '', capa_playlist: playlist.images?.[0]?.url || faixas[0]?.capa || '', total_faixas: faixas.length, total_spotify: allItems.length, faixas });
    } catch (err: any) {
      return res.status(401).json({ sucesso: false, needsAuth: true, error: 'Erro ao carregar playlist do Spotify.', details: err?.message || String(err) });
    }
  }

  return res.status(404).json({ error: 'Rota não encontrada.' });
}
