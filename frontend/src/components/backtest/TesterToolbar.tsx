import React from 'react';
import { Play, Pause, Square, SkipBack, SkipForward } from 'lucide-react';

interface TesterToolbarProps {
  running: boolean;
  paused: boolean;
  progress: number;
  currentBar: number;
  totalBars: number;
  currentTime?: string;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (speed: number) => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10, 50, 100, 500, 1000];

export const TesterToolbar: React.FC<TesterToolbarProps> = ({
  running, paused, progress, currentBar, totalBars, currentTime, speed,
  onPlay, onPause, onStop, onStepBack, onStepForward, onSpeedChange,
}) => {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {!running ? (
            <button
              onClick={onPlay}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold bg-green-600 hover:bg-green-500 text-white transition-all"
            >
              <Play size={12} fill="currentColor" />
            </button>
          ) : paused ? (
            <button
              onClick={onPlay}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold bg-green-600 hover:bg-green-500 text-white transition-all"
            >
              <Play size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={onPause}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all"
            >
              <Pause size={12} />
            </button>
          )}
          <button
            onClick={onStop}
            disabled={!running}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white transition-all disabled:opacity-30"
          >
            <Square size={12} />
          </button>
          <div className="w-px h-5 bg-zinc-800 mx-1" />
          <button
            onClick={onStepBack}
            disabled={!running || currentBar <= 0}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all disabled:opacity-30"
          >
            <SkipBack size={12} />
          </button>
          <button
            onClick={onStepForward}
            disabled={!running || currentBar >= totalBars}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all disabled:opacity-30"
          >
            <SkipForward size={12} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-500 font-bold uppercase">Speed</span>
          <div className="flex gap-0.5">
            {SPEED_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => onSpeedChange(s)}
                disabled={!running}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all disabled:opacity-30 ${
                  speed === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s >= 1000 ? 'Max' : `${s}x`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-200 rounded-full ${
              paused ? 'bg-amber-500' : running ? 'bg-blue-500' : 'bg-zinc-700'
            }`}
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
          {(progress * 100).toFixed(0)}%
        </span>
        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
          Bar: {currentBar.toLocaleString()} / {totalBars.toLocaleString()}
        </span>
        {currentTime && (
          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
            {currentTime}
          </span>
        )}
      </div>
    </div>
  );
};
