import React, { useEffect, useRef } from "react";
import { X, Sliders, Volume2, Sparkles, RotateCcw, Zap, Disc3, ShieldCheck, Activity } from "lucide-react";
import { EqualizerState, EqualizerPreset } from "../types";

export const EQ_FREQUENCIES = [
  { label: "60 Hz", role: "Sub-Graves" },
  { label: "170 Hz", role: "Graves" },
  { label: "350 Hz", role: "Médios-G" },
  { label: "1 kHz", role: "Médios" },
  { label: "3.5 kHz", role: "Médios-A" },
  { label: "10 kHz", role: "Agudos" },
  { label: "16 kHz", role: "Brilho" },
];

export const EQ_PRESETS: EqualizerPreset[] = [
  { id: "flat", name: "Padrão / Flat", bands: [0, 0, 0, 0, 0, 0, 0], bassBoost: 0, surround: false },
  { id: "bass_boost", name: "Bass Boost 🔥", bands: [9, 7, 4, 1, 0, 1, 2], bassBoost: 60, surround: false },
  { id: "vocal", name: "Voz & Podcasts 🎙️", bands: [-2, 0, 3, 7, 5, 3, 1], bassBoost: 0, surround: false },
  { id: "rock", name: "Rock & Metal 🎸", bands: [6, 4, -1, 2, 4, 6, 5], bassBoost: 30, surround: true },
  { id: "pop", name: "Pop Dinâmico 🎵", bands: [4, 5, 2, 1, 3, 5, 4], bassBoost: 20, surround: true },
  { id: "edm", name: "Eletrônica / EDM 🎧", bands: [8, 6, 2, 0, 3, 7, 8], bassBoost: 50, surround: true },
  { id: "acoustic", name: "Acústico & MPB 🎻", bands: [3, 2, 1, 2, 3, 4, 4], bassBoost: 10, surround: false },
  { id: "loudness", name: "Loudness Max 🔊", bands: [7, 5, 1, 2, 4, 7, 8], bassBoost: 40, surround: true },
  { id: "treble", name: "Agudos Nítidos ✨", bands: [-1, 0, 1, 2, 5, 8, 9], bassBoost: 0, surround: false },
];

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  eqState: EqualizerState;
  onUpdateEqState: (newState: EqualizerState) => void;
  isPlaying: boolean;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  onClose,
  eqState,
  onUpdateEqState,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render dynamic frequency curve on canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const render = () => {
      time += 0.05;
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Grid Lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      for (let y = 10; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Zero-line (0 dB center)
      ctx.strokeStyle = "rgba(16, 185, 129, 0.25)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Smooth Frequency Curve
      const bands = eqState.bands;
      const numBands = bands.length;
      const step = width / (numBands - 1);

      // Gradient Fill
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(16, 185, 129, 0.4)");
      gradient.addColorStop(1, "rgba(16, 185, 129, 0.0)");

      ctx.beginPath();
      ctx.moveTo(0, height);

      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < numBands; i++) {
        const gain = eqState.enabled ? bands[i] : 0;
        const wave = isPlaying && eqState.enabled ? Math.sin(time + i * 0.8) * 3 : 0;
        // Mapping -12dB to +12dB to canvas height
        const normalizedY = centerY - (gain / 12) * (height * 0.38) + wave;
        const x = i * step;
        points.push({ x, y: normalizedY });
      }

      // Bezier curve through points
      ctx.lineTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Stroke Curve Line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.strokeStyle = eqState.enabled ? "#10B981" : "#71717A";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw Points
      points.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = eqState.enabled ? "#34D399" : "#A1A1AA";
        ctx.fill();
        ctx.strokeStyle = "#09090B";
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen, eqState, isPlaying]);

  if (!isOpen) return null;

  const handleBandChange = (index: number, value: number) => {
    const newBands = [...eqState.bands];
    newBands[index] = value;
    onUpdateEqState({
      ...eqState,
      bands: newBands,
      preset: "custom",
    });
  };

  const handleApplyPreset = (preset: EqualizerPreset) => {
    onUpdateEqState({
      ...eqState,
      preset: preset.id,
      bands: [...preset.bands],
      bassBoost: preset.bassBoost ?? 0,
      surround: preset.surround ?? false,
    });
  };

  const handleToggleEnabled = () => {
    onUpdateEqState({
      ...eqState,
      enabled: !eqState.enabled,
    });
  };

  const handleReset = () => {
    const flat = EQ_PRESETS[0];
    handleApplyPreset(flat);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-7 text-zinc-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${eqState.enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}>
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Equalizador de Áudio</h2>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${eqState.enabled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-zinc-800 text-zinc-400"}`}>
                  {eqState.enabled ? "Ativo" : "Desativado"}
                </span>
              </div>
              <p className="text-xs text-zinc-400">Ajuste de frequências, graves e ambiência sonora</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle switch */}
            <button
              id="btn-toggle-eq"
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors p-1 ${
                eqState.enabled ? "bg-emerald-500" : "bg-zinc-700"
              }`}
              title="Ativar/Desativar Equalizador"
              aria-label="Ativar ou Desativar Equalizador"
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  eqState.enabled ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>

            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
              aria-label="Fechar Equalizador"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Visual Frequency Response Curve */}
        <div className="mt-4 p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono mb-2">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Activity className="w-3.5 h-3.5" />
              Curva de Resposta Sonora
            </span>
            <span className="text-zinc-500">+12 dB / -12 dB</span>
          </div>
          <canvas
            ref={canvasRef}
            width={580}
            height={110}
            className="w-full h-24 rounded-lg bg-zinc-900/60"
          />
        </div>

        {/* Presets List */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Predefinições Rápidas (Presets)
            </label>
            <button
              onClick={handleReset}
              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Resetar Flat</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {EQ_PRESETS.map((preset) => {
              const isSelected = eqState.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-xl text-left text-xs font-semibold border transition-all ${
                    isSelected
                      ? "bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-sm"
                      : "bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{preset.name}</span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 7 Band Sliders */}
        <div className="mt-6 p-4 rounded-xl bg-zinc-950 border border-zinc-800">
          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end">
            {EQ_FREQUENCIES.map((freq, idx) => {
              const gain = eqState.bands[idx] ?? 0;
              return (
                <div key={freq.label} className="flex flex-col items-center gap-2">
                  <span className={`text-[10px] font-mono font-semibold ${gain > 0 ? "text-emerald-400" : gain < 0 ? "text-amber-400" : "text-zinc-500"}`}>
                    {gain > 0 ? `+${gain}` : gain} dB
                  </span>
                  
                  {/* Vertical Slider Simulation */}
                  <div className="h-32 flex items-center justify-center relative py-1">
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={gain}
                      disabled={!eqState.enabled}
                      onChange={(e) => handleBandChange(idx, Number(e.target.value))}
                      className="h-28 w-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 [writing-mode:vertical-lr] [direction:rtl] disabled:opacity-30 focus:outline-none"
                    />
                  </div>

                  <div className="text-center">
                    <span className="block text-[11px] font-mono font-bold text-zinc-200">
                      {freq.label}
                    </span>
                    <span className="block text-[9px] text-zinc-500 truncate max-w-[50px]">
                      {freq.role}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Extra FX: Bass Boost & Surround Sound */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Reforço de Graves</p>
                <p className="text-[10px] text-zinc-400">Potencializa frequências sub-bass</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={eqState.bassBoost}
                disabled={!eqState.enabled}
                onChange={(e) => onUpdateEqState({ ...eqState, bassBoost: Number(e.target.value), preset: "custom" })}
                className="w-20 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-30"
              />
              <span className="text-[11px] font-mono text-zinc-400 w-7 text-right">
                {eqState.bassBoost}%
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Áudio 3D Surround</p>
                <p className="text-[10px] text-zinc-400">Ambiência estéreo expandida</p>
              </div>
            </div>
            <button
              type="button"
              disabled={!eqState.enabled}
              onClick={() => onUpdateEqState({ ...eqState, surround: !eqState.surround, preset: "custom" })}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${
                eqState.surround
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {eqState.surround ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-zinc-400 text-center sm:text-left">
            {eqState.enabled ? "Configurações aplicadas em tempo real" : "Ative para aplicar os filtros de áudio"}
          </span>
          <button
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors shadow-lg shadow-emerald-950/50 flex items-center justify-center"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
