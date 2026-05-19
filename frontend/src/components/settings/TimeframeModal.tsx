import { useState } from 'react';
import { X, Check } from "lucide-react";

interface TimeframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTimeframe: number;
  onSelect: (minutes: number) => void;
}

const PRESETS = [
  { label: '1m', value: 1 },
  { label: '5m', value: 5 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '4h', value: 240 },
  { label: '1d', value: 1440 },
  { label: '1w', value: 10080 },
];

export function TimeframeModal({ isOpen, onClose, currentTimeframe, onSelect }: TimeframeModalProps) {
  const [customValue, setCustomValue] = useState('');

  if (!isOpen) return null;

  const handleCustomSubmit = () => {
    const num = parseInt(customValue, 10);
    if (num > 0 && num <= 1440) {
      onSelect(num);
      onClose();
    }
  };

  const handleSelect = (value: number) => {
    onSelect(value);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Select Timeframe</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handleSelect(preset.value)}
                className={`py-2.5 px-3 rounded-lg text-sm font-mono font-medium transition-all ${
                  currentTimeframe === preset.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {currentTimeframe === preset.value && <Check size={14} className="inline mr-1" />}
                {preset.label}
              </button>
            ))}
          </div>
          
          <div className="border-t border-zinc-800 pt-4">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Custom (minutes)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="e.g. 7"
                min="1"
                max="1440"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              />
              <button
                onClick={handleCustomSubmit}
                disabled={!customValue || parseInt(customValue) <= 0 || parseInt(customValue) > 1440}
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5">Enter value between 1-1440 minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
}