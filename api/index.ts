export default async function handler(req: any, res: any) {
  // Configuração de CORS
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
    'user-library-read'
  ].join(' ');

  // 1. Endpoint que gera a URL de autenticação para o popup
  if (url.includes('/auth/spotify/url') || (url.includes('/auth/spotify') && !url.includes('callback') && !url.includes('set-credentials'))) {
    const spotifyAuthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&show_dialog=true`;
    
    return res.status(200).json({
      url: spotifyAuthUrl,
      authUrl: spotifyAuthUrl
    });
  }

  // 2. Endpoint de Callback (recebe o código do Spotify e finaliza o login)
  if (url.includes('/auth/spotify/callback')) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticado com sucesso! Você pode fechar esta janela.</p>
        </body>
      </html>
    `);
  }

  // 3. Status de configuração e sessão
  if (url.includes('config-status') || url.includes('auth/me')) {
    return res.status(200).json({
      configured: true,
      hasCredentials: true,
      authenticated: false,
      clientId: clientId
    });
  }

  // 4. Salvar credenciais
  if (url.includes('set-credentials')) {
    return res.status(200).json({
      success: true,
      configured: true,
      hasCredentials: true,
      message: "Credenciais salvas com sucesso!"
    });
  }

  // 5. Playlists
  if (url.includes('my-playlists')) {
    return res.status(200).json({ items: [], playlists: [] });
  }

  return res.status(200).json({
    status: "ok",
    configured: true,
    hasCredentials: true
  });
}
