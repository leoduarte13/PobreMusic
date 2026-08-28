import React, { useState } from "react";
import { X, Key, Terminal, Code2, Copy, Check, ExternalLink, Sparkles, Send, Play, Lock, ShieldCheck, Globe } from "lucide-react";
import { ConfigStatus } from "../types";

interface ConfigGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  configStatus: ConfigStatus | null;
}

export const ConfigGuideModal: React.FC<ConfigGuideModalProps> = ({ isOpen, onClose, configStatus }) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [testSearchQuery, setTestSearchQuery] = useState("Billie Jean Michael Jackson");
  const [testSearchResult, setTestSearchResult] = useState<any>(null);
  const [isTestingSearch, setIsTestingSearch] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleTestSearch = async () => {
    setIsTestingSearch(true);
    setTestSearchResult(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(testSearchQuery)}`);
      const data = await res.json();
      setTestSearchResult(data);
    } catch (err: any) {
      setTestSearchResult({ erro: true, details: err.message });
    } finally {
      setIsTestingSearch(false);
    }
  };

  const devCallback = configStatus?.devCallbackUrl || "https://ais-dev-scpvhniuyqfisqru6bsquo-19904035643.us-west1.run.app/auth/spotify/callback";
  const prodCallback = configStatus?.prodCallbackUrl || "https://ais-pre-scpvhniuyqfisqru6bsquo-19904035643.us-west1.run.app/auth/spotify/callback";

  const envSnippet = `# Arquivo .env na raiz do projeto

# 1. SPOTIFY OAUTH 2.0 & CLIENT CREDENTIALS
# Obtenha em: https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID="seu_spotify_client_id_aqui"
SPOTIFY_CLIENT_SECRET="seu_spotify_client_secret_aqui"

# Segredo para assinatura de Cookies de Sessão Express
SESSION_SECRET="sua_chave_secreta_de_sessao_2026"

# 2. YOUTUBE DATA API V3 KEY
# Obtenha em: https://console.cloud.google.com/apis/credentials
YOUTUBE_API_KEY="sua_chave_youtube_api_v3_aqui"
`;

  const installSnippet = `# 1. Instalar todas as dependências
npm install

# 2. Iniciar o servidor local Full Stack (Backend Express + Frontend Vite)
npm run dev

# 3. Construir para produção (gera dist/ e dist/server.cjs)
npm run build

# 4. Executar o servidor de produção
npm start
`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Guia de Configuração & OAuth 2.0</h2>
              <p className="text-xs text-zinc-400">Instruções para Spotify OAuth (Playlists Privadas), YouTube API e deploy</p>
            </div>
          </div>
          <button
            id="btn-close-config-modal"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-6 space-y-6">
          {/* Status Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border bg-emerald-950/20 border-emerald-800/40 text-emerald-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  spotify-url-info
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  Nativo
                </span>
              </div>
              <p className="text-xs mt-1 text-zinc-400">
                Extração direta de qualquer playlist pública do Spotify sem precisar de chaves ou API.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${configStatus?.spotifyConfigured ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Spotify OAuth 2.0
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${configStatus?.spotifyConfigured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  {configStatus?.spotifyConfigured ? 'Pronto' : 'Opcional'}
                </span>
              </div>
              <p className="text-xs mt-1 text-zinc-400">
                Escopo <code className="text-emerald-400">playlist-read-private</code> para playlists privadas da sua conta.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${configStatus?.youtubeConfigured ? 'bg-red-950/20 border-red-800/40 text-red-300' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">YouTube Data API</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${configStatus?.youtubeConfigured ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-400'}`}>
                  {configStatus?.youtubeConfigured ? 'API Key Ativa' : 'Busca Inteligente'}
                </span>
              </div>
              <p className="text-xs mt-1 text-zinc-400">
                {configStatus?.youtubeConfigured 
                  ? 'Consultas oficiais consumindo o endpoint search da v3.' 
                  : 'Modo de busca inteligente e cache ativo.'}
              </p>
            </div>
          </div>

          {/* OAuth Redirect URIs Section */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                URIs de Redirecionamento (Redirect URIs) do Spotify Dashboard
              </h4>
            </div>
            <p className="text-xs text-zinc-300">
              No seu aplicativo do <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-semibold">Spotify Developer Dashboard</a>, em <strong>Edit Settings</strong> &gt; <strong>Redirect URIs</strong>, adicione as seguintes URLs:
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-300">
                <span className="truncate">{devCallback}</span>
                <button
                  onClick={() => copyToClipboard(devCallback, "devCallback")}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1 shrink-0"
                >
                  {copiedSection === "devCallback" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>Copiar</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-300">
                <span className="truncate">{prodCallback}</span>
                <button
                  onClick={() => copyToClipboard(prodCallback, "prodCallback")}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1 shrink-0"
                >
                  {copiedSection === "prodCallback" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>Copiar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 1: .env File */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs">1</span>
                Configuração do arquivo <code className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded text-xs">.env</code>
              </h3>
              <button
                onClick={() => copyToClipboard(envSnippet, "env")}
                className="text-xs flex items-center gap-1 text-zinc-400 hover:text-emerald-400"
              >
                {copiedSection === "env" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSection === "env" ? "Copiado!" : "Copiar .env"}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 overflow-x-auto leading-relaxed">
              {envSnippet}
            </pre>
          </div>

          {/* Step 2: Commands */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs">2</span>
                Comandos de Instalação e Execução
              </h3>
              <button
                onClick={() => copyToClipboard(installSnippet, "commands")}
                className="text-xs flex items-center gap-1 text-zinc-400 hover:text-emerald-400"
              >
                {copiedSection === "commands" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSection === "commands" ? "Copiado!" : "Copiar Comandos"}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-emerald-400/90 overflow-x-auto leading-relaxed">
              {installSnippet}
            </pre>
          </div>

          {/* Step 3: Architecture & Live API Tester */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs">3</span>
              Rotas da API Backend (JSON & OAuth)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="flex items-center gap-2 font-mono font-bold text-emerald-400 mb-1">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px]">GET / POST</span>
                  <span>/api/playlist</span>
                </div>
                <p className="text-zinc-400 mb-2">
                  Recebe <code className="text-zinc-300">id</code> ou <code className="text-zinc-300">url</code>. Usa o token de sessão do usuário (se autenticado) para ler playlists públicas ou privadas:
                </p>
                <pre className="p-2 rounded bg-zinc-900 text-[11px] text-zinc-300 overflow-x-auto">
{`{
  "sucesso": true,
  "autenticado": true,
  "isPrivate": true,
  "faixas": [
    {
      "nome_musica": "Blinding Lights",
      "nome_artista": "The Weeknd"
    }
  ]
}`}
                </pre>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <div className="flex items-center gap-2 font-mono font-bold text-red-400 mb-1">
                  <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px]">GET</span>
                  <span>/api/search</span>
                </div>
                <p className="text-zinc-400 mb-2">
                  Recebe <code className="text-zinc-300">nome_musica + nome_artista</code> e retorna o <code className="text-zinc-300">videoId</code>:
                </p>
                <pre className="p-2 rounded bg-zinc-900 text-[11px] text-zinc-300 overflow-x-auto">
{`{
  "sucesso": true,
  "videoId": "4NRXx6U8ABQ",
  "titulo": "The Weeknd - Blinding Lights"
}`}
                </pre>
              </div>
            </div>

            {/* Interactive Search Route Tester */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 mt-2">
              <label className="block text-xs font-medium text-zinc-300 mb-2">
                Testar Rota <code className="text-red-400">/api/search</code> em tempo real:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testSearchQuery}
                  onChange={(e) => setTestSearchQuery(e.target.value)}
                  placeholder="Nome da Música + Nome do Artista"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleTestSearch}
                  disabled={isTestingSearch}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                >
                  {isTestingSearch ? "Buscando..." : <><Send className="w-3.5 h-3.5" /> Testar</>}
                </button>
              </div>

              {testSearchResult && (
                <pre className="mt-2 p-2.5 rounded bg-zinc-900 text-[11px] text-emerald-400 overflow-x-auto border border-zinc-800">
                  {JSON.stringify(testSearchResult, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors"
          >
            Fechar Guia
          </button>
        </div>
      </div>
    </div>
  );
};
