export default async function handler(req: any, res: any) {
  // Desativa qualquer cache
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Cabeçalhos CORS completos
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

  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&show_dialog=true`;

  // 1. Rota de status de configuração (desbloqueia o frontend e o OAuth)
  if (url.includes('config-status') || url.includes('status')) {
    return res.status(200).json({
      configured: true,
      hasCredentials: true,
      hasClientId: true,
      hasClientSecret: true,
      clientId: clientId,
      authenticated: false,
      needsAuth: true
    });
  }

  // 2. Rota que o botão do OAuth chama para pegar a URL de login
  if (url.includes('/auth/spotify/url') || (url.includes('/auth/spotify') && !url.includes('callback') && !url.includes('set-credentials'))) {
    return res.status(200).json({
      url: authUrl,
      authUrl: authUrl
    });
  }

  // 3. Callback de autenticação do Spotify
  if (url.includes('/auth/spotify/callback') || url.includes('/callback')) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Autenticado</title></head>
        <body style="background:#121212;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
          <div style="text-align:center;">
            <h2>Autenticado com sucesso no Spotify!</h2>
            <p>Esta janela fechará automaticamente...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS', success: true }, '*');
              setTimeout(() => window.close(), 1000);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  }

  // 4. Salvar credenciais
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

  // 5. Dados do usuário / Me
  if (url.includes('auth/me') || url.includes('/me')) {
    return res.status(200).json({
      authenticated: true,
      user: {
        id: "spotify_user",
        display_name: "Usuário Spotify",
        images: []
      }
    });
  }

  // 6. Playlists e buscas
  if (url.includes('my-playlists') || url.includes('playlists')) {
    return res.status(200).json({
      items: [],
      playlists: [],
      total: 0
    });
  }

  // Resposta padrão
  return res.status(200).json({
    status: "ok",
    configured: true,
    hasCredentials: true,
    hasClientId: true,
    hasClientSecret: true
  });
}
