import { useState, useEffect } from 'react';
import { Search, Loader2, FileCode, Download, Trash2, Plus, Check, X } from 'lucide-react';

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
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newSymbol, setNewSymbol] = useState('BTC/USDT');
  const [newTimeframe, setNewTimeframe] = useState('1h');
  const [saving, setSaving] = useState(false);

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

  const handleSave = async () => {
    if (!newName.trim() || !newCode.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/strategy/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          symbol: newSymbol.replace('/', ''),
          timeframe: newTimeframe,
          code: newCode,
        }),
      });
      if (res.ok) {
        setNewName('');
        setNewCode('');
        setShowNew(false);
        await fetchStrategies();
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = (s: SavedStrategy) => {
    onLoad(s.code);
    onClose();
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/strategy/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setStrategies(prev => prev.filter(s => s.id !== id));
      }
    } catch {
      // silently fail
    }
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowNew(!showNew); setSearch(''); }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold transition-all border ${
                showNew ? 'bg-blue-600/10 border-blue-500/30 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              <Plus size={12} />
              New Strategy
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">&times;</button>
          </div>
        </div>

        {showNew && (
          <div className="p-4 border-b border-zinc-800 space-y-3 bg-zinc-900/30">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Name</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="My Strategy"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Symbol</label>
                <select
                  value={newSymbol}
                  onChange={e => setNewSymbol(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                >
                  {['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'DOT/USDT'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Timeframe</label>
                <select
                  value={newTimeframe}
                  onChange={e => setNewTimeframe(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                >
                  {['1m', '5m', '15m', '30m', '1h', '4h', '1d'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Script</label>
              <textarea
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                placeholder="# Write your strategy here..."
                rows={6}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-2 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 resize-none font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowNew(false); setNewName(''); setNewCode(''); }}
                className="px-3 py-1.5 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !newName.trim() || !newCode.trim()}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {saving ? 'Saving...' : 'Save Strategy'}
              </button>
            </div>
          </div>
        )}

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
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                  <button
                    onClick={() => handleLoad(s)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  >
                    <Download size={10} />
                    Load
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
