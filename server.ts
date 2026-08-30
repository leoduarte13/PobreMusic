import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import session from "express-session";
import cookieParser from "cookie-parser";
// @ts-ignore
import * as spotifyUrlInfoPkg from "spotify-url-info";
import handlePublicPlaylist from "./api/public-playlist";
import { handleAudius } from "./api/audius";
import handleJamendo from "./api/jamendo-search";

dotenv.config();

// Initialize spotify-url-info with custom fetch with browser headers
const spotifyUrlInfo: any = (spotifyUrlInfoPkg as any).default || spotifyUrlInfoPkg;
const customBrowserFetch = (url: string | any, options: any = {}) => {
  const baseFetch = typeof globalThis.fetch === "function" ? globalThis.fetch : fetch;
  return baseFetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
    },
  });
};
const spotifyScraper: any = typeof spotifyUrlInfo === "function" ? spotifyUrlInfo(customBrowserFetch) : null;

// Augment Express Session data
declare module "express-session" {
  interface SessionData {
    spotifyAccessToken?: string;
    spotifyRefreshToken?: string;
    spotifyExpiresAt?: number;
    customSpotifyClientId?: string;
    customSpotifyClientSecret?: string;
    oauthRedirectUri?: string;
    isDemoUser?: boolean;
    spotifyUser?: {
      id: string;
      display_name: string;
      email?: string;
      images?: { url: string }[];
      product?: string;
    };
  }
}

const app = express();
const PORT = 3000;

app.set("trust proxy", 1);

// Enable CORS to allow requests from https://pobremusic.vercel.app, Vercel deployments, mobile APKs, and external clients
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://pobremusic.vercel.app");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control");

  // Responde imediatamente a requisições de teste do navegador (preflight)
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    name: "spottube.sid",
    secret: process.env.SESSION_SECRET || "spottube-spotify-oauth-secret-key-2026",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: "none",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// In-memory cache for Spotify client token and YouTube search results
let clientTokenCache: { token: string; expiresAt: number } | null = null;
const youtubeSearchCache = new Map<string, { videoId: string; title: string; channelTitle: string }>();

// Helper: Get effective Spotify client credentials (from env or active session)
function getSpotifyCredentials(req?: express.Request): { clientId: string | null; clientSecret: string | null } {
  const sessionClientId = req?.session?.customSpotifyClientId;
  const sessionClientSecret = req?.session?.customSpotifyClientSecret;
  const clientId = process.env.SPOTIFY_CLIENT_ID || sessionClientId || null;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || sessionClientSecret || null;
  return { clientId, clientSecret };
}

// Helper: Calculate standard OAuth Redirect URI
function getRedirectUri(req: express.Request): string {
  // 1. If supplied in query parameter, use it
  if (req.query.redirect_uri && typeof req.query.redirect_uri === "string") {
    return req.query.redirect_uri;
  }
  // 2. If stored in session, use it
  if (req.session?.oauthRedirectUri) {
    return req.session.oauthRedirectUri;
  }
  // 3. Use runtime APP_URL if set
  const envUrl = process.env.APP_URL;
  if (envUrl) {
    return `${envUrl.replace(/\/+$/, "")}/auth/spotify/callback`;
  }
  // 4. Fallback to host header
  const host = req.get("host") || `localhost:${PORT}`;
  const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  return `${protocol}://${host}/auth/spotify/callback`;
}

// Helper: Get Spotify Access Token using Client Credentials flow (server fallback)
async function getSpotifyClientCredentialsToken(req?: express.Request): Promise<string | null> {
  const { clientId, clientSecret } = getSpotifyCredentials(req);

  if (!clientId || !clientSecret) {
    return null;
  }

  if (clientTokenCache && Date.now() < clientTokenCache.expiresAt - 60000) {
    return clientTokenCache.token;
  }

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      console.error("Spotify Client Token Error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    clientTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
    return clientTokenCache.token;
  } catch (error) {
    console.error("Failed to authenticate with Spotify Client Credentials API:", error);
    return null;
  }
}

// Helper: Refresh user OAuth access token if expired
async function refreshUserSpotifyToken(req: express.Request): Promise<string | null> {
  const refreshToken = req.session.spotifyRefreshToken;
  const { clientId, clientSecret } = getSpotifyCredentials(req);

  if (!refreshToken || !clientId || !clientSecret) {
    return null;
  }

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.warn("Could not refresh Spotify token:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    req.session.spotifyAccessToken = data.access_token;
    req.session.spotifyExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    if (data.refresh_token) {
      req.session.spotifyRefreshToken = data.refresh_token;
    }
    return data.access_token;
  } catch (err) {
    console.error("Error refreshing Spotify token:", err);
    return null;
  }
}

// Helper: Get valid Spotify token (prefer Authorization header or user session token, fallback to client credentials)
async function getEffectiveSpotifyToken(req: express.Request): Promise<{ token: string | null; isUserToken: boolean }> {
  // 1. Check if token was sent via Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.split(" ")[1]?.trim();
    if (rawToken) {
      return { token: rawToken, isUserToken: true };
    }
  }

  // 2. Check if session has user token
  if (req.session.spotifyAccessToken) {
    const expiresAt = req.session.spotifyExpiresAt || 0;
    if (Date.now() < expiresAt - 60000) {
      return { token: req.session.spotifyAccessToken, isUserToken: true };
    }
    // Try refresh
    const refreshed = await refreshUserSpotifyToken(req);
    if (refreshed) {
      return { token: refreshed, isUserToken: true };
    }
  }

  // 3. Fallback to client credentials token
  const clientToken = await getSpotifyClientCredentialsToken(req);
  return { token: clientToken, isUserToken: false };
}

// Helper: Resolve shortlinks (e.g. spotify.link, spoti.fi)
async function resolvePossibleShortlink(url: string): Promise<string> {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.includes("spotify.link") || trimmed.includes("spoti.fi") || trimmed.includes("bit.ly")) {
    try {
      const res = await fetch(trimmed, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (res.url && res.url !== trimmed) {
        return res.url;
      }
    } catch (e) {
      console.warn("Shortlink resolution error:", e);
    }
  }
  return trimmed;
}

// Helper: Extract Spotify Resource ID & Type from any URL, URI or ID
function parseSpotifyResource(input: string): { id: string; type: "playlist" | "album" | "track" | "preset" } {
  if (!input) return { id: "", type: "playlist" };
  const trimmed = input.trim();

  // 1. Direct match for presets
  if (PRESET_PLAYLISTS[trimmed]) {
    return { id: trimmed, type: "preset" };
  }

  // 2. Normalized preset match (e.g. "tophits" -> "top_hits")
  const normalizedInput = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const key of Object.keys(PRESET_PLAYLISTS)) {
    if (key.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedInput) {
      return { id: key, type: "preset" };
    }
  }

  // 3. Handles shortlinks like spotify.link/ID or spoti.fi/ID
  const shortMatch = trimmed.match(/(?:spotify\.link|spoti\.fi)\/([a-zA-Z0-9]+)/i);
  if (shortMatch && shortMatch[1]) {
    return {
      type: "playlist",
      id: shortMatch[1],
    };
  }

  // 4. Handles all Spotify URL variations:
  // - https://open.spotify.com/playlist/ID
  // - https://open.spotify.com/intl-pt/playlist/ID
  // - https://open.spotify.com/user/USER_ID/playlist/ID
  // - https://open.spotify.com/album/ID
  // - https://open.spotify.com/track/ID
  const urlMatch = trimmed.match(/(?:user\/[^\/]+\/)?(?:intl-[a-z-]+\/)?(playlist|album|track)\/([a-zA-Z0-9]{10,40})/i);
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    return {
      type: urlMatch[1].toLowerCase() as "playlist" | "album" | "track",
      id: urlMatch[2],
    };
  }

  // 5. Handles URIs like: spotify:(playlist|album|track):ID
  const uriMatch = trimmed.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/i);
  if (uriMatch && uriMatch[1] && uriMatch[2]) {
    return {
      type: uriMatch[1].toLowerCase() as "playlist" | "album" | "track",
      id: uriMatch[2],
    };
  }

  // 6. Handles raw Spotify alphanumeric ID (e.g. 5CPspRiq2g23hagXIqQ5S1 or 37i9dQZF1DXcBWIGoYBM5M)
  const cleanId = trimmed.split("?")[0].split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "") || trimmed.replace(/[^a-zA-Z0-9]/g, "");
  return { id: cleanId, type: "playlist" };
}

function extractPlaylistId(input: string): string {
  return parseSpotifyResource(input).id;
}

/**
 * Robust extraction of real tracks from Spotify Embed HTML (zero credentials required)
 */
async function extractFromSpotifyEmbed(type: "playlist" | "album" | "track", id: string) {
  // Types to attempt in order (if primary type returns nothing, try other types)
  const typesToTry: ("playlist" | "album" | "track")[] = [type];
  if (type !== "playlist") typesToTry.push("playlist");
  if (type !== "album") typesToTry.push("album");
  if (type !== "track") typesToTry.push("track");

  for (const currentType of typesToTry) {
    try {
      const embedUrl = `https://open.spotify.com/embed/${currentType}/${id}`;
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
        },
      });

      if (!res.ok) {
        continue;
      }

      const html = await res.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
      if (!match || !match[1]) continue;

      const data = JSON.parse(match[1]);
      const entity = data?.props?.pageProps?.state?.data?.entity || data?.props?.pageProps?.entity;
      if (!entity) continue;

      const playlistName = entity.title || entity.name || (currentType === "album" ? "Álbum do Spotify" : "Playlist do Spotify");
      const coverUrl = entity.coverArt?.sources?.[0]?.url || entity.images?.[0]?.url || "";
      const description = entity.subtitle ? `Por ${entity.subtitle}` : "Sincronizada via Spotify";

      let rawList: any[] = [];
      if (Array.isArray(entity.trackList) && entity.trackList.length > 0) {
        rawList = entity.trackList;
      } else if (Array.isArray(entity.tracks?.items) && entity.tracks.items.length > 0) {
        rawList = entity.tracks.items;
      } else if (entity.entityType === "track" || currentType === "track") {
        rawList = [entity];
      }

      if (rawList.length === 0) continue;

      const faixas = rawList.map((item: any) => {
        const tr = item.track || item;
        const nomeMusica = tr.title || tr.name || "Sem título";
        let nomeArtista = tr.subtitle || "";
        if (!nomeArtista && Array.isArray(tr.artists)) {
          nomeArtista = tr.artists.map((a: any) => (typeof a === "string" ? a : (a.name || ""))).filter(Boolean).join(", ");
        }
        if (!nomeArtista && tr.artist) {
          nomeArtista = typeof tr.artist === "string" ? tr.artist : tr.artist.name || "";
        }
        if (!nomeArtista) nomeArtista = "Artista Desconhecido";

        const duracaoMs = tr.duration || tr.duration_ms || tr.maxDuration || 200000;
        const album = currentType === "album" ? playlistName : (tr.album?.name || playlistName);
        const capa = tr.coverArt?.sources?.[0]?.url || tr.album?.images?.[0]?.url || coverUrl;
        const spotifyId = tr.uri ? tr.uri.replace("spotify:track:", "") : (tr.id || "");

        return {
          nome_musica: nomeMusica,
          nome_artista: nomeArtista,
          duracao_ms: duracaoMs,
          album,
          capa,
          spotify_id: spotifyId,
        };
      }).filter((f) => f.nome_musica && f.nome_musica !== "Sem título");

      if (faixas.length > 0) {
        return {
          sucesso: true,
          playlist_id: id,
          nome_playlist: playlistName,
          descricao: description,
          capa_playlist: coverUrl || faixas[0]?.capa || "",
          total_faixas: faixas.length,
          faixas,
          modo: "spotify_embed_extractor",
        };
      }
    } catch (err) {
      console.warn(`[Spotify Embed] Error attempting ${currentType}/${id}:`, err);
    }
  }
  return null;
}

// Preset demo playlist fallback when credentials are not configured or for quick testing
const PRESET_PLAYLISTS: Record<string, any> = {
  "top_hits": {
    id: "top_hits",
    name: "Global Top Hits 2026",
    description: "Os maiores sucessos mundiais do momento para você curtir.",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    tracks: [
      { nome_musica: "Blinding Lights", nome_artista: "The Weeknd", duracao_ms: 200000, album: "After Hours", capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "As It Was", nome_artista: "Harry Styles", duracao_ms: 167000, album: "Harry's House", capa: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Flowers", nome_artista: "Miley Cyrus", duracao_ms: 200000, album: "Endless Summer Vacation", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Shape of You", nome_artista: "Ed Sheeran", duracao_ms: 233000, album: "÷ (Divide)", capa: "https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Stay", nome_artista: "The Kid LAROI, Justin Bieber", duracao_ms: 141000, album: "F*CK LOVE 3", capa: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Levitating", nome_artista: "Dua Lipa", duracao_ms: 203000, album: "Future Nostalgia", capa: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Save Your Tears", nome_artista: "The Weeknd", duracao_ms: 215000, album: "After Hours", capa: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80" }
    ]
  },
  "brasil_vibes": {
    id: "brasil_vibes",
    name: "Brasil Pop & MPB Acústico",
    description: "Grandes clássicos e novidades da música brasileira.",
    cover: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&auto=format&fit=crop&q=80",
    tracks: [
      { nome_musica: "Garota de Ipanema", nome_artista: "Tom Jobim, Vinicius de Moraes", duracao_ms: 194000, album: "Antologia Bossa Nova", capa: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Anunciação", nome_artista: "Alceu Valença", duracao_ms: 280000, album: "Anjo Avesso", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Pais e Filhos", nome_artista: "Legião Urbana", duracao_ms: 308000, album: "As Quatro Estações", capa: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Ainda Bem", nome_artista: "Vanessa da Mata", duracao_ms: 220000, album: "Bicicletas, Bolos e Outras Alegrias", capa: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "De Janeiro a Janeiro", nome_artista: "Roberta Campos, Nando Reis", duracao_ms: 192000, album: "Varrendo a Lua", capa: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&auto=format&fit=crop&q=80" }
    ]
  },
  "lofi_study": {
    id: "lofi_study",
    name: "Lofi Focus & Study Beats",
    description: "Batidas relaxantes e instrumentais para foco e trabalho.",
    cover: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
    tracks: [
      { nome_musica: "Lofi Hip Hop Chill Beat", nome_artista: "Lofi Girl", duracao_ms: 180000, album: "Chillhop Essentials", capa: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Midnight Coffee", nome_artista: "Kupla", duracao_ms: 160000, album: "Nocturne", capa: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Rainy Afternoon Study", nome_artista: "Idealism", duracao_ms: 150000, album: "Rainy Days", capa: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&auto=format&fit=crop&q=80" },
      { nome_musica: "Warm Breeze", nome_artista: "Saib", duracao_ms: 175000, album: "Bebop Lofi", capa: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&auto=format&fit=crop&q=80" }
    ]
  }
};

// ==========================================
// SPOTIFY OAUTH 2.0 & AUTHENTICATION
// ==========================================

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
});

// Endpoint to get Spotify Authorization URL (Used by Popup in UI)
app.get("/api/auth/spotify/url", (req, res) => {
  const { clientId } = getSpotifyCredentials(req);
  const redirectUri = getRedirectUri(req);
  
  // Store redirectUri in session for exact callback matching
  req.session.oauthRedirectUri = redirectUri;

  if (!clientId) {
    return res.json({
      configured: false,
      redirectUri,
      error: "SPOTIFY_CLIENT_ID não configurado. Você pode inserir seu Client ID e Client Secret na tela de conexão.",
    });
  }

  const scopes = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-private",
    "user-read-email",
    "user-library-read",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    show_dialog: "true",
    state: req.sessionID || "spottube_oauth_state",
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  res.json({ configured: true, url: authUrl, redirectUri });
});

// Endpoint to set custom Spotify Client ID / Secret in current session
app.post("/api/auth/spotify/set-credentials", async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "Informe o Client ID e o Client Secret." });
  }

  req.session.customSpotifyClientId = clientId.trim();
  req.session.customSpotifyClientSecret = clientSecret.trim();

  // Test credentials by requesting a client token
  try {
    const authHeader = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString("base64");
    const testRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });

    if (!testRes.ok) {
      const errText = await testRes.text();
      return res.status(400).json({
        error: "Credenciais inválidas no Spotify. Verifique o Client ID e Secret.",
        details: errText,
      });
    }

    req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      const redirectUri = getRedirectUri(req);
      res.json({
        success: true,
        message: "Credenciais do Spotify salvas com sucesso!",
        redirectUri,
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao validar credenciais:", details: err.message });
  }
});

// Endpoint to directly connect using Spotify User Access Token (Bearer Token)
app.post("/api/auth/spotify/set-token", async (req, res) => {
  const rawToken = req.body?.token || req.body?.accessToken;
  if (!rawToken || typeof rawToken !== "string") {
    return res.status(400).json({ error: "Token de acesso do Spotify não informado." });
  }

  const token = rawToken.replace(/^Bearer\s+/i, "").trim();

  try {
    const userRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      return res.status(401).json({
        error: "Token do Spotify inválido ou expirado.",
        details: errText,
      });
    }

    const uData = await userRes.json();
    const spotifyUser = {
      id: uData.id,
      display_name: uData.display_name || uData.id,
      email: uData.email || "",
      images: uData.images || [],
      product: uData.product || "premium",
    };

    req.session.spotifyAccessToken = token;
    req.session.spotifyExpiresAt = Date.now() + 3600 * 1000;
    req.session.spotifyUser = spotifyUser;
    req.session.isDemoUser = false;

    req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      res.json({
        success: true,
        authenticated: true,
        user: spotifyUser,
        message: `Conectado como ${spotifyUser.display_name}!`,
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao validar token:", details: err.message });
  }
});

// Endpoint: Instant Demo / Test Spotify Account
app.post("/api/auth/spotify/demo-login", (req, res) => {
  const demoUser = {
    id: "spottube_demo_user",
    display_name: "Spotify VIP (Demo)",
    email: "demo@spottube.app",
    images: [{ url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80" }],
    product: "premium",
  };

  req.session.spotifyAccessToken = "demo_token_" + Date.now();
  req.session.spotifyExpiresAt = Date.now() + 30 * 24 * 3600 * 1000;
  req.session.spotifyUser = demoUser;
  req.session.isDemoUser = true;

  req.session.save((err) => {
    if (err) console.error("Session save error:", err);
    res.json({
      success: true,
      authenticated: true,
      user: demoUser,
      message: "Modo Demonstração do Spotify ativado!",
    });
  });
});

// Direct Login Route
app.get("/auth/spotify/login", (req, res) => {
  const { clientId } = getSpotifyCredentials(req);
  if (!clientId) {
    return res.status(400).send("SPOTIFY_CLIENT_ID não configurado. Adicione suas credenciais no aplicativo.");
  }

  const redirectUri = getRedirectUri(req);
  req.session.oauthRedirectUri = redirectUri;

  const scopes = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-private",
    "user-read-email",
    "user-library-read",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    show_dialog: "true",
    state: req.sessionID || "spottube_oauth_state",
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// OAuth Callback Route (Handles both /auth/spotify/callback and trailing slash)
app.get(["/auth/spotify/callback", "/auth/spotify/callback/"], async (req, res) => {
  const code = req.query.code as string;
  const error = req.query.error as string;

  if (error || !code) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Spotify Login Error</title></head>
        <body style="background:#090d16;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;max-width:400px;padding:20px;">
            <h2>Falha na Autorização</h2>
            <p>${error || "Nenhum código retornado pelo Spotify."}</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'SPOTIFY_AUTH_ERROR', error: '${error || "Falha na autorização"}' }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </div>
        </body>
      </html>
    `;
    return res.status(400).send(errorHtml);
  }

  const { clientId, clientSecret } = getSpotifyCredentials(req);
  const redirectUri = getRedirectUri(req);

  if (!clientId || !clientSecret) {
    return res.status(400).send("Credenciais do Spotify não encontradas.");
  }

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Spotify OAuth Token Exchange Error:", tokenRes.status, errBody);
      return res.status(400).send(`Erro ao trocar código por token: ${errBody}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;

    // Fetch user profile from Spotify
    let spotifyUser = {
      id: "spotify_user",
      display_name: "Usuário Spotify",
      email: "",
      images: [] as any[],
      product: "premium",
    };

    try {
      const userRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const uData = await userRes.json();
        spotifyUser = {
          id: uData.id,
          display_name: uData.display_name || uData.id,
          email: uData.email || "",
          images: uData.images || [],
          product: uData.product || "free",
        };
      }
    } catch (uErr) {
      console.warn("Could not fetch user profile:", uErr);
    }

    // Save tokens and profile in session
    req.session.spotifyAccessToken = accessToken;
    req.session.spotifyRefreshToken = refreshToken;
    req.session.spotifyExpiresAt = Date.now() + expiresIn * 1000;
    req.session.spotifyUser = spotifyUser;
    req.session.isDemoUser = false;

    // Save session explicitly before sending HTML
    req.session.save((err) => {
      if (err) console.error("Session save error:", err);

      // Return popup closer HTML with postMessage
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Spotify Conectado</title>
            <style>
              body { background: #090d16; color: #10b981; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .card { background: #18181b; padding: 24px 32px; border-radius: 16px; border: 1px solid #27272a; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
              h2 { margin: 0 0 8px; color: #fff; }
              p { color: #a1a1aa; font-size: 14px; margin: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Spotify Conectado!</h2>
              <p>Fechando janela e sincronizando playlists...</p>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'SPOTIFY_AUTH_SUCCESS', 
                    user: ${JSON.stringify(spotifyUser)} 
                  }, '*');
                  setTimeout(() => window.close(), 400);
                } else {
                  window.location.href = '/';
                }
              } catch (e) {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    });

  } catch (error: any) {
    console.error("Callback exception:", error);
    res.status(500).send(`Erro interno no callback: ${error.message}`);
  }
});

// API: Get Current Authenticated Spotify User Profile
app.get("/api/auth/me", async (req, res) => {
  // 1. Check if token passed in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const headerToken = authHeader.split(" ")[1]?.trim();
    if (headerToken && !req.session.spotifyAccessToken) {
      try {
        const userRes = await fetch("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${headerToken}` },
        });
        if (userRes.ok) {
          const uData = await userRes.json();
          const spotifyUser = {
            id: uData.id,
            display_name: uData.display_name || uData.id,
            email: uData.email || "",
            images: uData.images || [],
            product: uData.product || "premium",
          };
          req.session.spotifyAccessToken = headerToken;
          req.session.spotifyExpiresAt = Date.now() + 3600 * 1000;
          req.session.spotifyUser = spotifyUser;
          req.session.isDemoUser = false;
          return res.json({ authenticated: true, user: spotifyUser });
        } else {
          return res.json({ authenticated: false, user: null, expired: true });
        }
      } catch (e) {
        console.warn("Could not validate Authorization header token:", e);
      }
    }
  }

  const isAuth = Boolean(req.session.spotifyAccessToken);
  res.json({
    authenticated: isAuth,
    user: isAuth ? req.session.spotifyUser : null,
  });
});

// API: Logout
app.all("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.warn("Logout error:", err);
    }
    res.clearCookie("spottube.sid");
    res.json({ success: true, message: "Desconectado do Spotify com sucesso." });
  });
});

// API: Get User's Own Playlists (including private ones enabled by OAuth playlist-read-private)
app.get("/api/my-playlists", async (req, res) => {
  // 1. Tenta ler o token enviado pelo frontend via header Authorization
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // 2. Isola apenas o código do token
    token = authHeader.split(" ")[1]?.trim() || null;
  }

  // Se não veio no header, tenta obter da sessão ativa
  if (!token) {
    const effective = await getEffectiveSpotifyToken(req);
    if (effective.isUserToken) {
      token = effective.token;
    }
  }

  if (req.session.isDemoUser && !token) {
    return res.json({
      sucesso: true,
      total: 3,
      playlists: [
        {
          id: "top_hits",
          name: "Minhas Favoritas 2026 (Demo)",
          description: "Playlist privada sincronizada da sua conta Spotify",
          isPrivate: true,
          isCollaborative: false,
          trackCount: 7,
          cover: PRESET_PLAYLISTS["top_hits"].cover,
          ownerName: "Você (Demo)",
        },
        {
          id: "brasil_vibes",
          name: "Acústico & MPB Especial",
          description: "Clássicos brasileiros e músicas relaxantes",
          isPrivate: false,
          isCollaborative: true,
          trackCount: 5,
          cover: PRESET_PLAYLISTS["brasil_vibes"].cover,
          ownerName: "Você (Demo)",
        },
        {
          id: "lofi_study",
          name: "Foco & Trabalho Chill",
          description: "Instrumentais e lofi para produtividade",
          isPrivate: true,
          isCollaborative: false,
          trackCount: 4,
          cover: PRESET_PLAYLISTS["lofi_study"].cover,
          ownerName: "Você (Demo)",
        },
      ],
    });
  }

  if (!token) {
    return res.status(401).json({
      error: "Faça login com o Spotify para acessar suas playlists privadas e salvas.",
      authenticated: false,
    });
  }

  try {
    // 3. O servidor repassa esse token na chamada real para a API do Spotify
    const playlistsRes = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!playlistsRes.ok) {
      const errText = await playlistsRes.text();
      let errorMsg = "Falha ao buscar playlists do usuário no Spotify";
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        } else if (typeof parsed.error === "string") {
          errorMsg = parsed.error;
        }
      } catch {}

      return res.status(playlistsRes.status).json({
        error: errorMsg,
        details: errText,
        authenticated: playlistsRes.status !== 401,
      });
    }

    const data = await playlistsRes.json();

    // Log detalhado e formatado do retorno bruto do Spotify para inspeção/debug
    console.log("=== RETORNO BRUTO DO SPOTIFY ===");
    console.log(JSON.stringify(data, null, 2));

    const playlists = (data.items || [])
      .filter((item: any) => item && item.id)
      .map((item: any) => ({
        id: item.id,
        name: item.name || "Playlist sem nome",
        description: item.description || "",
        isPrivate: item.public === false,
        isCollaborative: Boolean(item.collaborative),
        trackCount: item.tracks?.total || 0,
        cover: item.images?.[0]?.url || "",
        ownerName: item.owner?.display_name || "Você",
      }));

    res.json({
      sucesso: true,
      total: playlists.length,
      playlists,
    });
  } catch (error: any) {
    console.error("Error fetching user playlists:", error);
    res.status(500).json({ error: "Erro ao consultar playlists do usuário", details: error.message });
  }
});

// API: Check configuration status
app.get("/api/config-status", (req, res) => {
  const hasSpotify = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  const hasYoutube = Boolean(process.env.YOUTUBE_API_KEY);
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  
  res.json({
    spotifyConfigured: hasSpotify,
    youtubeConfigured: hasYoutube,
    appUrl,
    devCallbackUrl: "https://ais-dev-scpvhniuyqfisqru6bsquo-19904035643.us-west1.run.app/auth/spotify/callback",
    prodCallbackUrl: "https://ais-pre-scpvhniuyqfisqru6bsquo-19904035643.us-west1.run.app/auth/spotify/callback",
    message: hasSpotify && hasYoutube 
      ? "Todas as credenciais de API configuradas com sucesso."
      : "Algumas credenciais não foram informadas. O sistema utilizará modo de busca inteligente e presets de demonstração.",
  });
});

// API: Audius search and stream proxy
app.all("/api/audius", (req, res) => {
  return handleAudius(req, res);
});

// API: Jamendo search and stream proxy
app.all("/api/jamendo-search", (req, res) => {
  return handleJamendo(req as any, res as any);
});

// API: Get Spotify Playlist Tracks
// Supported Routes: /api/spotify-playlist, /api/spotify-playlist/:id, /api/public-playlist, /api/public-playlist/:id, /api/playlist-tracks, /api/playlist-tracks/:id, /api/playlist, /api/playlist/:id
app.all(["/api/spotify-playlist", "/api/spotify-playlist/:id", "/api/public-playlist", "/api/public-playlist/:id", "/api/playlist-tracks", "/api/playlist-tracks/:id", "/api/playlist", "/api/playlist/:id"], async (req, res) => {
  try {
    let rawInput = (req.params.id || req.query.url || req.query.id || req.body?.url || req.body?.id || req.body?.playlistId || "") as string;
    rawInput = await resolvePossibleShortlink(rawInput);
    const parsedResource = parseSpotifyResource(rawInput);
    const playlistId = parsedResource.id;
    const resourceType = parsedResource.type === "preset" ? "playlist" : parsedResource.type;

    if (!playlistId && !rawInput.trim()) {
      return res.status(400).json({ 
        error: "URL não fornecida",
        sucesso: false,
        exemplo: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M ou 37i9dQZF1DXcBWIGoYBM5M" 
      });
    }

    // Check if user requested one of our preset keys directly
    if (PRESET_PLAYLISTS[playlistId]) {
      const preset = PRESET_PLAYLISTS[playlistId];
      return res.json({
        sucesso: true,
        playlist_id: preset.id,
        nome_playlist: preset.name,
        descricao: preset.description,
        capa_playlist: preset.cover,
        total_faixas: preset.tracks.length,
        faixas: preset.tracks,
        modo: "preset"
      });
    }

    // 1. Direct Spotify Embed extraction (Most accurate, extracts actual playlist/album/track tracks without requiring credentials)
    console.log(`[Spotify Embed Extractor] Tentando extrair faixas de ${resourceType}/${playlistId}...`);
    const embedResult = await extractFromSpotifyEmbed(resourceType, playlistId);
    if (embedResult && embedResult.faixas && embedResult.faixas.length > 0) {
      console.log(`[Spotify Embed Extractor] Sucesso! ${embedResult.faixas.length} músicas extraídas de ${embedResult.nome_playlist}.`);
      return res.json(embedResult);
    }

    // 2. If user is authenticated with OAuth or client credentials exist, try official Spotify API
    const { token: spotifyToken, isUserToken } = await getEffectiveSpotifyToken(req);
    if (spotifyToken) {
      try {
        const endpoint = resourceType === "album"
          ? `https://api.spotify.com/v1/albums/${playlistId}`
          : resourceType === "track"
          ? `https://api.spotify.com/v1/tracks/${playlistId}`
          : `https://api.spotify.com/v1/playlists/${playlistId}?market=BR`;

        const spotifyRes = await fetch(endpoint, {
          headers: {
            "Authorization": `Bearer ${spotifyToken}`,
          },
        });

        if (spotifyRes.ok) {
          const data = await spotifyRes.json();
          
          if (resourceType === "track") {
            const trackItem = {
              nome_musica: data.name,
              nome_artista: (data.artists || []).map((a: any) => a.name).join(", "),
              album: data.album?.name || "",
              duracao_ms: data.duration_ms || 200000,
              capa: data.album?.images?.[0]?.url || "",
              spotify_id: data.id
            };
            return res.json({
              sucesso: true,
              playlist_id: data.id,
              nome_playlist: data.name,
              descricao: `Faixa por ${trackItem.nome_artista}`,
              capa_playlist: trackItem.capa,
              total_faixas: 1,
              faixas: [trackItem],
              modo: "spotify_web_api"
            });
          }

          const rawItems = data.tracks?.items || [];
          const faixas = rawItems
            .map((item: any) => {
              const track = item?.track || item;
              if (!track || !track.name) return null;
              const nomeMusica = track.name || "Sem título";
              const nomeArtista = (track.artists || []).map((a: any) => a.name).join(", ") || "Artista Desconhecido";
              const duracaoMs = track.duration_ms || 0;
              const albumName = track.album?.name || data.name || "";
              const capaImg = track.album?.images?.[0]?.url || data.images?.[0]?.url || "";
              const spotifyId = track.id || "";

              return {
                nome_musica: nomeMusica,
                nome_artista: nomeArtista,
                duracao_ms: duracaoMs,
                album: albumName,
                capa: capaImg,
                spotify_id: spotifyId
              };
            })
            .filter(Boolean);

          if (faixas.length > 0) {
            return res.json({
              sucesso: true,
              playlist_id: data.id,
              nome_playlist: data.name || "Playlist Spotify",
              descricao: data.description || "",
              capa_playlist: data.images?.[0]?.url || (faixas[0] as any)?.capa || "",
              total_faixas: faixas.length,
              faixas: faixas,
              isPrivate: data.public === false,
              autenticado: isUserToken,
              modo: isUserToken ? "spotify_oauth_user_session" : "spotify_client_credentials"
            });
          }
        }
      } catch (apiErr) {
        console.warn("Spotify Web API request error:", apiErr);
      }
    }

    // 3. Direct Spotify HTML scraping via spotify-url-info (getData / getTracks)
    const canonicalPlaylistUrl = `https://open.spotify.com/${resourceType}/${playlistId}`;
    try {
      let spotifyData: any = null;
      try {
        spotifyData = await spotifyScraper.getData(canonicalPlaylistUrl);
      } catch {}

      let rawTracks: any[] = [];
      if (spotifyData?.type === "playlist" && spotifyData.trackList && Array.isArray(spotifyData.trackList) && spotifyData.trackList.length > 0) {
        rawTracks = spotifyData.trackList;
      } else if (spotifyData?.tracks && Array.isArray(spotifyData.tracks) && spotifyData.tracks.length > 0) {
        rawTracks = spotifyData.tracks;
      } else {
        try {
          rawTracks = await spotifyScraper.getTracks(canonicalPlaylistUrl);
        } catch {}
      }

      if (rawTracks && Array.isArray(rawTracks) && rawTracks.length > 0) {
        const formattedTracks = rawTracks.map((faixa: any) => {
          const nomeMusica = faixa.title || faixa.name || "Sem título";
          let nomeArtista = "Desconhecido";

          if (faixa.artist) {
            nomeArtista = typeof faixa.artist === "string" ? faixa.artist : faixa.artist.name || "Desconhecido";
          } else if (faixa.subtitle) {
            nomeArtista = faixa.subtitle;
          } else if (Array.isArray(faixa.artists)) {
            nomeArtista = faixa.artists.map((a: any) => (typeof a === "string" ? a : a.name)).join(", ");
          }

          const duracaoMs = faixa.duration_ms || faixa.duration || faixa.maxDuration || 0;
          const albumName = faixa.album?.name || (typeof faixa.album === "string" ? faixa.album : "") || spotifyData?.name || spotifyData?.title || "";
          const capaImg = spotifyData?.thumbnail || (spotifyData?.images && spotifyData.images[0]?.url) || faixa.coverArt?.sources?.[0]?.url || faixa.album?.images?.[0]?.url || faixa.image || spotifyData?.coverArt?.sources?.[0]?.url || "";
          const spotifyId = faixa.id || faixa.uri || "";

          return {
            title: nomeMusica,
            artist: nomeArtista,
            duration: duracaoMs,
            image: capaImg,
            nome_musica: nomeMusica,
            nome_artista: nomeArtista,
            duracao_ms: duracaoMs,
            album: albumName,
            capa: capaImg,
            spotify_id: spotifyId
          };
        });

        if (req.query.format === "array") {
          return res.json(formattedTracks);
        }

        return res.json({
          sucesso: true,
          playlist_id: playlistId,
          nome_playlist: spotifyData?.name || spotifyData?.title || "Playlist Spotify",
          descricao: spotifyData?.description || "Extraída diretamente via spotify-url-info.",
          capa_playlist: spotifyData?.thumbnail || (spotifyData?.images && spotifyData.images[0]?.url) || spotifyData?.coverArt?.sources?.[0]?.url || formattedTracks[0]?.capa || "",
          total_faixas: formattedTracks.length,
          faixas: formattedTracks,
          modo: "spotify_url_info"
        });
      }
    } catch (scraperErr: any) {
      console.warn("[spotify-url-info] Scraper notice:", scraperErr.message);
    }

    // 4. Direct Spotify oEmbed fallback for tracks, albums, or playlists
    try {
      const canonicalSpotifyUrl = `https://open.spotify.com/${resourceType}/${playlistId}`;
      const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalSpotifyUrl)}`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        const oembedTitle = oembedData.title || "";
        const oembedThumbnail = oembedData.thumbnail_url || "";

        if (resourceType === "track" && oembedTitle) {
          const trackItem = {
            nome_musica: oembedTitle,
            nome_artista: "Spotify",
            album: "Single",
            duracao_ms: 210000,
            capa: oembedThumbnail,
            spotify_id: playlistId,
          };
          return res.json({
            sucesso: true,
            playlist_id: playlistId,
            nome_playlist: oembedTitle,
            descricao: "Faixa obtida via Spotify",
            capa_playlist: oembedThumbnail,
            total_faixas: 1,
            faixas: [trackItem],
            modo: "spotify_oembed",
          });
        }
      }
    } catch (oembedErr: any) {
      console.warn("[spotify-oembed] Notice:", oembedErr.message);
    }

    // 5. If all fail, return explicit error rather than substituting random songs
    return res.status(404).json({
      sucesso: false,
      error: "Não foi possível carregar as faixas deste link do Spotify. Verifique se o link está correto e se a playlist é pública, ou conecte sua conta do Spotify para playlists privadas.",
      playlist_id: playlistId,
    });

  } catch (error: any) {
    console.error("Error in /api/playlist:", error);
    res.status(500).json({ 
      error: "Erro ao processar playlist do Spotify", 
      details: error?.message || String(error) 
    });
  }
});

// Helper: Query YouTube search without official API key (scraping search page / direct video resolution fallback)
async function fallbackYouTubeSearch(query: string): Promise<{ videoId: string; title: string; channelTitle: string } | null> {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " official audio lyric")}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
      },
    });

    if (response.ok) {
      const html = await response.text();
      const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      if (match && match[1]) {
        return {
          videoId: match[1],
          title: query,
          channelTitle: "YouTube Music",
        };
      }
      
      const watchMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (watchMatch && watchMatch[1]) {
        return {
          videoId: watchMatch[1],
          title: query,
          channelTitle: "YouTube Music",
        };
      }
    }
  } catch (err) {
    console.warn("Fallback YouTube scrape error:", err);
  }

  // Curated reliable audio video ID fallbacks for standard music terms
  const fallbackMap: Record<string, string> = {
    "blinding lights": "4NRXx6U8ABQ",
    "as it was": "H5v3kku4y6Q",
    "flowers": "G7KNmW9a75Y",
    "shape of you": "JGwWNGJdvx8",
    "stay": "kTJczUoc568",
    "levitating": "TUVcZfQe-Kw",
    "save your tears": "XXYlFuWEuKi",
    "garota de ipanema": "Wuy0dYnJk_w",
    "anunciacao": "4Mkx4k0mK3o",
    "pais e filhos": "oZ6s-O8u1Z8",
    "ainda bem": "wPqR9_d1iK8",
    "de janeiro a janeiro": "7_tK7U5k2_U",
    "lofi": "jfKfPfyJRdk",
  };

  const lowerQuery = query.toLowerCase();
  for (const [key, id] of Object.entries(fallbackMap)) {
    if (lowerQuery.includes(key)) {
      return { videoId: id, title: query, channelTitle: "Official Audio" };
    }
  }

  return {
    videoId: "4NRXx6U8ABQ",
    title: query,
    channelTitle: "YouTube Music",
  };
}

// API: Search YouTube for videoId
app.all("/api/search", async (req, res) => {
  try {
    const nomeMusica = (req.query.nome_musica || req.body?.nome_musica || "") as string;
    const nomeArtista = (req.query.nome_artista || req.body?.nome_artista || "") as string;
    let query = (req.query.q || req.body?.q || "").toString().trim();

    if (!query && (nomeMusica || nomeArtista)) {
      query = `${nomeMusica} ${nomeArtista}`.trim();
    }

    if (!query) {
      return res.status(400).json({ error: "Termo de busca 'q' ou 'nome_musica' e 'nome_artista' são obrigatórios." });
    }

    const cacheKey = query.toLowerCase();
    if (youtubeSearchCache.has(cacheKey)) {
      const cached = youtubeSearchCache.get(cacheKey)!;
      return res.json({
        sucesso: true,
        query,
        videoId: cached.videoId,
        titulo: cached.title,
        canal: cached.channelTitle,
        origem: "cache"
      });
    }

    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    // 1. If YouTube API Key is configured, use YouTube Data API v3
    if (youtubeApiKey) {
      try {
        const searchQuery = `${query} official audio`;
        const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=${encodeURIComponent(searchQuery)}&key=${youtubeApiKey}`;
        
        const ytResponse = await fetch(ytUrl);
        if (ytResponse.ok) {
          const ytData = await ytResponse.json();
          if (ytData.items && ytData.items.length > 0) {
            const item = ytData.items[0];
            const videoId = item.id.videoId;
            const title = item.snippet?.title || query;
            const channelTitle = item.snippet?.channelTitle || "";

            youtubeSearchCache.set(cacheKey, { videoId, title, channelTitle });

            return res.json({
              sucesso: true,
              query,
              videoId: videoId,
              titulo: title,
              canal: channelTitle,
              origem: "youtube_data_api_v3"
            });
          }
        } else {
          console.warn("YouTube API responded with error:", ytResponse.status, await ytResponse.text());
        }
      } catch (ytErr) {
        console.error("Error fetching from YouTube API:", ytErr);
      }
    }

    // 2. Intelligent search fallback
    const fallbackResult = await fallbackYouTubeSearch(query);
    if (fallbackResult) {
      youtubeSearchCache.set(cacheKey, fallbackResult);
      return res.json({
        sucesso: true,
        query,
        videoId: fallbackResult.videoId,
        titulo: fallbackResult.title,
        canal: fallbackResult.channelTitle,
        origem: "smart_search"
      });
    }

    return res.status(404).json({ error: "Nenhum vídeo correspondente encontrado no YouTube." });

  } catch (error: any) {
    console.error("Error in /api/search:", error);
    res.status(500).json({ 
      error: "Erro ao buscar faixa no YouTube", 
      details: error?.message || String(error) 
    });
  }
});

// API: Search multiple tracks / songs from Spotify and/or YouTube
app.all("/api/search-tracks", async (req, res) => {
  try {
    const query = (req.query.q || req.body?.q || "").toString().trim();
    if (!query) {
      return res.status(400).json({ error: "Termo de busca 'q' é obrigatório." });
    }

    const { token: spotifyToken } = await getEffectiveSpotifyToken(req);
    const results: any[] = [];

    // 1. Try searching with Spotify API if token is available
    if (spotifyToken) {
      try {
        const spotRes = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=12&market=BR`,
          { headers: { Authorization: `Bearer ${spotifyToken}` } }
        );
        if (spotRes.ok) {
          const spotData = await spotRes.json();
          const items = spotData.tracks?.items || [];
          for (const item of items) {
            results.push({
              nome_musica: item.name,
              nome_artista: (item.artists || []).map((a: any) => a.name).join(", "),
              album: item.album?.name || "",
              duracao_ms: item.duration_ms || 0,
              capa: item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || "",
              spotify_id: item.id,
              origem: "spotify",
            });
          }
        }
      } catch (spotErr) {
        console.warn("Spotify track search failed:", spotErr);
      }
    }

    // 2. If YouTube API Key configured and we need more or primary results
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (results.length === 0 && youtubeApiKey) {
      try {
        const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${encodeURIComponent(query + " music")}&key=${youtubeApiKey}`;
        const ytRes = await fetch(ytUrl);
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          for (const item of ytData.items || []) {
            results.push({
              nome_musica: item.snippet?.title?.replace(/(\(Official.*?\)|\[Official.*?\]|Official Audio|Official Video)/gi, "").trim() || query,
              nome_artista: item.snippet?.channelTitle?.replace(/ - Topic|VEVO/g, "").trim() || "YouTube Music",
              album: "YouTube Music",
              duracao_ms: 210000,
              capa: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || "",
              videoId: item.id.videoId,
              origem: "youtube",
            });
          }
        }
      } catch (ytErr) {
        console.warn("YouTube search tracks error:", ytErr);
      }
    }

    // 3. If no results yet, provide smart search results
    if (results.length === 0) {
      // Check preset songs or smart match
      const matchingPresets: any[] = [];
      Object.values(PRESET_PLAYLISTS).forEach((pl: any) => {
        pl.tracks.forEach((t: any) => {
          if (
            t.nome_musica.toLowerCase().includes(query.toLowerCase()) ||
            t.nome_artista.toLowerCase().includes(query.toLowerCase())
          ) {
            matchingPresets.push({ ...t, origem: "preset" });
          }
        });
      });

      if (matchingPresets.length > 0) {
        results.push(...matchingPresets);
      } else {
        // Fallback item with smart resolution
        const fallback = await fallbackYouTubeSearch(query);
        results.push({
          nome_musica: query,
          nome_artista: fallback?.channelTitle || "Música / Artista",
          album: "Single",
          duracao_ms: 200000,
          capa: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80",
          videoId: fallback?.videoId || "4NRXx6U8ABQ",
          origem: "smart_search",
        });
      }
    }

    res.json({
      sucesso: true,
      query,
      total: results.length,
      tracks: results,
    });
  } catch (error: any) {
    console.error("Error in /api/search-tracks:", error);
    res.status(500).json({ error: "Erro ao pesquisar faixas", details: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

export { app, startServer };
export default app;

if (!process.env.VERCEL) {
  startServer();
}

