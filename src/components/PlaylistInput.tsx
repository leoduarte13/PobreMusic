import React, { useState } from "react";
import { 
  Music2, 
  Sparkles, 
  Loader2, 
  Link2, 
  Lock, 
  Globe2, 
  LogIn, 
  BookmarkCheck, 
  Plus, 
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  Flame,
  UserCheck
} from "lucide-react";
import { PRESET_OPTIONS, PresetPlaylistOption } from "../data/presetPlaylists";
import { SpotifyUser, UserPlaylistSummary, SavedPlaylist, GoogleUserProfile } from "../types";

interface PlaylistInputProps {
  onLoadPlaylist: (urlOrId: string) => Promise<void>;
  isLoading: boolean;
  currentPlaylistId?: string;
  spotifyUser: SpotifyUser | null;
  userPlaylists: UserPlaylistSummary[];
  isLoadingUserPlaylists: boolean;
  onLoginSpotify: () => void;
  onRefreshUserPlaylists: () => void;
  googleUser?: GoogleUserProfile | null;
  onLoginGoogle?: () => void;
  savedPlaylists?: SavedPlaylist[];
  onSelectSavedPlaylist?: (playlist: SavedPlaylist) => void;
  onDeleteSavedPlaylist?: (id: string) => void;
  onOpenCreateModal?: () => void;
}

export const PlaylistInput: React.FC<PlaylistInputProps> = ({
  onLoadPlaylist,
  isLoading,
  currentPlaylistId,
  spotifyUser,
  userPlaylists,
  isLoadingUserPlaylists,
  onLoginSpotify,
  onRefreshUserPlaylists,
  googleUser,
  onLoginGoogle,
  savedPlaylists = [],
  onSelectSavedPlaylist,
  onDeleteSavedPlaylist,
  onOpenCreateModal,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [activeTab, setActiveTab] = useState<"custom" | "user" | "saved" | "presets">(
    spotifyUser && userPlaylists.length > 0 ? "user" : "custom"
  );
  // On mobile, if a playlist is loaded, allow collapsing or keeping compact
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onLoadPlaylist(inputValue.trim());
    }
  };

  const handleSelectPreset = (preset: PresetPlaylistOption) => {
    setInputValue(preset.spotifyUrlOrId);
    onLoadPlaylist(preset.spotifyUrlOrId);
  };

  const handleSelectUserPlaylist = (playlist: UserPlaylistSummary) => {
    setInputValue(playlist.id);
    onLoadPlaylist(playlist.id);
  };

  return (
    <div className="w-full bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3 sm:p-5 backdrop-blur-md shadow-xl transition-all">
      {/* Header & Source Pills */}
      <div className="flex flex-col gap-2.5 pb-2.5 border-b border-zinc-800/70">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Music2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
              Importar / Escolher Playlist
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <span className="text-[11px] hidden sm:inline">{isExpanded ? "Recolher" : "Expandir"}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Tab Pills - Responsive 2x2 on Mobile, 4 in 1 row on Desktop, Zero Horizontal Scrolling */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("custom");
              setIsExpanded(true);
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-center ${
              activeTab === "custom"
                ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80"
            }`}
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Link / ID</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("user");
              setIsExpanded(true);
              onRefreshUserPlaylists();
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-center ${
              activeTab === "user"
                ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80"
            }`}
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Spotify</span>
            {userPlaylists.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === "user" ? "bg-zinc-950 text-emerald-400" : "bg-zinc-900 text-emerald-400"
              }`}>
                {userPlaylists.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("saved");
              setIsExpanded(true);
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-center ${
              activeTab === "saved"
                ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80"
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Minhas Salvas</span>
            {savedPlaylists.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === "saved" ? "bg-zinc-950 text-emerald-400" : "bg-zinc-900 text-emerald-400"
              }`}>
                {savedPlaylists.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("presets");
              setIsExpanded(true);
            }}
            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 text-center ${
              activeTab === "presets"
                ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80"
            }`}
          >
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Destaques</span>
          </button>
        </div>
      </div>

      {/* Expanded Content Area */}
      {isExpanded && (
        <div className="pt-2.5 space-y-2.5">
          {/* Tab 1: Custom Link/ID Input */}
          {activeTab === "custom" && (
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  id="input-spotify-playlist-url"
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Cole o link ou ID da playlist do Spotify..."
                  disabled={isLoading}
                  className="w-full h-11 pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-all"
                />
              </div>
              <button
                id="btn-load-playlist"
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="h-11 px-4 sm:px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 font-bold text-xs text-zinc-950 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Carregar</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Tab 2: User's Own Spotify Playlists */}
          {activeTab === "user" && (
            <div>
              {!spotifyUser ? (
                <div className="p-3 sm:p-4 rounded-xl bg-zinc-950 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="space-y-0.5 text-center sm:text-left">
                    <p className="text-xs font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      Playlists Privadas do Spotify
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Conecte sua conta para acessar suas playlists diretamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onLoginSpotify}
                    className="h-9 px-4 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
                  >
                    <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Conectar</span>
                  </button>
                </div>
              ) : isLoadingUserPlaylists ? (
                <div className="py-4 text-center text-zinc-400 space-y-1.5">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-emerald-400" />
                  <p className="text-xs">Sincronizando playlists do Spotify...</p>
                </div>
              ) : userPlaylists.length === 0 ? (
                <div className="py-3 text-center text-zinc-400 space-y-1">
                  <p className="text-xs">Nenhuma playlist encontrada.</p>
                  <button
                    type="button"
                    onClick={onRefreshUserPlaylists}
                    className="text-xs text-emerald-400 underline font-semibold"
                  >
                    Atualizar lista
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {userPlaylists.map((pl) => {
                    const isSelected = currentPlaylistId === pl.id;
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => handleSelectUserPlaylist(pl)}
                        disabled={isLoading}
                        className={`h-12 flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all ${
                          isSelected
                            ? "bg-emerald-950/40 border-emerald-500 text-white"
                            : "bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700 text-zinc-300"
                        }`}
                      >
                        {pl.cover ? (
                          <img
                            src={pl.cover}
                            alt={pl.name}
                            className="w-8 h-8 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                            <Music2 className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate leading-tight">{pl.name}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            {pl.isPrivate ? (
                              <span className="text-amber-400">Privada</span>
                            ) : (
                              <span>Pública</span>
                            )}
                            <span>• {pl.trackCount} faixas</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Saved Playlists (Individual / Google Account Isolated) */}
          {activeTab === "saved" && (
            <div className="space-y-2.5">
              {googleUser ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {googleUser.photoURL ? (
                      <img
                        src={googleUser.photoURL}
                        alt="Google"
                        className="w-5 h-5 rounded-full object-cover border border-emerald-400/50 shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center text-[10px] font-black shrink-0">
                        {(googleUser.displayName || "G").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-white text-[11px] truncate">
                        Sua Conta: <span className="text-emerald-400">{googleUser.displayName || googleUser.email}</span>
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Playlists 100% individuais e salvas com segurança na nuvem.
                      </p>
                    </div>
                  </div>

                  {onOpenCreateModal && (
                    <button
                      type="button"
                      onClick={onOpenCreateModal}
                      className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white flex items-center gap-1 shadow-sm shrink-0 ml-2"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Criar Playlist</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 text-center sm:text-left">
                    <p className="font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Playlists Individuais e Privadas
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Entre com o Google para que suas playlists fiquem salvas só na sua conta.
                    </p>
                  </div>

                  {onLoginGoogle && (
                    <button
                      type="button"
                      onClick={onLoginGoogle}
                      className="h-9 px-3.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
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
                      <span>Entrar com Google</span>
                    </button>
                  )}
                </div>
              )}

              {/* List of playlists */}
              {savedPlaylists.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center space-y-1">
                  <p className="text-xs text-zinc-400">
                    {googleUser 
                      ? "Nenhuma playlist salva nesta conta ainda." 
                      : "Nenhuma playlist salva ainda."}
                  </p>
                  {onOpenCreateModal && (
                    <button
                      type="button"
                      onClick={onOpenCreateModal}
                      className="text-xs text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Criar playlist personalizada</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {savedPlaylists.map((pl) => {
                    const isSelected = currentPlaylistId === pl.id;
                    return (
                      <div
                        key={pl.id}
                        className={`h-12 flex items-center justify-between p-2 rounded-xl border transition-all ${
                          isSelected
                            ? "bg-emerald-950/40 border-emerald-500 text-white"
                            : "bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700 text-zinc-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectSavedPlaylist?.(pl)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                        >
                          {pl.cover ? (
                            <img
                              src={pl.cover}
                              alt={pl.name}
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                              <Music2 className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate leading-tight">{pl.name}</p>
                            <p className="text-[10px] text-zinc-400">{pl.tracks.length} faixas</p>
                          </div>
                        </button>

                        {onDeleteSavedPlaylist && (
                          <button
                            type="button"
                            onClick={() => onDeleteSavedPlaylist(pl.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-800 transition-colors ml-1 shrink-0"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Presets */}
          {activeTab === "presets" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESET_OPTIONS.map((preset) => {
                const isSelected = currentPlaylistId === preset.spotifyUrlOrId || currentPlaylistId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    disabled={isLoading}
                    className={`h-12 flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all ${
                      isSelected
                        ? "bg-emerald-950/40 border-emerald-500/60 text-white"
                        : "bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700 text-zinc-300"
                    }`}
                  >
                    <img
                      src={preset.cover}
                      alt={preset.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate leading-tight">{preset.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{preset.genre}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

