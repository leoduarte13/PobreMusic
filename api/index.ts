import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const COOKIE_NAME = 'pobremusic_spotify';
const OAUTH_STATE_COOKIE = 'pobremusic_oauth_state';
const CANONICAL_CALLBACK_PATH = '/auth/spotify/callback';

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
function getKey() { return createHash('sha256').update(getSecret()).digest(); }
function encryptSession(value: object) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function decryptSession(value?: string) {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url'); const iv = raw.subarray(0, 12); const tag = raw.subarray(12, 28); const encrypted = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')) as { accessToken?: string; refreshToken?: string; expiresAt?: number };
  } catch { return null; }
}
function parseCookies(req: VercelRequest) {
  const header = String(req.headers.cookie || ''); const result: Record<string, string> = {};
  for (const part of header.split(';')) { const index = part.indexOf('='); if (index > 0) result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); }
  return result;
}
function setSpotifyCookie(res: VercelResponse, session: { accessToken: string; refreshToken?: string; expiresAt: number }) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(encryptSession(session))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
}
function setOAuthStateCookie(res: VercelResponse, state: string) {
  res.setHeader('Set-Cookie', `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
}
function clearSpotifyCookie(res: VercelResponse) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}
function getDefaultRedirectUri(req: VercelRequest) {
  const configured = process.env.SPOTIFY_REDIRECT_URI || memoryConfig.redirectUri;
  if (configured) {
    try { const parsed = new URL(configured); if (parsed.pathname === '/auth/spotify/callback' || parsed.pathname === '/auth/spotify/callback/') return `${parsed.origin}${CANONICAL_CALLBACK_PATH}`; } catch {}
  }
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]; const host = req.headers.host;
  return `${proto}://${host}${CANONICAL_CALLBACK_PATH}`;
}
function getRequestRedirectUri(req: VercelRequest) {
  const requested = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : '';
  const fallback = getDefaultRedirectUri(req); if (!requested) return fallback;
  try { const u = new URL(requested); const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]; const host = req.headers.host || ''; if (u.origin === `${proto}://${host}` && (u.pathname === CANONICAL_CALLBACK_PATH || u.pathname === `${CANONICAL_CALLBACK_PATH}/`)) return `${u.origin}${CANONICAL_CALLBACK_PATH}`; } catch {}
  return fallback;
}
function popupResponse(res: VercelResponse, type: string, payload: unknown, status = 200) {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  return res.status(status).send(`<!doctype html><html><body style="background:#090d16;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><p>Spotify: ${status === 200 ? 'Conectado' : 'Erro'}. Esta janela será fechada.</p><script>try{if(window.opener){window.opener.postMessage({type:${JSON.stringify(type)},...${serialized}},window.location.origin);}}catch(e){}setTimeout(function(){window.close()},500);</script></body></html>`);
}
async function exchangeRefreshToken(refreshToken: string, clientId: string, clientSecret: string) {
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }) });
  if (!response.ok) throw new Error(`Falha ao renovar token Spotify: ${await response.text()}`); return response.json();
}
async function getValidAccessToken(req: VercelRequest, res: VercelResponse): Promise<string> {
  const clientId = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || ''; const clientSecret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
  const headerToken = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim(); if (headerToken) return headerToken;
  const session = decryptSession(parseCookies(req)[COOKIE_NAME]);
  if (session?.accessToken && Date.now() < Number(session.expiresAt || 0) - 60000) return session.accessToken;
  if (session?.refreshToken && clientId && clientSecret) { const d = await exchangeRefreshToken(session.refreshToken, clientId, clientSecret); setSpotifyCookie(res, { accessToken: d.access_token, refreshToken: d.refresh_token || session.refreshToken, expiresAt: Date.now() + Number(d.expires_in || 3600) * 1000 }); return d.access_token; }
  if (memoryConfig.accessToken && Date.now() < memoryConfig.tokenExpiresAt - 60000) return memoryConfig.accessToken;
  if (!clientId || !clientSecret) throw new Error('Credenciais do Spotify não configuradas.');
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials' }) });
  if (!response.ok) throw new Error(`Falha na autenticação Spotify: ${await response.text()}`);
  const d = await response.json(); memoryConfig.accessToken = d.access_token; memoryConfig.tokenExpiresAt = Date.now() + Number(d.expires_in || 3600) * 1000; return d.access_token;
}
async function getAllPlaylistItems(playlistId: string, token: string): Promise<any[]> {
  const items: any[] = []; let next: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items?limit=50&market=BR`;
  while (next) { const r = await fetch(next, { headers: { Authorization: `Bearer ${token}` } }); if (r.status === 429) throw new Error(`Spotify 429: Limite atingido. Aguarde ${r.headers.get('retry-after') || '5'} segundos.`); if (!r.ok) throw new Error(`Spotify ${r.status}: ${await r.text()}`); const d = await r.json(); if (Array.isArray(d.items)) items.push(...d.items); next = typeof d.next === 'string' && d.next ? d.next : null; }
  return items;
}
async function fetchSpotifyUser(token: string) { const r = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`Spotify user ${r.status}: ${await r.text()}`); const d = await r.json(); return { id: d.id, display_name: d.display_name || d.id, email: d.email || '', images: d.images || [], product: d.product || 'free' }; }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res); if (req.method === 'OPTIONS') return res.status(200).end(); const url = req.url || '';
  if (url.includes('/status') || url.includes('/config-status')) { const id = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || ''; const secret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || ''; const session = decryptSession(parseCookies(req)[COOKIE_NAME]); return res.status(200).json({ configured: Boolean(id.trim() && secret.trim()), hasClientId: Boolean(id.trim()), hasClientSecret: Boolean(secret.trim()), isAuthorized: Boolean(session?.accessToken || memoryConfig.accessToken), spotifyConfigured: Boolean(id.trim() && secret.trim()) }); }
  if (url.includes('/auth/spotify/url')) { const id = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || ''; if (!id) return res.status(400).json({ configured: false, error: 'SPOTIFY_CLIENT_ID não configurado.' }); const redirectUri = getRequestRedirectUri(req); const state = randomBytes(24).toString('hex'); setOAuthStateCookie(res, state); const scopes = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-private', 'user-read-email', 'user-library-read'].join(' '); const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({ response_type: 'code', client_id: id, scope: scopes, redirect_uri: redirectUri, state }).toString()}`; return res.status(200).json({ configured: true, url: authUrl, redirectUri }); }
  if (url.includes('/set-credentials') && req.method === 'POST') { const { clientId, clientSecret, redirectUri } = req.body || {}; if (!clientId || !clientSecret) return res.status(400).json({ error: 'Client ID e Client Secret são obrigatórios.' }); memoryConfig.clientId = String(clientId).trim(); memoryConfig.clientSecret = String(clientSecret).trim(); if (redirectUri) memoryConfig.redirectUri = String(redirectUri).trim(); memoryConfig.accessToken = ''; memoryConfig.refreshToken = ''; memoryConfig.tokenExpiresAt = 0; return res.status(200).json({ success: true, configured: true, message: 'Credenciais do Spotify salvas na sessão ativa.', redirectUri: getDefaultRedirectUri(req) }); }
  if (url.includes('/auth/spotify/set-token') && req.method === 'POST') { const raw = req.body?.token || req.body?.accessToken; if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'Token do Spotify não informado.' }); try { const token = raw.replace(/^Bearer\s+/i, '').trim(); const user = await fetchSpotifyUser(token); setSpotifyCookie(res, { accessToken: token, expiresAt: Date.now() + 3600000 }); return res.status(200).json({ success: true, authenticated: true, user, message: `Conectado como ${user.display_name}!` }); } catch (e: any) { return res.status(401).json({ error: 'Token do Spotify inválido ou expirado.', details: e?.message || String(e) }); } }
  if (url.includes('/auth/spotify/demo-login') && req.method === 'POST') { clearSpotifyCookie(res); return res.status(200).json({ success: true, authenticated: true, user: { id: 'spottube_demo_user', display_name: 'Spotify VIP (Demo)', email: 'demo@spottube.app', images: [], product: 'premium' }, message: 'Modo Demonstração do Spotify ativado!' }); }
  if (url.includes('/auth/spotify/callback') || url.includes('route=callback') || url.includes('/callback')) {
    const code = typeof req.query.code === 'string' ? req.query.code : ''; const error = typeof req.query.error === 'string' ? req.query.error : ''; if (error || !code) return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: error || 'Código ausente' }, 400);
    const cookies = parseCookies(req); const expectedState = cookies[OAUTH_STATE_COOKIE]; const state = typeof req.query.state === 'string' ? req.query.state : ''; if (!expectedState || !state || state !== expectedState) return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: 'Falha de segurança: estado OAuth inválido ou expirado.' }, 400);
    try { const id = memoryConfig.clientId || process.env.SPOTIFY_CLIENT_ID || ''; const secret = memoryConfig.clientSecret || process.env.SPOTIFY_CLIENT_SECRET || ''; const redirectUri = getDefaultRedirectUri(req); const tokenRes = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }) }); if (!tokenRes.ok) return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: await tokenRes.text() }, tokenRes.status); const td = await tokenRes.json(); const expiresAt = Date.now() + Number(td.expires_in || 3600) * 1000; const user = await fetchSpotifyUser(td.access_token); res.setHeader('Set-Cookie', [`${COOKIE_NAME}=${encodeURIComponent(encryptSession({ accessToken: td.access_token, refreshToken: td.refresh_token, expiresAt }))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`, `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`]); return popupResponse(res, 'SPOTIFY_AUTH_SUCCESS', { user }); } catch (e: any) { return popupResponse(res, 'SPOTIFY_AUTH_ERROR', { error: e?.message || String(e) }, 500); }
  }
  if (url.includes('/auth/me')) { const session = decryptSession(parseCookies(req)[COOKIE_NAME]); if (!session?.accessToken) return res.status(401).json({ authenticated: false }); try { const token = await getValidAccessToken(req, res); return res.status(200).json({ authenticated: true, user: await fetchSpotifyUser(token) }); } catch (e: any) { return res.status(401).json({ authenticated: false, error: e?.message || String(e) }); } }
  if (url.includes('/auth/logout')) { clearSpotifyCookie(res); return res.status(200).json({ success: true }); }
  if (url.includes('/my-playlists') || url.includes('route=my-playlists')) { try { const token = await getValidAccessToken(req, res); const r = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', { headers: { Authorization: `Bearer ${token}` } }); if (r.status === 429) return res.status(429).json({ error: 'Limite do Spotify atingido.', retryAfter: r.headers.get('retry-after') || '5' }); return res.status(r.status).json(await r.json()); } catch (e: any) { return res.status(500).json({ error: 'Erro ao buscar playlists do usuário.', details: e?.message || String(e) }); } }
  if (url.includes('/spotify-playlist') || url.includes('/playlist') || url.includes('playlistId=') || url.includes('/items')) { const playlistId = String(req.query.playlistId || req.query.id || req.query.url || url.split('/playlist/')[1]?.split('/')[0]?.split('?')[0] || '').trim(); if (!playlistId) return res.status(400).json({ sucesso: false, error: 'ID da playlist não fornecido.' }); try { const token = await getValidAccessToken(req, res); const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?market=BR`, { headers: { Authorization: `Bearer ${token}` } }); if (!playlistRes.ok) return res.status(playlistRes.status).json({ sucesso: false, error: 'Não foi possível acessar a playlist.', details: await playlistRes.text() }); const playlist = await playlistRes.json(); const allItems = await getAllPlaylistItems(playlistId, token); const faixas = allItems.map((i: any) => i?.track).filter((t: any) => t && t.type === 'track').map((t: any) => ({ nome_musica: t.name || 'Sem título', nome_artista: (t.artists || []).map((a: any) => a.name).join(', ') || 'Artista', album: t.album?.name || 'Álbum', duracao_ms: t.duration_ms || 0, capa: t.album?.images?.[0]?.url || '', spotify_id: t.id, spotify_url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}` })); return res.status(200).json({ sucesso: true, playlist_id: playlist.id, nome_playlist: playlist.name || 'Playlist Spotify', descricao: playlist.description || '', capa_playlist: playlist.images?.[0]?.url || faixas[0]?.capa || '', total_faixas: faixas.length, total_spotify: allItems.length, faixas }); } catch (e: any) { return res.status(500).json({ sucesso: false, error: 'Erro ao carregar playlist do Spotify.', details: e?.message || String(e) }); } }
  return res.status(404).json({ error: 'Rota não encontrada.' });
}
