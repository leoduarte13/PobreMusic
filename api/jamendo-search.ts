import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_TEST_CLIENT_ID = '709fa152';

function normalize(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function score(item: any, title: string, artist: string) {
  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  const gotTitle = normalize(item?.name);
  const gotArtist = normalize(item?.artist_name);
  let value = 0;
  if (gotTitle === wantedTitle) value += 100;
  else if (gotTitle.includes(wantedTitle) || wantedTitle.includes(gotTitle)) value += 55;
  if (wantedArtist && gotArtist === wantedArtist) value += 100;
  else if (wantedArtist && (gotArtist.includes(wantedArtist) || wantedArtist.includes(gotArtist))) value += 60;
  const words = wantedTitle.split(' ').filter(Boolean);
  for (const word of words) if (word.length > 2 && gotTitle.includes(word)) value += 5;
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ sucesso: false, error: 'Método não permitido.' });

  const title = String(req.query.nome_musica || req.query.title || req.query.q || '').trim();
  const artist = String(req.query.nome_artista || req.query.artist || '').trim();
  if (!title) return res.status(400).json({ sucesso: false, error: 'Nome da música não informado.' });

  // Use the environment credential for production. The documented public id is intentionally
  // kept only as a temporary read-only testing fallback; register a Jamendo app before scaling.
  const clientId = String(process.env.JAMENDO_CLIENT_ID || DEFAULT_TEST_CLIENT_ID).trim();
  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    namesearch: title,
    limit: '10',
    audioformat: 'mp31',
    include: 'licenses',
  });
  if (artist) params.set('artist_name', artist);

  try {
    const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return res.status(502).json({ sucesso: false, error: `Jamendo respondeu ${response.status}.` });
    const payload: any = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const ranked = results
      .filter((item: any) => typeof item?.audio === 'string' && item.audio.startsWith('http'))
      .map((item: any) => ({ item, score: score(item, title, artist) }))
      .sort((a: any, b: any) => b.score - a.score);
    const best = ranked[0]?.item;
    if (!best) return res.status(404).json({ sucesso: false, error: `Nenhuma faixa streamável encontrada no Jamendo para ${title}${artist ? ` — ${artist}` : ''}.` });

    return res.status(200).json({
      sucesso: true,
      origem: 'jamendo',
      matchScore: ranked[0].score,
      id: String(best.id),
      nome_musica: best.name || title,
      nome_artista: best.artist_name || artist || 'Artista',
      album: best.album_name || 'Jamendo',
      capa: best.album_image || best.image || '',
      duracao_ms: Number(best.duration || 0) * 1000,
      audioUrl: best.audio,
      sourceUrl: best.shareurl || `https://www.jamendo.com/track/${best.id}`,
      license: best.license_ccurl || best.license || '',
    });
  } catch (error: any) {
    console.error('Jamendo resolver error:', error);
    return res.status(502).json({ sucesso: false, error: 'Falha ao consultar o Jamendo.', details: error?.message || String(error) });
  }
}
