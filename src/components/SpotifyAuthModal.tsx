import React, { useState } from "react";
import { 
  X, 
  LogIn, 
  Key, 
  ExternalLink, 
  Copy, 
  Check, 
  ShieldCheck, 
  Sparkles, 
  Radio, 
  Lock, 
  Loader2,
  AlertCircle,
  HelpCircle,
  UserCheck
} from "lucide-react";
import { ConfigStatus, SpotifyUser } from "../types";

interface SpotifyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: SpotifyUser) => void;
  configStatus: ConfigStatus | null;
}

export const SpotifyAuthModal: React.FC<SpotifyAuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  configStatus,
}) => {
  const [activeTab, setActiveTab] = useState<"oauth" | "token" | "custom_keys" | "demo">("oauth");
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [tokenInput, setTokenInput] = useState(() => {
    return localStorage.getItem("spotifyTokenManual") || localStorage.getItem("spotifyTokenManuaL") || "";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const currentRedirectUri = `${window.location.origin}/auth/spotify/callback`;

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(currentRedirectUri);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // 1. Official OAuth Popup Login
  const handleOAuthLogin = async () => {
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/auth/spotify/url?redirect_uri=${encodeURIComponent(currentRedirectUri)}`);
      const data = await res.json();

      if (!data.configured) {
        setStatusMessage({
          type: "error",
          text: "Credenciais do Spotify ainda não configuradas. Use as abas 'Credenciais da API' ou 'Token de Acesso' abaixo.",
        });
        setActiveTab("custom_keys");
        setIsLoading(false);
        return;
      }

      const width = 600;
      const height = 750;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.url,
        "spotify_oauth_popup",
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === "SPOTIFY_AUTH_SUCCESS") {
          onLoginSuccess(event.data.user);
          setIsLoading(false);
          setStatusMessage({ type: "success", text: `Conectado com sucesso como ${event.data.user.display_name}!` });
          window.removeEventListener("message", messageHandler);
          setTimeout(() => onClose(), 800);
        } else if (event.data?.type === "SPOTIFY_AUTH_ERROR") {
          setIsLoading(false);
          setStatusMessage({ type: "error", text: `Erro na autorização do Spotify: ${event.data.error}` });
          window.removeEventListener("message", messageHandler);
        }
      };

      window.addEventListener("message", messageHandler);

      // Fallback check
      const interval = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(interval);
          setIsLoading(false);
          const meRes = await fetch("/api/auth/me");
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.authenticated && meData.user) {
              onLoginSuccess(meData.user);
              onClose();
            }
          }
        }
      }, 1000);
    } catch (err: any) {
      setIsLoading(false);
      setStatusMessage({ type: "error", text: err.message || "Erro ao iniciar OAuth." });
    }
  };

  // 2. Direct Token Login
  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    const cleanToken = tokenInput.trim();
    localStorage.setItem("spotifyTokenManual", cleanToken);
    localStorage.setItem("spotifyTokenManuaL", cleanToken);

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/spotify/set-token", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanToken}`
        },
        body: JSON.stringify({ token: cleanToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Token do Spotify inválido.");
      }

      onLoginSuccess(data.user);
      setStatusMessage({ type: "success", text: data.message });
      setTimeout(() => onClose(), 700);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Save Custom Client ID and Secret
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientIdInput.trim() || !clientSecretInput.trim()) return;

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/spotify/set-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientIdInput.trim(),
          clientSecret: clientSecretInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao validar credenciais do Spotify.");
      }

      setStatusMessage({ type: "success", text: "Credenciais validadas! Iniciando login OAuth..." });
      setTimeout(() => {
        handleOAuthLogin();
      }, 600);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
      setIsLoading(false);
    }
  };

  // 4. Demo Login
  const handleDemoLogin = async () => {
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/auth/spotify/demo-login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error("Erro ao ativar modo demo.");

      onLoginSuccess(data.user);
      setStatusMessage({ type: "success", text: "Modo Demonstração ativado!" });
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-6 text-zinc-100 max-h-[95vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1DB954]/20 border border-[#1DB954]/40 flex items-center justify-center text-[#1DB954]">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Conectar ao Spotify
              </h2>
              <p className="text-xs text-zinc-400">
                Acesse suas playlists privadas, biblioteca e músicas salvas
              </p>
            </div>
          </div>
          <button
            id="btn-close-spotify-auth-modal"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector (Responsive 2x2 Grid - No Sideways Scrolling!) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-4 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
          <button
            type="button"
            onClick={() => { setActiveTab("oauth"); setStatusMessage(null); }}
            className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition-all ${
              activeTab === "oauth"
                ? "bg-[#1DB954] text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            OAuth 2.0
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("token"); setStatusMessage(null); }}
            className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition-all ${
              activeTab === "token"
                ? "bg-[#1DB954] text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Via Token
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("custom_keys"); setStatusMessage(null); }}
            className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition-all ${
              activeTab === "custom_keys"
                ? "bg-[#1DB954] text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Chaves API
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("demo"); setStatusMessage(null); }}
            className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition-all ${
              activeTab === "demo"
                ? "bg-[#1DB954] text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Modo Demo
          </button>
        </div>

        {/* Status Alerts */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-start gap-2.5 border ${
              statusMessage.type === "error"
                ? "bg-red-950/40 border-red-800 text-red-300"
                : "bg-emerald-950/40 border-emerald-800 text-emerald-300"
            }`}
          >
            {statusMessage.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            ) : (
              <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            )}
            <p className="flex-1">{statusMessage.text}</p>
          </div>
        )}

        {/* Content Body */}
        <div className="mt-4 space-y-4">
          
          {/* TAB 1: OAuth 2.0 Login */}
          {activeTab === "oauth" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <ShieldCheck className="w-4 h-4 text-[#1DB954]" />
                  <span>Login Oficial e Seguro com o Spotify</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Permite sincronizar suas playlists públicas e privadas diretamente da sua conta Spotify.
                </p>
                
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-zinc-400 block mb-1">
                    URI de Redirecionamento configurada:
                  </span>
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-900 border border-zinc-700/80 font-mono text-[11px] text-[#1DB954]">
                    <span className="truncate">{currentRedirectUri}</span>
                    <button
                      type="button"
                      onClick={copyRedirectUri}
                      className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-sans flex items-center gap-1 shrink-0"
                    >
                      {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                id="btn-confirm-spotify-oauth-login"
                type="button"
                onClick={handleOAuthLogin}
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] active:bg-[#1aa34a] text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando com o Spotify...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 stroke-[2.5]" />
                    <span>Iniciar Conexão Oficial Spotify</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: Token Login */}
          {activeTab === "token" && (
            <form onSubmit={handleTokenLogin} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span>Conexão Imediata via Bearer Token</span>
                </div>
                <p className="text-zinc-400">
                  Cole seu Token de Acesso do Spotify para conexão direta instantânea sem necessidade de popup.
                </p>
                <a
                  href="https://developer.spotify.com/console/get-current-user-playlists/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#1DB954] underline hover:text-emerald-300 text-[11px]"
                >
                  <ExternalLink className="w-3 h-3" />
                  Obter Token no Spotify Console
                </a>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Spotify Access Token (Bearer):
                </label>
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Cole seu token aqui (ex: BQD...)"
                  rows={3}
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-[#1DB954]"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !tokenInput.trim()}
                className="w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                <span>Conectar com Token</span>
              </button>
            </form>
          )}

          {/* TAB 3: Custom API Keys */}
          {activeTab === "custom_keys" && (
            <form onSubmit={handleSaveCredentials} className="space-y-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 space-y-1.5">
                <p className="text-zinc-400 leading-relaxed">
                  Crie um app gratuito em <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-[#1DB954] underline font-semibold">developer.spotify.com</a> e adicione a Redirect URI:
                </p>
                <div className="flex items-center justify-between gap-1.5 p-1.5 rounded bg-zinc-900 text-[10px] font-mono text-emerald-300 border border-zinc-800">
                  <span className="truncate">{currentRedirectUri}</span>
                  <button
                    type="button"
                    onClick={copyRedirectUri}
                    className="p-1 rounded bg-zinc-800 text-zinc-300 hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Spotify Client ID:
                </label>
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="Ex: a1b2c3d4e5f6..."
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#1DB954]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Spotify Client Secret:
                </label>
                <input
                  type="password"
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  placeholder="Ex: 987654321fedcba..."
                  className="w-full h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#1DB954]"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !clientIdInput.trim() || !clientSecretInput.trim()}
                className="w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 mt-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Salvar Credenciais e Conectar</span>
              </button>
            </form>
          )}

          {/* TAB 4: Demo Mode */}
          {activeTab === "demo" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-xs text-zinc-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-indigo-300">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Modo Demonstração Imediato</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Permite explorar todas as funções do SpotTube com playlists privadas simuladas e biblioteca sincronizada sem precisar criar uma conta de desenvolvedor.
                </p>
              </div>

              <button
                id="btn-demo-spotify-login"
                type="button"
                onClick={handleDemoLogin}
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Ativar Modo Demonstração</span>
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="mt-6 pt-3 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
