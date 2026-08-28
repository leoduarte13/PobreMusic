import React, { useState, useEffect } from "react";
import { Download, Smartphone, X, Sparkles, ArrowRight } from "lucide-react";

interface MobileDownloadBannerProps {
  onOpenMobileDownload: () => void;
  trackCount: number;
}

export const MobileDownloadBanner: React.FC<MobileDownloadBannerProps> = ({
  onOpenMobileDownload,
  trackCount,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileScreen = window.innerWidth < 768;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      setIsMobile(isMobileScreen || isMobileUA);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (!isMobile || isDismissed) return null;

  return (
    <div className="w-full bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-950 border-b border-emerald-500/30 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs shadow-md">
      <div 
        onClick={onOpenMobileDownload}
        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
      >
        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
          <Smartphone className="w-4 h-4 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white truncate flex items-center gap-1.5">
            <span>Versão Mobile Detectada</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
              Download
            </span>
          </p>
          <p className="text-[11px] text-zinc-300 truncate">
            Baixar playlist ({trackCount} faixas) ou instalar app no celular
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onOpenMobileDownload}
          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all"
        >
          <Download className="w-3 h-3" />
          <span>Baixar</span>
        </button>

        <button
          onClick={() => setIsDismissed(true)}
          className="p-1 text-zinc-400 hover:text-white rounded-md transition-colors"
          title="Ocultar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
