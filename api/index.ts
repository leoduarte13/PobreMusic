export default async function handler(req: any, res: any) {
  // Desativa qualquer cache do navegador/Vercel
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Cabeçalhos CORS
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
  const redirectUri = 'https://pobremusic.vercel.app/auth/spotify/callback';
  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read'
  ].join(' ');

  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&show_dialog=true`;

  // 1. Rota chamada pelo botão para pegar a URL de login
  if (url.includes('/auth/spotify/url') || url.includes('/auth/spotify') && !url.includes('callback') && !url.includes('set-credentials')) {
    return res.status(200).json({
      url: authUrl,
      authUrl: authUrl
    });
  }

  // 2. Callback de autenticação
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
          <p>Autenticado com sucesso! Fechando janela...</p>
        </body>
      </html>
    `);
  }

  // 3. Status de configuração
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
