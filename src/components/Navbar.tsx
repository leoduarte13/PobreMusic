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
  Disc3
} from "lucide-react";
import { ConfigStatus, SpotifyUser } from "../types";
import { PobreMusicLogo } from "./PobreMusicLogo";

interface NavbarProps {
  configStatus: ConfigStatus | null;
  spotifyUser: SpotifyUser | null;
  isLoggingIn: boolean;
  onLoginSpotify: () => void;
  onLogoutSpotify: () => void;
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
                className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-semibold text-zinc-200 transition-all hover:text-white hover:border-emerald-500/50 shadow-sm"
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
                className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all hover:text-white shadow-sm"
                title="Abrir Equalizador"
              >
                <Sliders className="w-3.5 h-3.5 text-teal-400" />
                <span>Equalizador</span>
              </button>
            )}

            {/* User Auth Section */}
            {spotifyUser ? (
              <div className="flex items-center gap-2 p-1.5 pl-3 pr-2 rounded-xl bg-zinc-900 border border-zinc-800">
                <div className="flex items-center gap-2">
                  {spotifyUser.images && spotifyUser.images[0]?.url ? (
                    <img
                      src={spotifyUser.images[0].url}
                      alt={spotifyUser.display_name}
                      className="w-6 h-6 rounded-full object-cover border border-emerald-500/50"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                      {spotifyUser.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white leading-tight truncate max-w-[120px]">
                      {spotifyUser.display_name}
                    </p>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                      <ShieldCheck className="w-3 h-3" /> Privadas
                    </span>
                  </div>
                </div>

                <button
                  id="btn-spotify-logout"
                  onClick={onLogoutSpotify}
                  title="Desconectar do Spotify"
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center p-1 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                id="btn-spotify-login"
                onClick={onLoginSpotify}
                disabled={isLoggingIn}
                className="min-h-[40px] flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] active:bg-[#1aa34a] text-zinc-950 font-bold text-xs shadow-md shadow-[#1db954]/20 transition-all disabled:opacity-50"
              >
                <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  {isLoggingIn ? "Conectando..." : "Conectar Spotify"}
                </span>
              </button>
            )}

            {/* Config & Instructions Button */}
            <button
              id="btn-open-config-guide"
              onClick={onOpenConfigModal}
              className="min-h-[40px] flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all hover:text-white hover:border-zinc-600 shadow-sm"
              title="Instruções de Configuração e API"
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              <span>Instruções & .env</span>
            </button>
          </div>

          {/* Mobile Right Controls (<md) - Clean & Compact */}
          <div className="flex md:hidden items-center gap-1.5">
            {/* Spotify Quick Status Badge / Icon on Mobile */}
            {spotifyUser ? (
              <div 
                onClick={() => setIsMobileMenuOpen(true)}
                className="flex items-center gap-1.5 p-1 px-2 rounded-lg bg-zinc-900 border border-emerald-500/40 text-xs cursor-pointer"
              >
                {spotifyUser.images && spotifyUser.images[0]?.url ? (
                  <img
                    src={spotifyUser.images[0].url}
                    alt={spotifyUser.display_name}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                    {spotifyUser.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[11px] font-semibold text-emerald-400 max-w-[65px] truncate">
                  {spotifyUser.display_name}
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

              {/* User Profile Card inside Drawer */}
              {spotifyUser ? (
                <div className="p-3 rounded-xl bg-zinc-900 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2.5">
                    {spotifyUser.images && spotifyUser.images[0]?.url ? (
                      <img
                        src={spotifyUser.images[0].url}
                        alt={spotifyUser.display_name}
                        className="w-8 h-8 rounded-full object-cover border border-emerald-500/50"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                        {spotifyUser.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        {spotifyUser.display_name}
                      </p>
                      <p className="text-[10px] text-emerald-400 flex items-center gap-1">
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
                    <span>Desconectar Conta</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-zinc-900 border border-emerald-800/40 space-y-2">
                  <p className="text-xs font-bold text-white">
                    Spotify Account
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Conecte para acessar suas playlists privadas.
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
