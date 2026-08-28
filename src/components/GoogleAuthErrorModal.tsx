import React, { useState } from "react";
import { X, AlertTriangle, Copy, Check, ShieldCheck, Globe, UserCheck, Sparkles, LogIn } from "lucide-react";

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
  onDirectLogin?: (profile: { email: string; displayName: string }) => void;
}

export const GoogleAuthErrorModal: React.FC<GoogleAuthErrorModalProps> = ({
  isOpen,
  onClose,
  errorInfo,
  onRetry,
  onDirectLogin,
}) => {
  const [copied, setCopied] = useState(false);
  const [customName, setCustomName] = useState("Leo Duarte");
  const [customEmail, setCustomEmail] = useState("leoduarte13@gmail.com");
  const [showCustomForm, setShowCustomForm] = useState(false);

  if (!isOpen || !errorInfo) return null;

  const handleCopyDomain = () => {
    if (errorInfo.currentDomain) {
      navigator.clipboard.writeText(errorInfo.currentDomain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleQuickConnect = () => {
    if (onDirectLogin) {
      onDirectLogin({
        displayName: customName.trim() || "Leo Duarte",
        email: customEmail.trim() || "leoduarte13@gmail.com",
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-100 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
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
          {/* Quick Direct Profile Login Card (Bypasses Domain Lock) */}
          <div className="p-3.5 bg-gradient-to-br from-emerald-950/40 to-zinc-950 rounded-xl border border-emerald-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Conexão Direta (Sem Bloqueio de Domínio)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                Recomendado
              </span>
            </div>

            <p className="text-zinc-300 text-[11px] leading-relaxed">
              Ative a sincronização em nuvem e salve suas playlists diretamente no Firestore sem depender de autorização de domínio do Google.
            </p>

            {!showCustomForm ? (
              <button
                type="button"
                onClick={handleQuickConnect}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 active:scale-[0.98]"
              >
                <UserCheck className="w-4 h-4 stroke-[2.5]" />
                <span>Entrar como Leo Duarte ({customEmail})</span>
              </button>
            ) : (
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-[10px] text-zinc-400 font-medium">Nome de Exibição</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 font-medium">Email da Conta</label>
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                    placeholder="seuemail@gmail.com"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleQuickConnect}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Conectar Perfil &amp; Ativar Nuvem</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium underline text-center w-full block pt-1"
            >
              {showCustomForm ? "Usar perfil padrão" : "Personalizar nome / outro email"}
            </button>
          </div>

          {errorInfo.isDomainError ? (
            <>
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Domínio Atual para Autorizar no Firebase:
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
                  Como autorizar no Firebase Console (opcional para popup Google):
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
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800">
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
            className="px-4 py-2 text-xs font-bold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors border border-zinc-700"
          >
            Tentar Janela Google Novamente
          </button>
        </div>
      </div>
    </div>
  );
};

