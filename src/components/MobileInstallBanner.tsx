import React from "react";
import { Smartphone, Download, X, Sparkles, ArrowRight } from "lucide-react";

interface MobileInstallBannerProps {
  onOpenDownloadModal: () => void;
  onTriggerPWAInstall?: () => void;
  canInstallPWA?: boolean;
  onDismiss: () => void;
}

export const MobileInstallBanner: React.FC<MobileInstallBannerProps> = ({
  onOpenDownloadModal,
  onTriggerPWAInstall,
  canInstallPWA = false,
  onDismiss,
}) => {
  return (
    <aside aria-label="Instalação do Aplicativo Mobile" className="relative z-30 w-full bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-950 border-b border-emerald-500/30 px-3 py-2.5 sm:px-6 shadow-lg shadow-emerald-950/20">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Left icon & text */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 p-1 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <span>Baixar / Instalar App POBREMUSIC</span>
              <span className="hidden xs:inline-flex px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Grátis
              </span>
            </p>
            <p className="text-[11px] text-zinc-300 truncate">
              Instale no celular para tocar com a tela desligada e baixar playlists
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-banner-install-app"
            type="button"
            onClick={() => {
              if (canInstallPWA && onTriggerPWAInstall) {
                onTriggerPWAInstall();
              } else {
                onOpenDownloadModal();
              }
            }}
            className="min-h-[34px] px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Instalar / Baixar</span>
            <span className="sm:hidden">Baixar</span>
            <ArrowRight className="w-3 h-3 stroke-[2.5]" />
          </button>

          <button
            id="btn-banner-dismiss"
            type="button"
            onClick={onDismiss}
            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700/60 transition-colors"
            title="Fechar aviso"
            aria-label="Fechar aviso de instalação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
