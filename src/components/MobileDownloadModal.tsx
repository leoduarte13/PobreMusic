import React, { useState, useEffect } from "react";
import { 
  X, 
  Download, 
  Smartphone, 
  FileText, 
  Music, 
  CheckCircle2, 
  Sparkles, 
  ArrowDownToLine,
  Apple,
  Chrome,
  Loader2,
  HelpCircle,
  Moon,
  Laptop
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
  canInstallPWA = false,
}) => {
  const [activeTab, setActiveTab] = useState<"pwa" | "download" | "lockscreen">("pwa");
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent || "";
      setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    }
  }, []);

  if (!isOpen) return null;

  // Download .M3U format
  const handleDownloadM3U = () => {
    setDownloadingFormat("m3u");
    setTimeout(() => {
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

      setDownloadingFormat(null);
      setDownloadSuccess("m3u");
      setTimeout(() => setDownloadSuccess(null), 3000);
    }, 400);
  };

  // Download .JSON format
  const handleDownloadJSON = () => {
    setDownloadingFormat("json");
    setTimeout(() => {
      const data = {
        app: "POBREMUSIC",
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

      setDownloadingFormat(null);
      setDownloadSuccess("json");
      setTimeout(() => setDownloadSuccess(null), 3000);
    }, 400);
  };

  // Download .TXT tracklist
  const handleDownloadTXT = () => {
    setDownloadingFormat("txt");
    setTimeout(() => {
      let txt = `POBREMUSIC - Playlist: ${playlistName}\n`;
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

      setDownloadingFormat(null);
      setDownloadSuccess("txt");
      setTimeout(() => setDownloadSuccess(null), 3000);
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-7 text-zinc-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl overflow-hidden bg-zinc-950 border border-emerald-500/40 p-1 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <img src="/pobremusic_icon.svg" alt="POBREMUSIC" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Download & App Mobile</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold">
                  PWA
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Instale no celular ou baixe suas playlists</p>
            </div>
          </div>
          <button
            id="btn-close-mobile-download-modal"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
            aria-label="Fechar modal de download"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs mt-4">
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
            <span>Instalar App</span>
          </button>

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
            onClick={() => setActiveTab("lockscreen")}
            className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "lockscreen"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Tela Bloqueada</span>
          </button>
        </div>

        {/* Tab 1: PWA Install Mobile App */}
        {activeTab === "pwa" && (
          <div className="mt-5 space-y-4">
            {canInstallPWA && onTriggerPWAInstall && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-zinc-900 to-zinc-950 border border-emerald-500/50 space-y-2.5 shadow-lg shadow-emerald-950/30">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Instalação Automática Disponível</span>
                </div>
                <p className="text-xs text-zinc-300">
                  Toque no botão abaixo para instalar o POBREMUSIC direto no seu dispositivo como um aplicativo nativo.
                </p>
                <button
                  id="btn-trigger-pwa-install"
                  type="button"
                  onClick={onTriggerPWAInstall}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-zinc-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
                >
                  <ArrowDownToLine className="w-4 h-4 stroke-[2.5]" />
                  <span>Instalar POBREMUSIC Agora</span>
                </button>
              </div>
            )}

            {/* Step by step instructions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Android Chrome */}
              <div className={`p-4 rounded-xl bg-zinc-950 border ${!isIOS ? "border-emerald-500/60 ring-1 ring-emerald-500/20" : "border-zinc-800"} space-y-2`}>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <Chrome className="w-4 h-4" />
                  <span>Android (Chrome / Brave / Edge)</span>
                </div>
                <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside">
                  <li>Toque no menu de <strong className="text-white">3 pontos (⋮)</strong> no canto superior do navegador</li>
                  <li>Selecione <strong className="text-emerald-300">"Instalar aplicativo"</strong> ou <strong className="text-emerald-300">"Adicionar à tela inicial"</strong></li>
                  <li>Abra o aplicativo pelo ícone verde criado na sua tela!</li>
                </ol>
              </div>

              {/* iOS Safari */}
              <div className={`p-4 rounded-xl bg-zinc-950 border ${isIOS ? "border-blue-500/60 ring-1 ring-blue-500/20" : "border-zinc-800"} space-y-2`}>
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400">
                  <Apple className="w-4 h-4" />
                  <span>iPhone / iPad (Safari)</span>
                </div>
                <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside">
                  <li>Toque no botão <strong className="text-white">Compartilhar</strong> (ícone do quadrado com seta para cima ⎋)</li>
                  <li>Role a lista para baixo e toque em <strong className="text-blue-300">"Adicionar à Tela de Início ⊞"</strong></li>
                  <li>Toque em <strong className="text-white">Adicionar</strong> no canto superior direito</li>
                </ol>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Instalado como app, o PobreMusic ganha ícone dedicado, tela cheia e melhor estabilidade para reprodução em segundo plano.</span>
            </div>
          </div>
        )}

        {/* Tab 2: Download Playlist */}
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
                id="btn-download-m3u"
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
                      Formato .M3U (Player de Música Offline)
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Compatível com VLC, Musicolet, Poweramp, iOS Files
                    </p>
                  </div>
                </div>
                {downloadingFormat === "m3u" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <Loader2 className="w-4 h-4 animate-spin" /> Baixando...
                  </span>
                ) : downloadSuccess === "m3u" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4 animate-bounce text-emerald-400" /> Baixado!
                  </span>
                ) : (
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                )}
              </button>

              {/* Option 2: .JSON */}
              <button
                id="btn-download-json"
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
                {downloadingFormat === "json" ? (
                  <span className="flex items-center gap-1 text-xs text-blue-400 font-bold">
                    <Loader2 className="w-4 h-4 animate-spin" /> Baixando...
                  </span>
                ) : downloadSuccess === "json" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4 animate-bounce text-emerald-400" /> Baixado!
                  </span>
                ) : (
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                )}
              </button>

              {/* Option 3: .TXT */}
              <button
                id="btn-download-txt"
                type="button"
                onClick={handleDownloadTXT}
                className="w-full p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/60 border border-zinc-800 hover:border-purple-500/50 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-purple-300">
                      Lista de Faixas em Texto (.TXT)
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Lista legível com nome, artista e links para copiar
                    </p>
                  </div>
                </div>
                {downloadingFormat === "txt" ? (
                  <span className="flex items-center gap-1 text-xs text-purple-400 font-bold">
                    <Loader2 className="w-4 h-4 animate-spin" /> Baixando...
                  </span>
                ) : downloadSuccess === "txt" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4 animate-bounce text-emerald-400" /> Baixado!
                  </span>
                ) : (
                  <Download className="w-4 h-4 text-zinc-400 group-hover:text-white" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Lockscreen & Background Audio Tips */}
        {activeTab === "lockscreen" && (
          <div className="mt-5 space-y-3.5">
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2.5 text-white font-bold text-sm">
                <Laptop className="w-4 h-4 text-emerald-400" />
                <span>Dica: Tocar com a Tela Desligada no Chrome</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                O Google Chrome suspende vídeos em segundo plano no modo mobile. Para ouvir sem parar ao bloquear a tela:
              </p>
              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <span>No Chrome, abra o menu <strong className="text-white">⋮ (três pontos)</strong> no topo.</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <span>Marque a opção <strong className="text-emerald-300">"Para computador"</strong> (Versão desktop).</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <span>Dê Play na música e desligue a tela: o áudio continua tocando direto!</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-between">
          <p className="text-[11px] text-zinc-500">
            POBREMUSIC PWA • Versão Móvel 100% Gratuita
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
