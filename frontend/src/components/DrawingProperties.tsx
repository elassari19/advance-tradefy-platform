import React, { useState } from 'react';

const COLORS = [
  '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  '#a1a1aa', '#ffffff',
];

interface DrawingPropertiesProps {
  x: number;
  y: number;
  color: string;
  borderWidth: number;
  fillColor?: string;
  extendLeft?: boolean;
  extendRight?: boolean;
  onColorChange: (color: string) => void;
  onBorderWidthChange: (width: number) => void;
  onFillColorChange?: (color: string) => void;
  onExtendLeftChange?: (v: boolean) => void;
  onExtendRightChange?: (v: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
  showFill: boolean;
}

export const DrawingProperties: React.FC<DrawingPropertiesProps> = ({
  x, y, color, borderWidth, fillColor,
  extendLeft, extendRight,
  onColorChange, onBorderWidthChange, onFillColorChange,
  onExtendLeftChange, onExtendRightChange,
  onDelete, onClose, showFill,
}) => {
  const [customColor, setCustomColor] = useState(color);

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl px-3 py-2.5 select-none min-w-[180px]"
        style={{ left: x, top: y }}
      >
        <div className="text-xs font-medium text-zinc-400 mb-2">Properties</div>

        <div className="mb-2">
          <div className="text-[10px] text-zinc-500 mb-1">Color</div>
          <div className="flex flex-wrap gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setCustomColor(c); onColorChange(c); }}
                className={`w-5 h-5 rounded-full border ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : 'border-zinc-600'}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-zinc-500">Custom:</span>
            <input
              type="color"
              value={customColor}
              onChange={e => { setCustomColor(e.target.value); onColorChange(e.target.value); }}
              className="w-6 h-5 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
        </div>

        <div className="mb-2">
          <div className="text-[10px] text-zinc-500 mb-1">Border Width</div>
          <div className="flex gap-1">
            {[1, 1.5, 2, 3, 4].map(w => (
              <button
                key={w}
                onClick={() => onBorderWidthChange(w)}
                className={`px-2 py-0.5 rounded text-xs ${borderWidth === w ? 'bg-primary text-primary-foreground' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {showFill && onFillColorChange && (
          <div className="mb-2">
            <div className="text-[10px] text-zinc-500 mb-1">Fill</div>
            <button
              onClick={() => onFillColorChange(fillColor === 'none' ? 'rgba(139,92,246,0.15)' : 'none')}
              className={`px-2 py-0.5 rounded text-xs ${fillColor !== 'none' ? 'bg-primary text-primary-foreground' : 'bg-zinc-800 text-zinc-400'}`}
            >
              {fillColor !== 'none' ? 'On' : 'Off'}
            </button>
          </div>
        )}

        {showFill && (onExtendLeftChange || onExtendRightChange) && (
          <div className="mb-2">
            <div className="text-[10px] text-zinc-500 mb-1">Extend</div>
            <div className="flex gap-1">
              {onExtendLeftChange && (
                <button
                  onClick={() => onExtendLeftChange(!extendLeft)}
                  className={`px-2 py-0.5 rounded text-xs ${extendLeft ? 'bg-primary text-primary-foreground' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                >
                  Left
                </button>
              )}
              {onExtendRightChange && (
                <button
                  onClick={() => onExtendRightChange(!extendRight)}
                  className={`px-2 py-0.5 rounded text-xs ${extendRight ? 'bg-primary text-primary-foreground' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                >
                  Right
                </button>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-zinc-700 pt-2 mt-1 flex gap-2">
          <button
            onClick={onDelete}
            className="flex-1 px-2 py-1 rounded text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};
