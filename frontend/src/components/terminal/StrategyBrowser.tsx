import { useState, useEffect } from 'react';
import { Search, Loader2, FileCode, Download } from 'lucide-react';

interface SavedStrategy {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  code: string;
  created_at: string;
}

interface StrategyBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (code: string) => void;
}

const API_BASE = 'http://127.0.0.1:3000';

export const StrategyBrowser: React.FC<StrategyBrowserProps> = ({ isOpen, onClose, onLoad }) => {
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchStrategies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/strategy/list`);
      const data = await res.json();
      setStrategies(data.results || []);
    } catch {
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchStrategies();
  }, [isOpen]);

  const handleLoad = (s: SavedStrategy) => {
    onLoad(s.code);
    onClose();
  };

  const filtered = strategies.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.symbol.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Strategy Library</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 border-b border-zinc-800">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search strategies by name or symbol..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 font-mono placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-zinc-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-600 italic text-xs">
              {search ? 'No matching strategies' : 'No saved strategies yet'}
            </div>
          ) : (
            filtered.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors group">
                <FileCode size={16} className="text-zinc-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-200">{s.name}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{s.symbol} &middot; {s.timeframe}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600 font-mono truncate mt-0.5">
                    {new Date(s.created_at).toLocaleDateString()} &mdash; {s.code.slice(0, 80)}...
                  </div>
                </div>
                <button
                  onClick={() => handleLoad(s)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <Download size={10} />
                  Load
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
