import React, { useState, useEffect } from "react";
import { 
  Radio, 
  KeyRound, 
  LogIn, 
  LogOut, 
  ShieldCheck, 
  Minimize2,
  Menu,
  X,
  Sliders,
  Smartphone,
  Plus,
  BookmarkCheck,
  Disc3,
  UserCheck
} from "lucide-react";
import { ConfigStatus, SpotifyUser, GoogleUserProfile } from "../types";
import { PobreMusicLogo } from "./PobreMusicLogo";

interface NavbarProps {
  configStatus: ConfigStatus | null;
  spotifyUser: SpotifyUser | null;
  isLoggingIn: boolean;
  onLoginSpotify: () => void;
  onLogoutSpotify: () => void;
  googleUser: GoogleUserProfile | null;
  isGoogleLoggingIn: boolean;
  onLoginGoogle: () => void;
  onLogoutGoogle: () => void;
  onOpenConfigModal: () => void;
  onToggleMiniPlayer?: () => void;
  onOpenEqualizerModal?: () => void;
  onOpenMobileDownload?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  configStatus,
  spotifyUser,
  isLoggingIn,
  onLoginSpotify,
  onLogoutSpotify,
  googleUser,
  isGoogleLoggingIn,
  onLoginGoogle,
  onLogoutGoogle,
  onOpenConfigModal,
  onToggleMiniPlayer,
  onOpenEqualizerModal,
  onOpenMobileDownload,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on Escape or window resize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <PobreMusicLogo size="md" showText={true} />
          </div>

          {/* Desktop Navigation (md and up) */}
          <div className="hidden md:flex items-center gap-2.5 sm:gap-3">
            {/* Mini Player Toggle */}
            {onToggleMiniPlayer && (
              <button
                id="btn-navbar-mini-player"
                onClick={onToggleMiniPlayer}
                className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-semibold text-zinc-200 transition-all hover:text-white hover:border-emerald-500/50 shadow-sm"
                title="Alternar para Mini Player Compacto (Tecla M)"
              >
                <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mini Player</span>
              </button>
            )}

            {/* Equalizer Quick Button */}
            {onOpenEqualizerModal && (
              <button
                id="btn-navbar-equalizer"
                onClick={onOpenEqualizerModal}
                className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all hover:text-white shadow-sm"
                title="Abrir Equalizador"
              >
                <Sliders className="w-3.5 h-3.5 text-teal-400" />
                <span>Equalizador</span>
              </button>
            )}

            {/* Google Authentication Status / Button */}
            {googleUser ? (
              <div className="flex items-center gap-2 p-1 pl-2.5 pr-1.5 rounded-xl bg-zinc-900/90 border border-emerald-500/40">
                <div className="flex items-center gap-2">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || "Google User"}
                      className="w-6 h-6 rounded-full object-cover border border-emerald-400/60"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center text-xs font-black">
                      {(googleUser.displayName || googleUser.email || "G").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-xs font-bold text-white leading-tight truncate max-w-[110px]">
                      {googleUser.displayName || googleUser.email?.split("@")[0] || "Minha Conta"}
                    </p>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 font-medium leading-none">
                      <UserCheck className="w-2.5 h-2.5" /> Playlists Privadas
                    </span>
                  </div>
                </div>

                <button
                  id="btn-google-logout"
                  onClick={onLogoutGoogle}
                  title="Sair da conta Google"
                  className="min-h-[28px] min-w-[28px] flex items-center justify-center p-1 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                id="btn-google-login"
                onClick={onLoginGoogle}
                disabled={isGoogleLoggingIn}
                className="min-h-[38px] flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-emerald-500 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
                title="Entrar com o Google para salvar suas playlists de forma individual e privada"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2s.7 5.5 1.9 7.9l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
                  />
                </svg>
                <span>{isGoogleLoggingIn ? "Entrando..." : "Entrar com Google"}</span>
              </button>
            )}

            {/* Spotify Auth Section */}
            {spotifyUser ? (
              <div className="flex items-center gap-1.5 p-1 pl-2.5 pr-1.5 rounded-xl bg-zinc-900 border border-zinc-800">
                <div className="flex items-center gap-2">
                  {spotifyUser.images && spotifyUser.images[0]?.url ? (
                    <img
                      src={spotifyUser.images[0].url}
                      alt={spotifyUser.display_name}
                      className="w-5 h-5 rounded-full object-cover border border-[#1DB954]"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[#1DB954]/20 text-[#1DB954] flex items-center justify-center text-[10px] font-bold">
                      {spotifyUser.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-[11px] font-semibold text-white leading-tight truncate max-w-[90px]">
                      {spotifyUser.display_name}
                    </p>
                    <span className="text-[9px] text-[#1DB954] flex items-center gap-0.5 font-medium leading-none">
                      <ShieldCheck className="w-2.5 h-2.5" /> Spotify
                    </span>
                  </div>
                </div>

                <button
                  id="btn-spotify-logout"
                  onClick={onLogoutSpotify}
                  title="Desconectar do Spotify"
                  className="min-h-[26px] min-w-[26px] flex items-center justify-center p-1 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                id="btn-spotify-login"
                onClick={onLoginSpotify}
                disabled={isLoggingIn}
                className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] active:bg-[#1aa34a] text-zinc-950 font-bold text-xs shadow-md shadow-[#1db954]/20 transition-all disabled:opacity-50"
                title="Conectar Spotify para importar suas playlists"
              >
                <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  {isLoggingIn ? "..." : "Conectar Spotify"}
                </span>
              </button>
            )}

            {/* Config & Instructions Button */}
            <button
              id="btn-open-config-guide"
              onClick={onOpenConfigModal}
              className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all hover:text-white hover:border-zinc-600 shadow-sm"
              title="Instruções de Configuração e API"
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              <span>Instruções</span>
            </button>
          </div>

          {/* Mobile Right Controls (<md) - Clean & Compact */}
          <div className="flex md:hidden items-center gap-1.5">
            {/* Google Quick Status Badge on Mobile */}
            {googleUser ? (
              <div 
                onClick={() => setIsMobileMenuOpen(true)}
                className="flex items-center gap-1.5 p-1 px-2 rounded-lg bg-zinc-900 border border-emerald-500/40 text-xs cursor-pointer"
              >
                {googleUser.photoURL ? (
                  <img
                    src={googleUser.photoURL}
                    alt={googleUser.displayName || "Google"}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center text-[10px] font-bold">
                    {(googleUser.displayName || googleUser.email || "G").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[11px] font-semibold text-emerald-400 max-w-[65px] truncate">
                  {googleUser.displayName || "Conta"}
                </span>
              </div>
            ) : null}

            {/* Hamburger Menu Toggle Button (Touch target 40x40px) */}
            <button
              id="btn-mobile-menu-toggle"
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-700/80 text-zinc-200 hover:text-white hover:border-emerald-500 transition-colors shadow-sm"
              aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-emerald-400" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation Overlay (z-50) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="fixed top-0 right-0 bottom-0 w-[85%] max-w-xs bg-zinc-950 border-l border-zinc-800 shadow-2xl p-4 flex flex-col justify-between overflow-y-auto z-50">
            <div className="space-y-4">
              {/* Drawer Top Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <PobreMusicLogo size="sm" showText={true} />

                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  aria-label="Fechar menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Google Account Profile Card in Drawer */}
              {googleUser ? (
                <div className="p-3 rounded-xl bg-zinc-900 border border-emerald-500/40 space-y-2">
                  <div className="flex items-center gap-2.5">
                    {googleUser.photoURL ? (
                      <img
                        src={googleUser.photoURL}
                        alt={googleUser.displayName || "User"}
                        className="w-8 h-8 rounded-full object-cover border border-emerald-500"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center text-xs font-black">
                        {(googleUser.displayName || googleUser.email || "G").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        {googleUser.displayName || googleUser.email}
                      </p>
                      <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> Conta Google Conectada
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400">
                    Suas playlists salvas são privadas e salvas nesta conta.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      onLogoutGoogle();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-red-950/40 border border-zinc-700/80 hover:border-red-800/40 text-zinc-300 hover:text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-400" />
                    <span>Sair da Conta Google</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    Conta Individual POBREMUSIC
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Faça login com sua conta Google para salvar suas playlists com total privacidade.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onLoginGoogle();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={isGoogleLoggingIn}
                    className="w-full py-2 px-3 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2s.7 5.5 1.9 7.9l3.7-2.9z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
                      />
                    </svg>
                    <span>{isGoogleLoggingIn ? "Conectando..." : "Entrar com Google"}</span>
                  </button>
                </div>
              )}

              {/* Spotify Profile Card inside Drawer */}
              {spotifyUser ? (
                <div className="p-3 rounded-xl bg-zinc-900 border border-[#1DB954]/30 space-y-2">
                  <div className="flex items-center gap-2.5">
                    {spotifyUser.images && spotifyUser.images[0]?.url ? (
                      <img
                        src={spotifyUser.images[0].url}
                        alt={spotifyUser.display_name}
                        className="w-8 h-8 rounded-full object-cover border border-[#1DB954]"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#1DB954]/20 text-[#1DB954] flex items-center justify-center text-xs font-bold">
                        {spotifyUser.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        {spotifyUser.display_name}
                      </p>
                      <p className="text-[10px] text-[#1DB954] flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Spotify Conectado
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onLogoutSpotify();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-red-950/40 border border-zinc-700/80 hover:border-red-800/40 text-zinc-300 hover:text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-400" />
                    <span>Desconectar Spotify</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <p className="text-xs font-bold text-white">
                    Spotify Account
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Conecte para importar suas playlists criadas no Spotify.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onLoginSpotify();
                      setIsMobileMenuOpen(false);
                    }}
                    disabled={isLoggingIn}
                    className="w-full py-2 px-3 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md"
                  >
                    <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{isLoggingIn ? "Conectando..." : "Conectar com Spotify"}</span>
                  </button>
                </div>
              )}

              {/* Navigation Actions List */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">
                  Ferramentas
                </p>

                {/* Equalizer Modal */}
                {onOpenEqualizerModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenEqualizerModal();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-2.5 text-left transition-all group"
                  >
                    <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-teal-300">
                        Equalizador de Áudio
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Graves, agudos e predefinições
                      </p>
                    </div>
                  </button>
                )}

                {/* Mini Player */}
                {onToggleMiniPlayer && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleMiniPlayer();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-2.5 text-left transition-all group"
                  >
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Minimize2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-emerald-300">
                        Modo Mini Player
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Janela compacta flutuante
                      </p>
                    </div>
                  </button>
                )}

                {/* Central de Downloads & PWA */}
                {onOpenMobileDownload && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenMobileDownload();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-2.5 text-left transition-all group"
                  >
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-blue-300">
                        Instalar App / Download M3U
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Exportar playlist ou instalar PWA
                      </p>
                    </div>
                  </button>
                )}

                {/* Config & Instructions */}
                <button
                  type="button"
                  onClick={() => {
                    onOpenConfigModal();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-2.5 text-left transition-all group"
                >
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white group-hover:text-purple-300">
                      Instruções & APIs (.env)
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Chaves de API e documentação
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Drawer Bottom Info */}
            <div className="pt-3 border-t border-zinc-800 text-center">
              <p className="text-[10px] text-zinc-500 font-medium">
                POBREMUSIC • Áudio contínuo e playlists sem limites
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
