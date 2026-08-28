import React, { useState } from "react";
import { X, BookmarkPlus, Download, FileText, Check, Music2, Sparkles, Disc3 } from "lucide-react";
import { Track, SavedPlaylist } from "../types";

interface SavePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTracks: Track[];
  initialName?: string;
  initialDescription?: string;
  initialCover?: string;
  onSavePlaylist: (playlist: SavedPlaylist) => void;
}

export const SavePlaylistModal: React.FC<SavePlaylistModalProps> = ({
  isOpen,
  onClose,
  currentTracks,
  initialName,
  initialDescription,
  initialCover,
  onSavePlaylist,
}) => {
  const [name, setName] = useState(initialName || "Minha Playlist Personalizada");
  const [description, setDescription] = useState(initialDescription || "");
  const [cover, setCover] = useState(initialCover || "");
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newSavedPlaylist: SavedPlaylist = {
      id: `saved-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: name.trim(),
      description: description.trim(),
      cover: cover.trim() || currentTracks[0]?.capa || "",
      tracks: [...currentTracks],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onSavePlaylist(newSavedPlaylist);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  // Export as .JSON file
  const handleExportJSON = () => {
    const data = {
      playlist_name: name,
      description,
      total_tracks: currentTracks.length,
      exported_at: new Date().toISOString(),
      tracks: currentTracks.map((t) => ({
        musica: t.nome_musica,
        artista: t.nome_artista,
        album: t.album || "",
        duracao_ms: t.duracao_ms || 0,
        youtube_id: t.videoId || "",
        capa: t.capa || "",
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_playlist.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as .M3U file (Media player compatible)
  const handleExportM3U = () => {
    let m3uContent = "#EXTM3U\n";
    m3uContent += `#PLAYLIST:${name}\n\n`;

    currentTracks.forEach((t) => {
      const durSec = t.duracao_ms ? Math.floor(t.duracao_ms / 1000) : -1;
      m3uContent += `#EXTINF:${durSec},${t.nome_artista} - ${t.nome_musica}\n`;
      if (t.videoId) {
        m3uContent += `https://www.youtube.com/watch?v=${t.videoId}\n\n`;
      } else {
        m3uContent += `spotify:track:${t.spotify_id || ""}\n\n`;
      }
    });

    const blob = new Blob([m3uContent], { type: "audio/x-mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <BookmarkPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Salvar Playlist na Biblioteca</h2>
              <p className="text-xs text-zinc-400">Salve para acesso rápido offline ou exporte os arquivos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Nome da Playlist *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Minhas Favoritas 2026"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Descrição (Opcional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Melhores músicas para trabalhar e relaxar..."
              className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              URL da Imagem de Capa (Opcional)
            </label>
            <input
              type="url"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="https://exemplo.com/capa.jpg"
              className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Playlist preview info */}
          <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Music2 className="w-4 h-4 text-emerald-400" />
              <span>{currentTracks.length} faixas selecionadas</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-500">Salvo no Navegador</span>
          </div>

          {/* Export Buttons */}
          <div className="pt-2 border-t border-zinc-800/80 space-y-2">
            <label className="block text-xs font-semibold text-zinc-400">
              Ou exporte os arquivos para o seu dispositivo:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportM3U}
                className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Baixar .M3U</span>
              </button>

              <button
                type="button"
                onClick={handleExportJSON}
                className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>Baixar .JSON</span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={savedSuccess || currentTracks.length === 0}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Salvo com Sucesso!</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-4 h-4" />
                  <span>Salvar na Biblioteca</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
