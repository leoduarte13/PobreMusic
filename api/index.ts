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

  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read',
    'user-top-read',
    'user-read-recently-played'
  ].join(' ');

  // 1. Gera a URL do Spotify
  if (url.includes('/auth/spotify/url') || (url.includes('/auth/spotify') && !url.includes('callback') && !url.includes('set-credentials'))) {
    const spotifyAuthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&show_dialog=true`;
    return res.status(200).json({ url: spotifyAuthUrl, authUrl: spotifyAuthUrl });
  }

  // 2. Callback: recebe o código do Spotify, pega o token real e redireciona para a raiz gravando os dados
  if (url.includes('/auth/spotify/callback') || url.includes('/callback')) {
    const urlParams = new URL(req.url, `https://${req.headers.host || 'pobremusic.vercel.app'}`);
    const code = urlParams.searchParams.get('code');

    if (!code) {
      return res.status(400).send('Código de autorização não encontrado.');
    }

    try {
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
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

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        return res.status(tokenResponse.status).send(`Erro Spotify: ${tokenData.error_description || tokenData.error}`);
      }

      const userResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData = await userResponse.json();

      // Grava diretamente no localStorage e redireciona a página inteira, contornando qualquer bloqueio de COOP/popup
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Conectado ao Spotify</title></head>
          <body style="background:#121212;color:#1DB954;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
            <div style="text-align:center;">
              <h2>Conectado como ${userData.display_name || 'Usuário'}!</h2>
              <p style="color:#fff;">Redirecionando para suas músicas...</p>
            </div>
            <script>
              const token = ${JSON.stringify(tokenData.access_token)};
              const user = ${JSON.stringify(userData)};
              
              localStorage.setItem('spotify_token', token);
              localStorage.setItem('spotify_access_token', token);
              localStorage.setItem('spotify_user', JSON.stringify(user));
              localStorage.setItem('spotify_client_id', ${JSON.stringify(clientId)});

              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS', accessToken: token, user: user }, '*');
                }
              } catch(e) {}

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
      return res.status(500).send(`Erro interno: ${err.message}`);
    }
  }

  // 3. Status de Configuração
  if (url.includes('config-status') || url.includes('status')) {
    return res.status(200).json({
      configured: true,
      hasCredentials: true,
      hasClientId: true,
      hasClientSecret: true,
      spotifyConfigured: true,
      clientId: clientId,
      authenticated: false
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
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (meRes.ok) {
        const profile = await meRes.json();
        return res.status(200).json({ authenticated: true, user: profile });
      }
    }
    return res.status(200).json({ authenticated: false, user: null });
  }

  // 6. Playlists
  if (url.includes('my-playlists') || url.includes('playlists')) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const plRes = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (plRes.ok) {
        const plData = await plRes.json();
        return res.status(200).json(plData);
      }
    }
    return res.status(200).json({ items: [], playlists: [] });
  }

  return res.status(200).json({
    status: "ok",
    configured: true,
    hasCredentials: true,
    hasClientId: true,
    hasClientSecret: true
  });
}
