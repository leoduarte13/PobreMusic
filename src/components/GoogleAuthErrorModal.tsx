import React, { useState } from "react";
import { X, AlertTriangle, Copy, Check, ExternalLink, ShieldCheck, Globe } from "lucide-react";

interface GoogleAuthErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorInfo: {
    title: string;
    message: string;
    isDomainError: boolean;
    currentDomain: string;
  } | null;
  onRetry: () => void;
}

export const GoogleAuthErrorModal: React.FC<GoogleAuthErrorModalProps> = ({
  isOpen,
  onClose,
  errorInfo,
  onRetry,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !errorInfo) return null;

  const handleCopyDomain = () => {
    if (errorInfo.currentDomain) {
      navigator.clipboard.writeText(errorInfo.currentDomain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${errorInfo.isDomainError ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{errorInfo.title}</h3>
              <p className="text-xs text-zinc-400">Autenticação com Google</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-4 text-xs">
          {errorInfo.isDomainError ? (
            <>
              <p className="text-zinc-300 leading-relaxed">
                Por segurança, o Google exige que este domínio esteja cadastrado na lista de domínios autorizados do seu projeto Firebase.
              </p>

              {/* Current Domain Box with Copy */}
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Domínio Atual para Autorizar:
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <code className="text-xs font-mono font-bold text-emerald-400 truncate bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                    {errorInfo.currentDomain || window.location.hostname}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyDomain}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Step by step */}
              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2">
                <p className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Passo a passo rápido no Firebase:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400 text-[11px] leading-relaxed">
                  <li>Acesse o <strong className="text-zinc-200">Firebase Console</strong></li>
                  <li>Vá em <strong className="text-zinc-200">Authentication &gt; Settings &gt; Authorized Domains</strong></li>
                  <li>Clique em <strong className="text-zinc-200">Adicionar Domínio</strong> e cole o domínio acima</li>
                </ol>
              </div>
            </>
          ) : (
            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-zinc-300 leading-relaxed whitespace-pre-line">
              {errorInfo.message}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onRetry();
            }}
            className="px-4 py-2 text-xs font-bold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    </div>
  );
};
