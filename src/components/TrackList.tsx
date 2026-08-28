import React, { useState } from "react";
import { 
  Play, 
  Pause, 
  Music, 
  Loader2, 
  Clock, 
  Search, 
  Disc3, 
  Trash2, 
  BookmarkPlus, 
  Plus, 
  Sliders, 
  Download,
  Shuffle,
  Cloud,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  CheckCircle2,
  ArrowDownToLine
} from "lucide-react";
import { Track } from "../types";
import { Visualizer } from "./Visualizer";

interface TrackListProps {
  tracks: Track[];
  currentTrackIndex: number | null;
  isPlaying: boolean;
  onPlayTrack: (index: number) => void;
  onTogglePlayPause: () => void;
  onRemoveTrack: (index: number) => void;
  onRemoveMultipleTracks?: (indexes: number[]) => void;
  onOpenSaveModal?: () => void;
  onOpenCreateModal?: () => void;
  onOpenAddModal?: () => void;
  onOpenAddTrackModal?: () => void;
  onOpenEqualizerModal?: () => void;
  onOpenMobileDownload?: () => void;
  onToggleShuffle?: () => void;
  onPlayShuffle?: () => void;
  onOpenNowPlaying?: () => void;
  shuffle?: boolean;
  playlistName?: string;
  playlistCover?: string;
  playlistDescription?: string;
  playlistNotice?: string;
  isPrivate?: boolean;
  autenticado?: boolean;
  isCloudSynced?: boolean;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  currentTrackIndex,
  isPlaying,
  onPlayTrack,
  onTogglePlayPause,
  onRemoveTrack,
  onRemoveMultipleTracks,
  onOpenSaveModal,
  onOpenCreateModal,
  onOpenAddModal,
  onOpenAddTrackModal,
  onOpenEqualizerModal,
  onOpenMobileDownload,
  onToggleShuffle,
  onPlayShuffle,
  onOpenNowPlaying,
  shuffle,
  playlistName,
  playlistCover,
  playlistDescription,
  playlistNotice,
  isPrivate,
  autenticado,
  isCloudSynced = true,
}) => {
  const [filterText, setFilterText] = useState("");
  const [removedNotification, setRemovedNotification] = useState<string | null>(null);
  const [downloadingTrackId, setDownloadingTrackId] = useState<number | null>(null);
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<Set<number>>(new Set());
  const [selectedTrackIndexes, setSelectedTrackIndexes] = useState<Set<number>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  const handleOpenAdd = onOpenAddModal || onOpenAddTrackModal;

  const handleDownloadSingleTrack = (e: React.MouseEvent, index: number, track: Track) => {
    e.stopPropagation();
    setDownloadingTrackId(index);

    try {
      let m3uContent = "#EXTM3U\n";
      const durSec = track.duracao_ms ? Math.floor(track.duracao_ms / 1000) : -1;
      m3uContent += `#EXTINF:${durSec},${track.nome_artista} - ${track.nome_musica}\n`;
      if (track.videoId) {
        m3uContent += `https://www.youtube.com/watch?v=${track.videoId}\n`;
      } else {
        m3uContent += `https://open.spotify.com/track/${track.spotify_id || ""}\n`;
      }

      const blob = new Blob([m3uContent], { type: "audio/x-mpegurl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cleanName = `${track.nome_artista}_${track.nome_musica}`.toLowerCase().replace(/[^a-z0-9]/g, "_");
      a.download = `${cleanName}.m3u`;
      a.click();
      URL.revokeObjectURL(url);

      setTimeout(() => {
        setDownloadingTrackId(null);
        setDownloadedTrackIds((prev) => new Set(prev).add(index));
        setRemovedNotification(`Download de "${track.nome_musica}" iniciado!`);
        setTimeout(() => {
          setRemovedNotification(null);
          setDownloadedTrackIds((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        }, 3000);
      }, 400);
    } catch {
      setDownloadingTrackId(null);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "--:--";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const handleRemove = (e: React.MouseEvent, index: number, trackName: string) => {
    e.stopPropagation();
    onRemoveTrack(index);
    setRemovedNotification(`"${trackName}" removida da playlist`);
    setTimeout(() => setRemovedNotification(null), 2000);
  };

  const handleToggleSelectTrack = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setSelectedTrackIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTrackIndexes.size === tracks.length) {
      setSelectedTrackIndexes(new Set());
    } else {
      setSelectedTrackIndexes(new Set(tracks.map((_, i) => i)));
    }
  };

  const handleBulkRemove = () => {
    if (selectedTrackIndexes.size === 0) return;
    const sortedIndexes = Array.from(selectedTrackIndexes).sort((a: number, b: number) => b - a);
    if (onRemoveMultipleTracks) {
      onRemoveMultipleTracks(sortedIndexes);
    } else {
      sortedIndexes.forEach((idx) => onRemoveTrack(idx));
    }
    setRemovedNotification(`${selectedTrackIndexes.size} faixas removidas da playlist`);
    setTimeout(() => setRemovedNotification(null), 2500);
    setSelectedTrackIndexes(new Set());
    setIsSelectMode(false);
  };

  const filteredTracks = tracks.map((track, originalIndex) => ({ track, originalIndex }))
    .filter(({ track }) => {
      const q = filterText.toLowerCase();
      return (
        track.nome_musica.toLowerCase().includes(q) ||
        track.nome_artista.toLowerCase().includes(q) ||
        (track.album && track.album.toLowerCase().includes(q))
      );
    });

  return (
    <div className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
      {/* Playlist Header Banner */}
      <div className="p-3.5 sm:p-5 bg-gradient-to-b from-zinc-800/50 to-transparent border-b border-zinc-800/70">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1 w-full sm:w-auto">
            {playlistCover ? (
              <img
                src={playlistCover}
                alt={playlistName || "Capa da Playlist"}
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl object-cover shadow-lg ring-1 ring-white/10 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 shrink-0 shadow-md">
                <Disc3 className="w-7 h-7 text-emerald-400" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  SpotTube
                </span>
                {isCloudSynced && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    <Cloud className="w-3 h-3" /> Nuvem Firestore
                  </span>
                )}
                {isPrivate && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    Privada
                  </span>
                )}
                {autenticado && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    OAuth Spotify
                  </span>
                )}
              </div>
              <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate">
                {playlistName || "Playlist Selecionada"}
              </h1>

              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                <span className="font-semibold text-zinc-300">{tracks.length} faixas</span>
                <span>•</span>
                <span className="text-emerald-400 font-mono text-[10px] sm:text-xs">
                  YouTube Audio Stream
                </span>
              </div>
            </div>
          </div>

          {/* Quick Playlist Actions - Fully visible without horizontal scrolling */}
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
            
            {/* Add Track Button */}
            {handleOpenAdd && (
              <button
                id="btn-add-track-header"
                type="button"
                onClick={handleOpenAdd}
                className="h-8 sm:h-9 px-2.5 sm:px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1 shadow-md transition-all whitespace-nowrap"
                title="Adicionar músicas a esta playlist"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Adicionar Música</span>
              </button>
            )}

            {/* Shuffle Play Quick Button */}
            {onPlayShuffle && (
              <button
                id="btn-shuffle-play"
                type="button"
                onClick={onPlayShuffle}
                className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border shadow-sm transition-all whitespace-nowrap ${
                  shuffle 
                    ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold" 
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700"
                }`}
                title="Tocar em Ordem Aleatória"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Aleatório</span>
              </button>
            )}

            {/* Select Mode Toggle */}
            <button
              id="btn-toggle-select-mode"
              type="button"
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                if (isSelectMode) setSelectedTrackIndexes(new Set());
              }}
              className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border transition-all whitespace-nowrap ${
                isSelectMode 
                  ? "bg-indigo-600 text-white border-indigo-500 font-bold" 
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
              }`}
              title="Selecionar músicas para ações em massa"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isSelectMode ? "Cancelar Seleção" : "Selecionar"}</span>
            </button>

            {onOpenSaveModal && (
              <button
                id="btn-save-current-playlist"
                type="button"
                onClick={onOpenSaveModal}
                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1 border border-zinc-700 shadow-sm transition-all whitespace-nowrap"
                title="Salvar esta playlist na nuvem"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Salvar Nuvem</span>
              </button>
            )}

            {onOpenEqualizerModal && (
              <button
                id="btn-open-equalizer-header"
                type="button"
                onClick={onOpenEqualizerModal}
                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-center gap-1 border border-zinc-700 shadow-sm transition-all whitespace-nowrap"
                title="Equalizador"
              >
                <Sliders className="w-3.5 h-3.5 text-teal-400" />
                <span>EQ</span>
              </button>
            )}
          </div>
        </div>

        {/* Multi-Selection Action Bar */}
        {isSelectMode && (
          <div className="mt-3 p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-700/60 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1 rounded bg-indigo-900/80 hover:bg-indigo-800 text-xs font-semibold text-indigo-200 border border-indigo-700 flex items-center gap-1"
              >
                {selectedTrackIndexes.size === tracks.length ? "Desmarcar Todas" : "Selecionar Todas"}
              </button>
              <span className="text-xs font-bold text-indigo-200">
                {selectedTrackIndexes.size} de {tracks.length} selecionadas
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {selectedTrackIndexes.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleBulkRemove}
                    className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover ({selectedTrackIndexes.size})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {playlistNotice && (
          <div className="mt-2.5 p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-[11px] text-emerald-300">
            {playlistNotice}
          </div>
        )}

        {removedNotification && (
          <div className="mt-2.5 p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>{removedNotification}</span>
          </div>
        )}
      </div>

      {/* Filter / Search within Playlist */}
      <div className="px-3 sm:px-4 py-2 border-b border-zinc-800/60 bg-zinc-950/40 flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar músicas nesta playlist..."
            className="w-full h-9 pl-8 pr-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>
        <span className="text-[10px] text-zinc-500 shrink-0">
          {filteredTracks.length} de {tracks.length}
        </span>
      </div>

      {/* Table Headers (Desktop) */}
      <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/40">
        <div className="col-span-1 text-center">
          {isSelectMode ? "SEL" : "#"}
        </div>
        <div className="col-span-6">Título & Artista</div>
        <div className="col-span-3">Álbum</div>
        <div className="col-span-2 text-right flex items-center justify-end gap-2">
          <Clock className="w-3 h-3" />
          <span>Duração</span>
        </div>
      </div>

      {/* Tracks List */}
      <div className="divide-y divide-zinc-800/30">
        {filteredTracks.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 space-y-3">
            <Music className="w-8 h-8 mx-auto opacity-50 text-emerald-400" />
            <p className="text-xs font-medium">Nenhuma faixa encontrada na playlist.</p>
            {onOpenAddModal && (
              <button
                type="button"
                onClick={onOpenAddModal}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-md transition-all"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Buscar & Adicionar Músicas</span>
              </button>
            )}
          </div>
        ) : (
          filteredTracks.map(({ track, originalIndex }) => {
            const isCurrent = currentTrackIndex === originalIndex;
            const isThisPlaying = isCurrent && isPlaying;
            const isSelected = selectedTrackIndexes.has(originalIndex);

            return (
              <div
                key={`${track.nome_musica}-${track.nome_artista}-${originalIndex}`}
                onClick={() => {
                  if (isSelectMode) {
                    setSelectedTrackIndexes((prev) => {
                      const next = new Set(prev);
                      if (next.has(originalIndex)) next.delete(originalIndex);
                      else next.add(originalIndex);
                      return next;
                    });
                  } else if (isCurrent) {
                    if (onOpenNowPlaying) {
                      onOpenNowPlaying();
                    } else {
                      onTogglePlayPause();
                    }
                  } else {
                    onPlayTrack(originalIndex);
                  }
                }}
                className={`group min-h-[48px] sm:min-h-[52px] px-3 sm:px-5 py-2 transition-all cursor-pointer flex items-center justify-between sm:grid sm:grid-cols-12 gap-2 sm:gap-4 active:bg-zinc-800/60 ${
                  isSelected
                    ? "bg-indigo-950/40 border-l-4 border-indigo-500"
                    : isCurrent
                    ? "bg-emerald-950/30 text-white"
                    : "hover:bg-zinc-800/40 text-zinc-300"
                }`}
              >
                {/* Index / Select Checkbox / Play Status */}
                <div className="hidden sm:flex sm:col-span-1 items-center justify-center">
                  {isSelectMode ? (
                    <button
                      type="button"
                      onClick={(e) => handleToggleSelectTrack(e, originalIndex)}
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                        isSelected 
                          ? "bg-indigo-500 border-indigo-500 text-white" 
                          : "border-zinc-700 bg-zinc-900"
                      }`}
                    >
                      {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : null}
                    </button>
                  ) : isThisPlaying ? (
                    <div className="flex items-center justify-center w-5 h-5">
                      <Visualizer isPlaying={true} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-5 h-5">
                      <span className={`text-xs font-mono text-zinc-500 group-hover:hidden ${isCurrent ? "text-emerald-400 font-bold" : ""}`}>
                        {originalIndex + 1}
                      </span>
                      <button
                        className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-zinc-950 shadow-sm"
                        title="Tocar Música"
                        aria-label="Tocar Música"
                      >
                        <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Track Info (Title, Artist & Cover) */}
                <div className="sm:col-span-6 flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  {isSelectMode && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleSelectTrack(e, originalIndex)}
                      className={`sm:hidden w-5 h-5 rounded flex items-center justify-center border shrink-0 transition-all ${
                        isSelected 
                          ? "bg-indigo-500 border-indigo-500 text-white" 
                          : "border-zinc-700 bg-zinc-900"
                      }`}
                    >
                      {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : null}
                    </button>
                  )}

                  <div className="relative shrink-0">
                    {track.capa ? (
                      <img
                        src={track.capa}
                        alt={track.nome_musica}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover shadow-sm"
                      />
                    ) : (
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500">
                        <Music className="w-4 h-4" />
                      </div>
                    )}
                    {isThisPlaying && (
                      <div className="sm:hidden absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                        <Visualizer isPlaying={true} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={`text-xs sm:text-sm font-semibold truncate leading-tight ${isCurrent ? "text-emerald-400" : "text-white group-hover:text-emerald-300"}`}>
                      {track.nome_musica}
                    </p>
                    <p className="text-[10px] sm:text-xs text-zinc-400 truncate mt-0.5">
                      {track.nome_artista}
                    </p>
                  </div>
                </div>

                {/* Album (Desktop) */}
                <div className="hidden sm:block sm:col-span-3 min-w-0">
                  <p className="text-xs text-zinc-400 truncate">
                    {track.album || "Single"}
                  </p>
                </div>

                {/* Duration & Actions */}
                <div className="sm:col-span-2 flex items-center justify-end gap-1.5 shrink-0">
                  {track.isLoadingVideo ? (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    </span>
                  ) : null}

                  <span className="text-[11px] font-mono text-zinc-400">
                    {formatDuration(track.duracao_ms)}
                  </span>

                  {/* Download single track button with dynamic icon change */}
                  <button
                    id={`btn-download-track-${originalIndex}`}
                    type="button"
                    onClick={(e) => handleDownloadSingleTrack(e, originalIndex, track)}
                    className={`p-1.5 rounded-lg transition-all ${
                      downloadedTrackIds.has(originalIndex)
                        ? "text-emerald-400 bg-emerald-950/60 ring-1 ring-emerald-500/50"
                        : downloadingTrackId === originalIndex
                        ? "text-emerald-400 bg-zinc-800"
                        : "text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800"
                    }`}
                    title={
                      downloadedTrackIds.has(originalIndex)
                        ? "Download concluído!"
                        : downloadingTrackId === originalIndex
                        ? "Baixando faixa..."
                        : "Baixar esta música"
                    }
                    aria-label="Baixar esta música"
                  >
                    {downloadingTrackId === originalIndex ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : downloadedTrackIds.has(originalIndex) ? (
                      <CheckCircle2 className="w-3.5 h-3.5 animate-bounce text-emerald-400" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Delete track button */}
                  <button
                    id={`btn-remove-track-${originalIndex}`}
                    type="button"
                    onClick={(e) => handleRemove(e, originalIndex, track.nome_musica)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    title="Remover música"
                    aria-label="Remover música"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

