import React, { useState, useEffect } from "react";
import { 
  X, 
  Download, 
  Smartphone, 
  FileText, 
  Music, 
  Share2, 
  PlusSquare, 
  CheckCircle2, 
  Sparkles, 
  ArrowDownToLine,
  Apple,
  Chrome
} from "lucide-react";
import { Track } from "../types";

interface MobileDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  playlistName?: string;
  onTriggerPWAInstall?: () => void;
  canInstallPWA?: boolean;
}

export const MobileDownloadModal: React.FC<MobileDownloadModalProps> = ({
  isOpen,
  onClose,
  tracks,
  playlistName = "Minha Playlist POBREMUSIC",
  onTriggerPWAInstall,
  canInstallPWA,
}) => {
  const [activeTab, setActiveTab] = useState<"download" | "pwa">("download");
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  // Download .M3U format
  const handleDownloadM3U = () => {
    let m3uContent = "#EXTM3U\n";
    m3uContent += `#PLAYLIST:${playlistName}\n\n`;

    tracks.forEach((t) => {
      const durSec = t.duracao_ms ? Math.floor(t.duracao_ms / 1000) : -1;
      m3uContent += `#EXTINF:${durSec},${t.nome_artista} - ${t.nome_musica}\n`;
      if (t.videoId) {
        m3uContent += `https://www.youtube.com/watch?v=${t.videoId}\n\n`;
      } else {
        m3uContent += `https://open.spotify.com/track/${t.spotify_id || ""}\n\n`;
      }
    });

    const blob = new Blob([m3uContent], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlistName.toLowerCase().replace(/[^a-z0-9]/g, "_")}.m3u`;
    a.click();
    URL.revokeObjectURL(url);

    setDownloadSuccess("m3u");
    setTimeout(() => setDownloadSuccess(null), 2500);
  };

  // Download .JSON format
  const handleDownloadJSON = () => {
    const data = {
      app: "SpotTube",
      playlist_name: playlistName,
      total_faixas: tracks.length,
      download_date: new Date().toISOString(),
      faixas: tracks.map((t, idx) => ({
        posicao: idx + 1,
        musica: t.nome_musica,
        artista: t.nome_artista,
        album: t.album || "",
        duracao_ms: t.duracao_ms || 0,
        youtube_video_id: t.videoId || "",
        capa_url: t.capa || "",
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlistName.toLowerCase().replace(/[^a-z0-9]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setDownloadSuccess("json");
    setTimeout(() => setDownloadSuccess(null), 2500);
  };

  // Download .TXT tracklist
  const handleDownloadTXT = () => {
    let txt = `SpotTube - Playlist: ${playlistName}\n`;
    txt += `Total de Faixas: ${tracks.length}\n`;
    txt += `Data: ${new Date().toLocaleDateString()}\n\n`;
    txt += `===============================\n\n`;

    tracks.forEach((t, i) => {
      txt += `${i + 1}. ${t.nome_musica} - ${t.nome_artista}\n`;
      if (t.videoId) txt += `   YouTube: https://youtu.be/${t.videoId}\n`;
    });

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlistName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_faixas.txt`;
    a.click();
    URL.revokeObjectURL(url);

    setDownloadSuccess("txt");
    setTimeout(() => setDownloadSuccess(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-7 text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Central de Download Mobile</h2>
              <p className="text-xs text-zinc-400">Baixe playlists ou instale o SpotTube no seu celular</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs mt-4">
          <button
            type="button"
            onClick={() => setActiveTab("download")}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "download"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Baixar Playlist ({tracks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pwa")}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "pwa"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Instalar App Mobile</span>
          </button>
        </div>

        {/* Tab 1: Download Playlist */}
        {activeTab === "download" && (
          <div className="mt-5 space-y-4">
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <p className="text-xs font-semibold text-white truncate">
                {playlistName}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {tracks.length} faixas com nomes, artistas e links do YouTube prontos para download.
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Option 1: .M3U */}
              <button
                type="button"
                onClick={handleDownloadM3U}
                className="w-full p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/60 border border-zinc-800 hover:border-emerald-500/50 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20">
                    <Music className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-emerald-300">
                      Formato .M3U (Player de Música)
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Compatível com VLC, Musicolet, Poweramp, iOS Files
                    </p>
                  </div>
                </div>
                {downloadSuccess === "m3u" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Baixado
                  </span>
                ) : (
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                )}
              </button>

              {/* Option 2: .JSON */}
              <button
                type="button"
                onClick={handleDownloadJSON}
                className="w-full p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/60 border border-zinc-800 hover:border-blue-500/50 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-blue-300">
                      Formato .JSON Estruturado
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Metadados completos, duração, capas e YouTube Video IDs
                    </p>
                  </div>
                </div>
                {downloadSuccess === "json" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Baixado
                  </span>
                ) : (
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                )}
              </button>

              {/* Option 3: .TXT */}
              <button
                type="button"
                onClick={handleDownloadTXT}
                className="w-full p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/60 border border-zinc-800 hover:border-purple-500/50 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-purple-300">
                      Lista de Faixas em Texto (.TXT)
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Lista legível com nome, artista e links para compartilhar
                    </p>
                  </div>
                </div>
                {downloadSuccess === "txt" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Baixado
                  </span>
                ) : (
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: PWA Install Mobile App */}
        {activeTab === "pwa" && (
          <div className="mt-5 space-y-4">
            {canInstallPWA && onTriggerPWAInstall && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-zinc-950 border border-emerald-500/40 space-y-2.5">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Instalação Rápida com 1 Toque</span>
                </div>
                <p className="text-xs text-zinc-300">
                  Instale o POBREMUSIC como um aplicativo nativo no seu Android ou iOS com suporte a reprodução em segundo plano.
                </p>
                <button
                  type="button"
                  onClick={onTriggerPWAInstall}
                  className="w-full py-2.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg"
                >
                  <ArrowDownToLine className="w-4 h-4 stroke-[2.5]" />
                  <span>Instalar Agora no Celular</span>
                </button>
              </div>
            )}

            {/* Step by step instructions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Android Chrome */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <Chrome className="w-4 h-4" />
                  <span>Android (Chrome)</span>
                </div>
                <ol className="text-[11px] text-zinc-400 space-y-1 list-decimal list-inside">
                  <li>Toque no menu dos <strong className="text-white">3 pontos (⋮)</strong> no topo</li>
                  <li>Selecione <strong className="text-white">"Instalar aplicativo"</strong> ou <strong className="text-white">"Adicionar à tela inicial"</strong></li>
                  <li>Abra o ícone no seu celular e aproveite!</li>
                </ol>
              </div>

              {/* iOS Safari */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                  <Apple className="w-4 h-4" />
                  <span>iPhone / iPad (Safari)</span>
                </div>
                <ol className="text-[11px] text-zinc-400 space-y-1 list-decimal list-inside">
                  <li>Toque no botão <strong className="text-white">Compartilhar</strong> (ícone do quadrado com seta)</li>
                  <li>Role para baixo e toque em <strong className="text-white">"Adicionar à Tela de Início"</strong></li>
                  <li>Toque em <strong className="text-white">Adicionar</strong> no canto superior</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
