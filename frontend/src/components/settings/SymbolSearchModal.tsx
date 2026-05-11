import { useState, useEffect, useRef } from 'react';
import { X, Search } from "lucide-react";

interface SymbolSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
}

const POPULAR_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT',
];

const POPULAR_SYMBOLS = POPULAR_PAIRS.map(p => p.replace('/', ''));

export function SymbolSearchModal({ isOpen, onClose, onSelect }: SymbolSearchModalProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSearchResults([]);
      setSelectedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSelectedIndex(-1);
      return;
    }

    const upper = query.toUpperCase().replace('/', '');
    const filtered = POPULAR_SYMBOLS.filter(s => s.includes(upper));
    setSearchResults(filtered.map(s => s.replace(/(USDT|BUSD|USDC)$/, '/USDT')));
    setSelectedIndex(-1);
  }, [query]);

  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = query ? searchResults : POPULAR_PAIRS;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < items.length) {
        handleSelect(items[selectedIndex]);
      } else if (items.length > 0) {
        handleSelect(items[0]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayPairs = query ? searchResults : POPULAR_PAIRS;
  const header = query ? 'Search Results' : 'Popular';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 pt-[15vh]" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-3 border-b border-zinc-800">
          <Search size={18} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search symbol (e.g. BTC, ETH)..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-600"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="p-2 max-h-[50vh] overflow-y-auto">
          <div className="px-2 py-1.5">
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{header}</span>
          </div>

          {displayPairs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">
              No symbols found for &quot;{query}&quot;
            </div>
          ) : (
            <div className="space-y-0.5">
              {displayPairs.map((pair) => (
                <button
                  key={pair}
                  onClick={() => handleSelect(pair)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedIndex === displayPairs.indexOf(pair)
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <span className="font-semibold">{pair.split('/')[0]}</span>
                  <span className="text-zinc-500 text-xs font-mono">{pair.split('/')[1]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}