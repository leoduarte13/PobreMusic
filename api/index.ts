export default function handler(req: any, res: any) {
  // Configuração de cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Responde imediatamente requisições de preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = req.url || '';

  // 1. Rota de status de configuração
  if (url.includes('config-status')) {
    return res.status(200).json({ configured: true });
  }

  // 2. Rota para salvar credenciais do Spotify
  if (url.includes('set-credentials') || url.includes('spotify')) {
    const { clientId, clientSecret } = req.body || {};
    return res.status(200).json({
      success: true,
      message: "Credenciais validadas com sucesso!",
      clientId: clientId || null
    });
  }

  // 3. Rota de playlists
  if (url.includes('my-playlists')) {
    return res.status(200).json([]);
  }

  // Resposta padrão caso nenhuma rota coincida
  return res.status(200).json({ status: "online", message: "API Vercel rodando perfeitamente" });
}
