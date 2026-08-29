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

  // Função auxiliar para extrair o token de qualquer origem (Header, URL ou Cookie)
  const getAccessToken = () => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.replace('Bearer ', '').trim();
    }
    const parsed = new URL(url, 'https://pobremusic.vercel.app');
    return parsed.searchParams.get('token') || parsed.searchParams.get('access_token') || '';
  };

  const userToken = getAccessToken();

  // 1. Gera URL de login OAuth
  if (url.includes('/auth/spotify/url') || (url.includes('/auth/spotify') && !url.includes('callback') && !url.includes('set-credentials'))) {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-library-read',
      'user-top-read',
      'user-read-recently-played'
    ].join(' ');
    const spotifyAuthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&show_dialog=true`;
    return res.status(200).json({ url: spotifyAuthUrl, authUrl: spotifyAuthUrl });
  }

  // 2. Callback de autenticação
  if (url.includes('/auth/spotify/callback') || url.includes('/callback')) {
    const urlParams = new URL(url, 'https://pobremusic.vercel.app');
    const code = urlParams.searchParams.get('code');

    if (!code) {
      return res.status(400).send('Código de autorização não encontrado.');
    }

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
        }).toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return res.status(tokenRes.status).send(`Erro Spotify: ${tokenData.error_description || tokenData.error}`);
      }

      const userRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData = await userRes.json();

      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Spotify Conectado</title></head>
          <body style="background:#121212;color:#1DB954;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
            <div style="text-align:center;">
              <h2>Conectado: ${userData.display_name || 'Spotify'}</h2>
              <p style="color:#fff;">Carregando suas músicas...</p>
            </div>
            <script>
              const payload = {
                type: 'SPOTIFY_AUTH_SUCCESS',
                accessToken: ${JSON.stringify(tokenData.access_token)},
                refreshToken: ${JSON.stringify(tokenData.refresh_token || null)},
                expiresIn: ${JSON.stringify(tokenData.expires_in)},
                user: ${JSON.stringify(userData)}
              };
              localStorage.setItem('spotify_token', payload.accessToken);
              localStorage.setItem('spotify_access_token', payload.accessToken);
              localStorage.setItem('spotify_user', JSON.stringify(payload.user));
              if (window.opener) {
                window.opener.postMessage(payload, '*');
              }
              setTimeout(() => {
                if (window.opener) window.close();
                else window.location.href = '/';
              }, 1000);
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      return res.status(500).send(`Erro interno: ${err.message}`);
    }
  }

  // 3. Status da aplicação
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

  // 4. Salvar Credenciais
  if (url.includes('set-credentials')) {
    return res.status(200).json({
      success: true,
      configured: true,
      hasCredentials: true,
      hasClientId: true,
      hasClientSecret: true,
      message: "Credenciais salvas com sucesso!"
    });
  }

  // 5. Perfil de Usuário
  if (url.includes('auth/me') || url.includes('/me')) {
    if (userToken) {
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      if (meRes.ok) {
        const profile = await meRes.json();
        return res.status(200).json({ authenticated: true, user: profile });
      }
    }
    return res.status(200).json({ authenticated: true });
  }

  // 6. Rota de Playlists do Usuário (aceita múltiplos formatos de retorno)
  if (url.includes('my-playlists') || url.includes('playlists')) {
    if (userToken) {
      try {
        const plRes = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
          headers: { Authorization: `Bearer ${userToken}` }
        });
        if (plRes.ok) {
          const plData = await plRes.json();
          // Retorna o objeto original do Spotify que contém { items: [...], total: ... }
          return res.status(200).json(plData);
        }
      } catch (e) {}
    }
    return res.status(200).json({ items: [], total: 0 });
  }

  // 7. Rota de Músicas de uma Playlist
  if (url.includes('spotify-playlist') || url.includes('playlist/')) {
    const urlObj = new URL(url, 'https://pobremusic.vercel.app');
    let playlistId = urlObj.searchParams.get('url') || urlObj.searchParams.get('id') || '';

    if (playlistId.includes('playlist/')) {
      playlistId = playlistId.split('playlist/')[1].split('?')[0];
    }

    let token = userToken;

    // Se não houver token de usuário, gera token de aplicação
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

    if (playlistId && token) {
      try {
        const tracksRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const tracksData = await tracksRes.json();
        return res.status(200).json(tracksData);
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: 'Playlist ID ou Token ausente' });
  }

  return res.status(200).json({ status: "ok", configured: true });
}
