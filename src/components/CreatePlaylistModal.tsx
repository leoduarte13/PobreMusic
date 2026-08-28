import React, { useState } from "react";
import { X, Plus, Trash2, Music2, Search, Sparkles, Disc3, Check, Loader2 } from "lucide-react";
import { Track, SavedPlaylist } from "../types";

interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePlaylist: (playlist: SavedPlaylist) => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  isOpen,
  onClose,
  onCreatePlaylist,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState("");
  
  // Track addition fields
  const [trackName, setTrackName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [albumName, setAlbumName] = useState("");
  
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);

  if (!isOpen) return null;

  const handleAddManualTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackName.trim() || !artistName.trim()) return;

    const newTrack: Track = {
      nome_musica: trackName.trim(),
      nome_artista: artistName.trim(),
      album: albumName.trim() || "Single / Custom",
      capa: cover.trim() || undefined,
    };

    setTracks([...tracks, newTrack]);
    setTrackName("");
    setArtistName("");
    setAlbumName("");
  };

  const handleRemoveTrack = (index: number) => {
    setTracks(tracks.filter((_, i) => i !== index));
  };

  // Search track via backend search
  const handleSearchTrack = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (res.ok && data.videoId) {
        setSearchResults([
          {
            nome_musica: data.titulo || searchQuery,
            nome_artista: data.canal || "Artista",
            videoId: data.videoId,
            album: "YouTube Audio",
          },
        ]);
      }
    } catch (err) {
      console.warn("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSearchResult = (result: Track) => {
    setTracks([...tracks, result]);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleSubmitPlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newPlaylist: SavedPlaylist = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: name.trim(),
      description: description.trim(),
      cover: cover.trim() || (tracks[0]?.capa || ""),
      tracks: tracks.length > 0 ? tracks : [
        {
          nome_musica: "Faixa de Exemplo",
          nome_artista: "SpotTube",
          album: "Custom",
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onCreatePlaylist(newPlaylist);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Criar Nova Playlist</h2>
              <p className="text-xs text-zinc-400">Monte sua playlist personalizada e escute via YouTube Audio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="mt-5 space-y-5">
          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Nome da Playlist *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Treino & Foco 2026"
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Capa da Playlist (URL Opcional)
              </label>
              <input
                type="url"
                value={cover}
                onChange={(e) => setCover(e.target.value)}
                placeholder="https://exemplo.com/capa.jpg"
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Descrição (Opcional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Seleção especial das melhores faixas..."
                className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Add Tracks Section */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Music2 className="w-4 h-4 text-emerald-400" />
              Adicionar Músicas
            </h3>

            {/* Quick Manual Add */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-5">
                <input
                  type="text"
                  value={trackName}
                  onChange={(e) => setTrackName(e.target.value)}
                  placeholder="Nome da Música (Ex: Blinding Lights)"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  placeholder="Artista (Ex: The Weeknd)"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={handleAddManualTrack}
                  disabled={!trackName.trim() || !artistName.trim()}
                  className="w-full h-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-xs font-bold text-white flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>

            {/* Quick YouTube Search */}
            <div className="pt-2 border-t border-zinc-900 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchTrack()}
                  placeholder="Ou pesquise no YouTube (Ex: Billie Eilish Birds of a Feather)"
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <button
                type="button"
                onClick={handleSearchTrack}
                disabled={isSearching || !searchQuery.trim()}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors flex items-center gap-1 shrink-0"
              >
                {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Buscar</span>
              </button>
            </div>

            {/* Search Result item if found */}
            {searchResults.map((res, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{res.nome_musica}</p>
                  <p className="text-[11px] text-zinc-400 truncate">{res.nome_artista}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddSearchResult(res)}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shrink-0"
                >
                  + Adicionar à lista
                </button>
              </div>
            ))}
          </div>

          {/* Current Tracks in playlist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-300">
                Faixas Adicionadas ({tracks.length})
              </span>
              {tracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTracks([])}
                  className="text-[11px] text-red-400 hover:underline"
                >
                  Limpar todas
                </button>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-zinc-800/60 rounded-xl bg-zinc-950 border border-zinc-800">
              {tracks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  Nenhuma música adicionada ainda. Adicione acima ou crie a playlist vazia.
                </div>
              ) : (
                tracks.map((t, idx) => (
                  <div key={idx} className="px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-zinc-900/50">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="font-mono text-zinc-500 text-[11px] w-4">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white truncate">{t.nome_musica}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{t.nome_artista}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTrack(idx)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                      title="Remover faixa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSubmitPlaylist}
              disabled={!name.trim()}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Criar Playlist</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
