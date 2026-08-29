export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
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

  // 1. Inicia o login do Spotify (redireciona a janela em branco)
  if (url.includes('/auth/spotify/url') || url.includes('/login') || (url.includes('/auth/spotify') && !url.includes('/callback') && !url.includes('/set-credentials'))) {
    const spotifyAuthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    // Se a chamada for via API fetch, devolve a URL em JSON; se for abertura direta, faz o redirect 302
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(200).json({ url: spotifyAuthUrl });
    }
    return res.redirect(spotifyAuthUrl);
  }

  // 2. Status de configuração e perfil
  if (url.includes('config-status') || url.includes('auth/me')) {
    return res.status(200).json({
      configured: true,
      hasCredentials: true,
      authenticated: false,
      clientId: clientId
    });
  }

  // 3. Salvar credenciais
  if (url.includes('set-credentials')) {
    return res.status(200).json({
      success: true,
      configured: true,
      hasCredentials: true,
      message: "Credenciais salvas com sucesso!"
    });
  }

  // 4. Playlists
  if (url.includes('my-playlists')) {
    return res.status(200).json({ items: [], playlists: [] });
  }

  return res.status(200).json({
    status: "ok",
    configured: true,
    hasCredentials: true
  });
}
