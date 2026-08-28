import React, { useState, useEffect } from "react";
import { 
  X, 
  Search, 
  Plus, 
  Music, 
  Check, 
  Loader2, 
  Sparkles, 
  Link, 
  Youtube, 
  Cloud,
  Layers
} from "lucide-react";
import { Track, TrackSearchResult } from "../types";

interface AddTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (track: Track) => void;
  onAddMultipleTracks?: (tracks: Track[]) => void;
  currentPlaylistName?: string;
}

export const AddTrackModal: React.FC<AddTrackModalProps> = ({
  isOpen,
  onClose,
  onAddTrack,
  onAddMultipleTracks,
  currentPlaylistName,
}) => {
  const [activeTab, setActiveTab] = useState<"search" | "custom">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TrackSearchResult[]>([]);
  const [addedTrackIds, setAddedTrackIds] = useState<Set<string>>(new Set());

  // Custom Track Form State
  const [customTitle, setCustomTitle] = useState("");
  const [customArtist, setCustomArtist] = useState("");
  const [customAlbum, setCustomAlbum] = useState("");
  const [customCover, setCustomCover] = useState("");
  const [customYoutubeUrl, setCustomYoutubeUrl] = useState("");
  const [isCustomSubmitting, setIsCustomSubmitting] = useState(false);

  // Selected tracks for batch add
  const [selectedResults, setSelectedResults] = useState<TrackSearchResult[]>([]);

  // Search API Call
  useEffect(() => {
    if (!searchQuery.trim() || activeTab !== "search") {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search-tracks?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.tracks || []);
        }
      } catch (err) {
        console.warn("Search tracks error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  if (!isOpen) return null;

  const handleAddSingle = (item: TrackSearchResult) => {
    const key = `${item.nome_musica}-${item.nome_artista}`;
    const newTrack: Track = {
      nome_musica: item.nome_musica,
      nome_artista: item.nome_artista,
      duracao_ms: item.duracao_ms || 200000,
      album: item.album || "Single",
      capa: item.capa || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80",
      spotify_id: item.spotify_id,
      videoId: item.videoId,
    };

    onAddTrack(newTrack);
    setAddedTrackIds((prev) => new Set(prev).add(key));
  };

  const handleToggleSelect = (item: TrackSearchResult) => {
    const isSelected = selectedResults.some(
      (r) => r.nome_musica === item.nome_musica && r.nome_artista === item.nome_artista
    );
    if (isSelected) {
      setSelectedResults((prev) =>
        prev.filter((r) => !(r.nome_musica === item.nome_musica && r.nome_artista === item.nome_artista))
      );
    } else {
      setSelectedResults((prev) => [...prev, item]);
    }
  };

  const handleAddAllSelected = () => {
    if (selectedResults.length === 0) return;
    const tracksToAdd: Track[] = selectedResults.map((item) => ({
      nome_musica: item.nome_musica,
      nome_artista: item.nome_artista,
      duracao_ms: item.duracao_ms || 200000,
      album: item.album || "Single",
      capa: item.capa || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80",
      spotify_id: item.spotify_id,
      videoId: item.videoId,
    }));

    if (onAddMultipleTracks) {
      onAddMultipleTracks(tracksToAdd);
    } else {
      tracksToAdd.forEach((t) => onAddTrack(t));
    }

    selectedResults.forEach((item) => {
      setAddedTrackIds((prev) => new Set(prev).add(`${item.nome_musica}-${item.nome_artista}`));
    });
    setSelectedResults([]);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customArtist.trim()) return;

    setIsCustomSubmitting(true);
    let videoId: string | undefined = undefined;
    if (customYoutubeUrl) {
      const match = customYoutubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (match) videoId = match[1];
    }

    const newTrack: Track = {
      nome_musica: customTitle.trim(),
      nome_artista: customArtist.trim(),
      album: customAlbum.trim() || "Single",
      capa: customCover.trim() || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80",
      duracao_ms: 210000,
      videoId: videoId,
    };

    onAddTrack(newTrack);
    setIsCustomSubmitting(false);
    setCustomTitle("");
    setCustomArtist("");
    setCustomAlbum("");
    setCustomCover("");
    setCustomYoutubeUrl("");
    onClose();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "--:--";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">Adicionar Músicas</h2>
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Cloud className="w-3 h-3" /> Nuvem
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Adicionando à: <span className="text-zinc-200 font-semibold">{currentPlaylistName || "Playlist Atual"}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/30 px-4 pt-3 gap-2">
          <button
            onClick={() => setActiveTab("search")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === "search"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Buscar no Spotify / YouTube</span>
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === "custom"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Criar Faixa Manualmente</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === "search" ? (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: 'Bohemian Rhapsody Queen' ou 'Coldplay Yellow'..."
                  autoFocus
                  className="w-full h-11 pl-10 pr-10 bg-zinc-950 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                  </div>
                )}
              </div>

              {/* Batch Action Bar if items are selected */}
              {selectedResults.length > 0 && (
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-600/40 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Layers className="w-4 h-4" />
                    <span>{selectedResults.length} músicas selecionadas</span>
                  </div>
                  <button
                    onClick={handleAddAllSelected}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Adicionar Todas ({selectedResults.length})</span>
                  </button>
                </div>
              )}

              {/* Results List */}
              <div className="space-y-2">
                {searchResults.length === 0 && !isSearching && searchQuery.trim() && (
                  <div className="text-center py-8 text-zinc-500">
                    <Music className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">Nenhuma música encontrada para "{searchQuery}".</p>
                    <p className="text-[11px] text-zinc-600 mt-1">Tente buscar pelo nome do artista ou música com palavras-chave.</p>
                  </div>
                )}

                {!searchQuery.trim() && (
                  <div className="text-center py-8 text-zinc-500">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-400" />
                    <p className="text-xs font-medium text-zinc-400">Digite o nome de uma música ou artista acima.</p>
                    <p className="text-[11px] text-zinc-600 mt-1">Você pode selecionar e adicionar várias faixas de uma vez.</p>
                  </div>
                )}

                {searchResults.map((item, idx) => {
                  const key = `${item.nome_musica}-${item.nome_artista}`;
                  const isAdded = addedTrackIds.has(key);
                  const isSelected = selectedResults.some(
                    (r) => r.nome_musica === item.nome_musica && r.nome_artista === item.nome_artista
                  );

                  return (
                    <div
                      key={`${item.nome_musica}-${idx}`}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isSelected 
                          ? "bg-emerald-950/30 border-emerald-500/50" 
                          : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                      }`}
                    >
                      {/* Checkbox for Multi Select */}
                      <button
                        type="button"
                        onClick={() => handleToggleSelect(item)}
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                          isSelected
                            ? "bg-emerald-500 border-emerald-500 text-zinc-950 font-bold"
                            : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                        }`}
                        title={isSelected ? "Desmarcar" : "Selecionar"}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>

                      {/* Cover & Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.capa ? (
                          <img
                            src={item.capa}
                            alt={item.nome_musica}
                            className="w-10 h-10 rounded-lg object-cover shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                            <Music className="w-4 h-4" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-white truncate">
                            {item.nome_musica}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {item.nome_artista} • {item.album || "Single"}
                          </p>
                        </div>
                      </div>

                      {/* Duration & Add Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
                          {formatDuration(item.duracao_ms)}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleAddSingle(item)}
                          disabled={isAdded}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                            isAdded
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default"
                              : "bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white border border-zinc-700 hover:border-emerald-500 shadow-sm"
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Adicionada</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Adicionar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Custom Track Form */
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Nome da Música *
                  </label>
                  <input
                    type="text"
                    required
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Ex: Starboy"
                    className="w-full h-10 px-3 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Artista *
                  </label>
                  <input
                    type="text"
                    required
                    value={customArtist}
                    onChange={(e) => setCustomArtist(e.target.value)}
                    placeholder="Ex: The Weeknd, Daft Punk"
                    className="w-full h-10 px-3 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Álbum (Opcional)
                  </label>
                  <input
                    type="text"
                    value={customAlbum}
                    onChange={(e) => setCustomAlbum(e.target.value)}
                    placeholder="Ex: Starboy (Deluxe)"
                    className="w-full h-10 px-3 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Link da Capa (Opcional)
                  </label>
                  <input
                    type="url"
                    value={customCover}
                    onChange={(e) => setCustomCover(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-10 px-3 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Link ou ID do Vídeo do YouTube (Opcional)
                </label>
                <div className="relative">
                  <Youtube className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-red-500" />
                  <input
                    type="text"
                    value={customYoutubeUrl}
                    onChange={(e) => setCustomYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... ou ID (opcional - busca automática)"
                    className="w-full h-10 pl-9 pr-3 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Se deixar em branco, o SpotTube encontrará automaticamente a melhor versão em áudio no YouTube.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCustomSubmitting || !customTitle.trim() || !customArtist.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Adicionar à Playlist</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/70 flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" /> Todas as adições são sincronizadas na nuvem Firestore
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
