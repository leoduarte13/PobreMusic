var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json());
var FALLBACK_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services"
];
function normalize(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function clean(text) {
  return normalize(text).replace(/\b(official|video|music|audio|lyrics|hd|4k|topic|vevo)\b/g, " ").replace(/\s+/g, " ").trim();
}
function words(text) {
  return clean(text).split(" ").filter((w) => w.length > 1);
}
function score(title, query, artist, uploader = "") {
  const t = clean(title);
  const q = clean(query);
  const a = clean(artist);
  const u = clean(uploader);
  const tw = new Set(words(t));
  const qw = words(q);
  let s = 0;
  if (t === q) s += 250;
  if (t.includes(q)) s += 110;
  for (const w of qw) if (tw.has(w)) s += 12;
  const artistWords = words(a);
  if (a && t.includes(a)) s += 100;
  if (artistWords.length && artistWords.every((w) => tw.has(w) || u.includes(w))) s += 90;
  if (/official|topic|vevo|audio/i.test(title)) s += 12;
  if (/cover|karaoke|reaction|sped up|slowed|nightcore|8d|remix|live|fan made/i.test(title)) s -= 45;
  return s;
}
function extractVideoId(value) {
  const s = String(value || "");
  return s.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] || s.match(/\/watch\/([A-Za-z0-9_-]{11})/)?.[1] || s.match(/^([A-Za-z0-9_-]{11})$/)?.[1] || "";
}
async function searchTrack(query) {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e3);
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const matches = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]);
      const unique = [...new Set(matches)];
      if (unique.length > 0) {
        return {
          items: unique.map((id) => ({ url: `https://www.youtube.com/watch?v=${id}`, id })),
          instance: "youtube"
        };
      }
    }
  } catch (e) {
  }
  for (const instance of FALLBACK_INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "PobreMusic/1.0" }, signal: controller.signal });
      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length > 0) return { items, instance };
    } catch {
    } finally {
      clearTimeout(timeout);
    }
  }
  return { items: [], instance: "" };
}
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
app.get("/api/search", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const nomeMusica = String(req.query.nome_musica || "").trim();
  const nomeArtista = String(req.query.nome_artista || "").trim();
  const query = `${nomeMusica} ${nomeArtista}`.trim();
  if (!nomeMusica) return res.status(400).json({ sucesso: false, error: "Nome da m\xFAsica n\xE3o informado." });
  try {
    const { items, instance } = await searchTrack(query);
    if (!items.length) {
      return res.status(404).json({ sucesso: false, error: "M\xFAsica n\xE3o encontrada nos provedores de \xE1udio." });
    }
    const ranked = items.map((x) => ({
      videoId: extractVideoId(x.url || x.id),
      titulo: String(x.title || ""),
      canal: String(x.uploaderName || x.uploader || ""),
      duracao: Number(x.duration || 0),
      capa: x.thumbnail || x.thumbnailUrl || ""
    })).filter((x) => x.videoId).sort((a, b) => score(b.titulo, nomeMusica, nomeArtista, b.canal) - score(a.titulo, nomeMusica, nomeArtista, a.canal));
    const best = ranked[0];
    if (!best) return res.status(404).json({ sucesso: false, error: "Nenhum v\xEDdeo v\xE1lido encontrado." });
    return res.json({
      sucesso: true,
      videoId: best.videoId,
      titulo: best.titulo,
      canal: best.canal,
      duracao: best.duracao,
      capa: best.capa,
      instance
    });
  } catch (e) {
    return res.status(500).json({ sucesso: false, error: String(e?.message || e) });
  }
});
app.get("/api/audio", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const videoId = String(req.query.videoId || "").trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return res.status(400).json({ error: "videoId inv\xE1lido." });
  for (const instance of FALLBACK_INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    try {
      const meta = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: "application/json", "User-Agent": "PobreMusic/1.0" },
        signal: controller.signal
      });
      if (!meta.ok) continue;
      const data = await meta.json();
      const streams = Array.isArray(data.audioStreams) ? data.audioStreams : [];
      const valid = streams.filter((s) => s?.url && /^https?:\/\//i.test(String(s.url)));
      valid.sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
      const chosen = valid.find((s) => /^audio\/mp4/i.test(String(s.mimeType || ""))) || valid[0];
      if (!chosen?.url) continue;
      const headers = { Accept: "*/*" };
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(String(chosen.url), { headers, signal: controller.signal });
      if (!upstream.ok && upstream.status !== 206) continue;
      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader("Content-Type", String(chosen.mimeType || "audio/mp4"));
      res.setHeader("Accept-Ranges", "bytes");
      const cl = upstream.headers.get("content-length");
      const cr = upstream.headers.get("content-range");
      if (cl) res.setHeader("Content-Length", cl);
      if (cr) res.setHeader("Content-Range", cr);
      if (!upstream.body) {
        clearTimeout(timeout);
        return res.end();
      }
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
        clearTimeout(timeout);
      }
      return res.end();
    } catch {
      clearTimeout(timeout);
    }
  }
  return res.status(502).json({ error: "Nenhuma fonte de \xE1udio dispon\xEDvel no momento." });
});
app.get("/api/public-playlist", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const rawUrl = String(req.query.url || "").trim();
  const m = rawUrl.match(/(?:spotify\.com\/[^/]+\/)?(playlist|album|track)\/([A-Za-z0-9]+)/i) || rawUrl.match(/spotify:(playlist|album|track):([A-Za-z0-9]+)/i);
  const type = m ? m[1].toLowerCase() : "playlist";
  const id = m ? m[2] : rawUrl.split("?")[0].split("/").pop()?.replace(/[^A-Za-z0-9]/g, "") || "";
  if (!id || id.length < 10) return res.status(400).json({ sucesso: false, error: "Link Spotify inv\xE1lido." });
  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
    const embedRes = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
      }
    });
    const html = await embedRes.text();
    const jsonMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    let entity = null;
    let trackList = [];
    if (jsonMatch) {
      try {
        const nextData = JSON.parse(jsonMatch[1]);
        const state = nextData?.props?.pageProps?.state?.data?.entity;
        if (state) {
          entity = state;
          trackList = state.trackList || state.tracks?.items || [];
        }
      } catch {
      }
    }
    if (!trackList.length) {
      const regexMatch = html.match(/"trackList"\s*:\s*(\[[^\]]+\])/);
      if (regexMatch) {
        try {
          trackList = JSON.parse(regexMatch[1]);
        } catch {
        }
      }
    }
    const playlistName = entity?.name || entity?.title || "Playlist do Spotify";
    const coverUrl = entity?.coverArt?.sources?.[0]?.url || entity?.images?.[0]?.url || "";
    const faixas = trackList.map((item) => {
      const tr = item?.track || item;
      const name = tr?.name || tr?.title || item?.title;
      if (!name) return null;
      let artist = tr?.artist || tr?.subtitle || item?.subtitle;
      if (!artist && Array.isArray(tr?.artists)) artist = tr.artists.map((a) => a?.name || a).join(", ");
      const duration = Number(tr?.duration_ms || tr?.duration || item?.duration_ms || 0);
      const cover = tr?.coverArt?.sources?.[0]?.url || tr?.images?.[0]?.url || coverUrl;
      return {
        nome_musica: name,
        nome_artista: artist || "Artista Desconhecido",
        album: tr?.album?.name || playlistName,
        duracao_ms: duration > 1e3 ? Math.round(duration) : Math.round(duration * 1e3),
        capa: cover,
        spotify_id: tr?.id || ""
      };
    }).filter(Boolean);
    return res.json({
      sucesso: true,
      nome_playlist: playlistName,
      capa_playlist: coverUrl || faixas[0]?.capa || "",
      total_faixas: faixas.length,
      faixas
    });
  } catch (e) {
    return res.status(502).json({ sucesso: false, error: "Erro ao consultar Spotify: " + String(e?.message || e) });
  }
});
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
start();
//# sourceMappingURL=server.cjs.map
