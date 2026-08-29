import React, { useState, useEffect } from 'react';
import { 
  WifiOff, 
  HardDrive, 
  Trash2, 
  X, 
  Play, 
  Music, 
  CheckCircle2, 
  Layers, 
  RefreshCw, 
  ShieldCheck, 
  Clock,
  Sparkles,
  Info
} from 'lucide-react';
import { PlaylistData, Track } from '../types';
import { 
  getAllCachedPlaylists, 
  getLastPlayedPlaylist, 
  getOfflineCacheStats, 
  clearAllOfflineCache,
  OfflineCacheStats 
} from '../utils/offlineStorage';

interface OfflineStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlaylist: (playlist: PlaylistData) => void;
  isOffline: boolean;
}

export const OfflineStorageModal: React.FC<OfflineStorageModalProps> = ({
  isOpen,
  onClose,
  onSelectPlaylist,
  isOffline,
}) => {
  const [cachedPlaylists, setCachedPlaylists] = useState<Array<PlaylistData & { cachedAt?: number; key: string }>>([]);
  const [stats, setStats] = useState<OfflineCacheStats | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<PlaylistData | null>(null);

  const loadData = async () => {
    const list = getAllCachedPlaylists();
    setCachedPlaylists(list);
    const s = await getOfflineCacheStats();
    setStats(s);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClear = async () => {
    if (window.confirm('Deseja realmente limpar todos os metadados de playlists e imagens salvas em cache offline?')) {
      setIsClearing(true);
      await clearAllOfflineCache();
      await loadData();
      setIsClearing(false);
      setSelectedPreview(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Recente';
    return new Date(timestamp).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        id="modal-offline-storage"
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden text-zinc-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isOffline ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
              {isOffline ? <WifiOff className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Cache Offline & Service Worker</h3>
                {isOffline ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Modo Offline Ativo
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Sincronizado
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Playlists, capas e metadados salvos no dispositivo para reprodução sem internet
              </p>
            </div>
          </div>
          <button
            id="btn-close-offline-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 p-4 bg-zinc-950/40 border-b border-zinc-800/80">
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col">
            <span className="text-[11px] text-zinc-400 font-medium">Playlists em Cache</span>
            <span className="text-lg font-bold text-white mt-0.5">{stats?.totalPlaylists ?? cachedPlaylists.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col">
            <span className="text-[11px] text-zinc-400 font-medium">Músicas Salvas</span>
            <span className="text-lg font-bold text-emerald-400 mt-0.5">{stats?.totalTracks ?? 0}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-col">
            <span className="text-[11px] text-zinc-400 font-medium">Armazenamento</span>
            <span className="text-lg font-bold text-zinc-200 mt-0.5">{formatBytes(stats?.storageSizeBytes ?? 0)}</span>
          </div>
        </div>

        {/* SW Status Banner */}
        <div className="px-4 py-2.5 bg-emerald-950/20 border-b border-emerald-900/30 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Service Worker POBREMUSIC ativo • UI Shell e metadados cacheados</span>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Atualizar</span>
          </button>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cachedPlaylists.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-500">
                <Music className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-zinc-300 mb-1">Nenhuma playlist em cache ainda</h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Ao carregar qualquer playlist ou música no POBREMUSIC, ela é automaticamente salva pelo Service Worker para acesso offline instantâneo.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 px-1">
                <span>Playlists Disponíveis Offline ({cachedPlaylists.length})</span>
                <span>Toque para Carregar</span>
              </div>

              {cachedPlaylists.map((pl, idx) => {
                const cover = pl.capa_playlist || pl.faixas?.[0]?.capa;
                return (
                  <div
                    key={pl.key || pl.playlist_id || idx}
                    id={`cached-playlist-${idx}`}
                    onClick={() => {
                      onSelectPlaylist(pl);
                      onClose();
                    }}
                    className="group flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/50 hover:border-emerald-500/50 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                        {cover ? (
                          <img src={cover} alt={pl.nome_playlist} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500">
                            <Music className="w-5 h-5" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-400 truncate transition-colors">
                          {pl.nome_playlist}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                          <span>{pl.faixas?.length || pl.total_faixas} faixas</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            {formatDate(pl.cachedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pl-2">
                      <button
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-black font-semibold text-xs transition-all flex items-center gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlaylist(pl);
                          onClose();
                        }}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span className="hidden sm:inline">Ouvir</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800 bg-zinc-950/80">
          <button
            id="btn-clear-offline-cache"
            onClick={handleClear}
            disabled={isClearing || cachedPlaylists.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Cache Offline</span>
          </button>

          <button
            id="btn-close-offline-modal-action"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
