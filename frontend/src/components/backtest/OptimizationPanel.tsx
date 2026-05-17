import { useState } from 'react';
import { Play, Loader2, Plus, Trash2, Check } from 'lucide-react';

interface ParameterRange {
  name: string;
  min: number;
  max: number;
  step: number;
}

interface OptimizationResult {
  params: Record<string, number>;
  summary: {
    net_profit: number;
    net_profit_pct: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    max_drawdown: number;
    max_drawdown_pct: number;
    sharpe_ratio: number;
    profit_factor: number;
  };
}

const API_BASE = 'http://127.0.0.1:3000';

interface OptimizationPanelProps {
  strategyCode: string;
  symbol: string;
  timeframe: string;
  startTime: number;
  endTime: number;
  initialCapital: number;
  commission: number;
  slippage: number;
}

export const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  strategyCode, symbol, timeframe, startTime, endTime, initialCapital, commission, slippage
}) => {
  const [ranges, setRanges] = useState<ParameterRange[]>([{ name: 'period', min: 10, max: 30, step: 5 }]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<OptimizationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateRange = (idx: number, field: keyof ParameterRange, value: string) => {
    setRanges(prev => prev.map((r, i) =>
      i === idx ? { ...r, [field]: field === 'name' ? value : parseFloat(value) || 0 } : r
    ));
  };

  const addRange = () => {
    setRanges(prev => [...prev, { name: '', min: 0, max: 100, step: 10 }]);
  };

  const removeRange = (idx: number) => {
    setRanges(prev => prev.filter((_, i) => i !== idx));
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`${API_BASE}/api/backtest/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_code: strategyCode,
          symbol,
          timeframe,
          start_time: startTime,
          end_time: endTime,
          initial_balance: initialCapital,
          commission,
          slippage,
          ranges: ranges.filter(r => r.name.trim() !== ''),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Optimization failed');
      }
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Optimization request failed');
    } finally {
      setRunning(false);
    }
  };

  const handleApplyBest = () => {
    if (!results || results.length === 0) return;
    const best = results[0];
    alert(`Best params found:\n${Object.entries(best.params).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nCopy these into your strategy code.`);
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Optimization</h3>

      <div className="space-y-2">
        {ranges.map((r, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 bg-zinc-900/50 rounded border border-zinc-800">
            <input
              type="text"
              placeholder="Param name"
              value={r.name}
              onChange={e => updateRange(idx, 'name', e.target.value)}
              className="w-20 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 font-mono"
            />
            <input
              type="number"
              placeholder="Min"
              value={r.min}
              onChange={e => updateRange(idx, 'min', e.target.value)}
              className="w-16 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 font-mono"
            />
            <span className="text-[10px] text-zinc-500">to</span>
            <input
              type="number"
              placeholder="Max"
              value={r.max}
              onChange={e => updateRange(idx, 'max', e.target.value)}
              className="w-16 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 font-mono"
            />
            <span className="text-[10px] text-zinc-500">step</span>
            <input
              type="number"
              placeholder="Step"
              value={r.step}
              onChange={e => updateRange(idx, 'step', e.target.value)}
              className="w-16 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-200 font-mono"
            />
            {ranges.length > 1 && (
              <button onClick={() => removeRange(idx)} className="text-zinc-500 hover:text-red-400 p-1">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addRange}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Plus size={12} />
          Add Parameter
        </button>
      </div>

      <button
        onClick={handleRun}
        disabled={running || ranges.filter(r => r.name.trim()).length === 0}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-all shadow-lg shadow-purple-500/20"
      >
        {running ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Play size={14} fill="currentColor" />
        )}
        {running ? 'Optimizing...' : 'Run Optimization'}
      </button>

      {error && (
        <div className="px-3 py-2 text-[10px] font-medium text-red-400 bg-red-500/5 border border-red-800 rounded">
          {error}
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Results ({results.length} combos)
            </span>
            <button
              onClick={handleApplyBest}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-green-400 hover:bg-green-500/10 transition-colors"
            >
              <Check size={10} />
              Apply Best
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px] font-mono">
              <thead className="text-zinc-500">
                <tr>
                  {Object.keys(results[0].params).map(k => (
                    <th key={k} className="px-2 py-1 font-medium uppercase">{k}</th>
                  ))}
                  <th className="px-2 py-1 font-medium uppercase">Net Profit</th>
                  <th className="px-2 py-1 font-medium uppercase">Sharpe</th>
                  <th className="px-2 py-1 font-medium uppercase">Win Rate</th>
                  <th className="px-2 py-1 font-medium uppercase">Profit Factor</th>
                  <th className="px-2 py-1 font-medium uppercase">DD%</th>
                  <th className="px-2 py-1 font-medium uppercase">Trades</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {results.map((r, i) => (
                  <tr key={i} className={`hover:bg-zinc-900/50 transition-colors ${i === 0 ? 'text-green-400' : 'text-zinc-300'}`}>
                    {Object.keys(results[0].params).map(k => (
                      <td key={k} className="px-2 py-1.5">{r.params[k]?.toFixed(2)}</td>
                    ))}
                    <td className="px-2 py-1.5 font-bold">${r.summary.net_profit.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{r.summary.sharpe_ratio.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{r.summary.win_rate.toFixed(1)}%</td>
                    <td className="px-2 py-1.5">{r.summary.profit_factor.toFixed(2)}</td>
                    <td className="px-2 py-1.5">{r.summary.max_drawdown_pct.toFixed(1)}%</td>
                    <td className="px-2 py-1.5">{r.summary.total_trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
