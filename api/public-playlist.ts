import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore - spotify-url-info is CommonJS and exposes its fetch factory at runtime.
import * as spotifyUrlInfoPkg from 'spotify-url-info';

const spotifyUrlInfo: any = (spotifyUrlInfoPkg as any).default || spotifyUrlInfoPkg;

const browserFetch = async (url: string | URL, options: any = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        ...(options.headers || {}),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
      },
    });
  } finally { clearTimeout(timer); }
};

const scraper: any = typeof spotifyUrlInfo === 'function' ? spotifyUrlInfo(browserFetch) : null;

function playlistIdFromInput(input: string) {
  const value = String(input || '').trim();
  const match = value.match(/(?:playlist[/:]|spotify:playlist:)([A-Za-z0-9]{10,80})/i);
  if (match) return match[1];
  return /^[A-Za-z0-9]{10,80}$/.test(value) ? value : '';
}
function text(...values: any[]) { return values.find(v => typeof v === 'string' && v.trim())?.trim() || ''; }
function imageFrom(value: any): string { if (!value) return ''; if (typeof value === 'string') return value; if (Array.isArray(value)) return imageFrom(value[0]); if (Array.isArray(value.sources)) return value.sources.find((s:any)=>s?.url)?.url || ''; if (Array.isArray(value.images)) return imageFrom(value.images); return text(value.url); }
function durationMs(value: any) { const n=Number(value); return Number.isFinite(n)&&n>0 ? Math.round(n>1000?n:n*1000) : Math.round(Number(value?.totalMilliseconds||value?.milliseconds||value?.ms)||0); }
function trackId(uri: any) { return text(uri).match(/spotify:track:([^?]+)/i)?.[1] || ''; }
function normalizeTrack(track: any) {
  const id=trackId(track?.uri), name=text(track?.name,track?.title); if(!id||!name)return null;
  return {nome_musica:name,nome_artista:text(track?.artist,track?.subtitle,'Artista'),album:text(track?.album,'Álbum'),duracao_ms:durationMs(track?.duration),capa:imageFrom(track?.image),spotify_id:id,spotify_url:`https://open.spotify.com/track/${id}`,preview_url:text(track?.previewUrl)};
}
function makePlaylistUrl(input:string){return /^https?:\/\//i.test(input)?input:`https://open.spotify.com/playlist/${input}`;}

export default async function handler(req: VercelRequest,res: VercelResponse){
  res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS')return res.status(204).end(); if(req.method!=='GET')return res.status(405).json({sucesso:false,error:'Método não permitido.'});
  const raw=String(req.query.url||req.query.playlistId||req.query.id||'').trim(), playlistId=playlistIdFromInput(raw);
  if(!playlistId)return res.status(400).json({sucesso:false,error:'Link ou ID de playlist Spotify inválido.'});
  if(!scraper?.getDetails)return res.status(500).json({sucesso:false,error:'O leitor público do Spotify não foi carregado no servidor.'});
  try{
    const details=await scraper.getDetails(makePlaylistUrl(raw));
    const preview=details?.preview||{}, rawTracks=Array.isArray(details?.tracks)?details.tracks:[], faixas=rawTracks.map(normalizeTrack).filter(Boolean);
    if(!faixas.length)return res.status(404).json({sucesso:false,error:'A playlist foi encontrada, mas o Spotify não retornou as faixas. Confirme que a playlist é pública.',playlist_id:playlistId});
    return res.status(200).json({sucesso:true,autenticado:false,modo:'spotify_url_info_public',playlist_id:playlistId,nome_playlist:text(preview.title,'Playlist Spotify'),descricao:text(preview.description,'Playlist pública do Spotify.'),capa_playlist:text(preview.image),total_faixas:faixas.length,faixas,aviso:'Playlist pública importada sem OAuth.'});
  }catch(error:any){
    console.error('Spotify public playlist error:',{message:error?.message,stack:error?.stack,playlistId});
    return res.status(502).json({sucesso:false,error:'Não foi possível ler esta playlist pública do Spotify.',details:error?.message||String(error),playlist_id:playlistId});
  }
}
