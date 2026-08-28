import React from "react";

interface PobreMusicLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

export const PobreMusicLogo: React.FC<PobreMusicLogoProps> = ({
  size = "md",
  showText = true,
  className = "",
}) => {
  const iconDimensions = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
    xl: "w-14 h-14",
  }[size];

  const titleSizes = {
    sm: "text-sm",
    md: "text-base sm:text-lg",
    lg: "text-xl sm:text-2xl",
    xl: "text-2xl sm:text-3xl",
  }[size];

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      {/* Brand Icon SVG */}
      <div
        className={`${iconDimensions} relative rounded-xl bg-zinc-900 border border-emerald-500/30 p-1 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/15 overflow-hidden group`}
      >
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/25 via-teal-500/10 to-cyan-500/20 opacity-80 group-hover:opacity-100 transition-opacity" />

        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-10 drop-shadow-[0_2px_8px_rgba(16,185,129,0.5)]"
        >
          <defs>
            <linearGradient id="pobreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="60%" stopColor="#14b8a6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="pobrePill" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>

          {/* Headphone Arch */}
          <path
            d="M 22 55 A 28 28 0 0 1 78 55"
            stroke="url(#pobreGrad)"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Left Earcup */}
          <rect x="18" y="52" width="8" height="16" rx="4" fill="#10b981" />

          {/* Right Earcup */}
          <rect x="74" y="52" width="8" height="16" rx="4" fill="#06b6d4" />

          {/* Main Stylized Letter 'P' */}
          {/* Vertical Stem */}
          <rect x="34" y="32" width="7" height="42" rx="3.5" fill="#ffffff" />

          {/* Upper P Loop */}
          <path
            d="M 34 32 H 52 C 61 32 67 38 67 46 C 67 54 61 60 52 60 H 34"
            fill="url(#pobreGrad)"
            stroke="#ffffff"
            strokeWidth="1.5"
          />

          {/* Inner cutout of P */}
          <circle cx="51" cy="46" r="6.5" fill="#18181b" />

          {/* Micro Play Triangle in the lower right */}
          <path
            d="M 64 68 L 74 74 L 64 80 Z"
            fill="#34d399"
            className="animate-pulse"
          />
        </svg>
      </div>

      {/* Brand Text */}
      {showText && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black ${titleSizes} tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-100 to-emerald-300 drop-shadow-sm font-sans`}
            >
              POBRE<span className="text-emerald-400">MUSIC</span>
            </span>
            <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
              FREE
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-zinc-400 font-medium truncate hidden sm:block">
            Spotify Playlists • YouTube Streaming
          </p>
        </div>
      )}
    </div>
  );
};
