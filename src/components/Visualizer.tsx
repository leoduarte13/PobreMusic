import React from "react";

interface VisualizerProps {
  isPlaying: boolean;
  barCount?: number;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, barCount = 4 }) => {
  return (
    <div className="flex items-end gap-0.5 h-4 w-4">
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          className={`w-1 bg-emerald-400 rounded-full transition-all duration-300 ${
            isPlaying ? "animate-pulse" : "h-1"
          }`}
          style={{
            height: isPlaying ? `${Math.floor(30 + ((i * 23) % 70))}%` : "20%",
            animationDuration: `${0.4 + (i * 0.15)}s`,
            animationIterationCount: "infinite",
            animationDirection: "alternate",
          }}
        />
      ))}
    </div>
  );
};
