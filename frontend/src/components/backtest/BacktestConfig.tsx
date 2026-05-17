import React, { useState } from 'react';
import { Play, Loader2, AlertCircle } from 'lucide-react';
import type { BacktestRequest } from '../../hooks/useBacktest';

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'DOT/USDT'];
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

interface BacktestConfigProps {
  strategyCode: string;
  onRun: (req: BacktestRequest) => void;
  running: boolean;
}

export const BacktestConfig: React.FC<BacktestConfigProps> = ({ strategyCode, onRun, running }) => {
  const now = new Date();
  const defaultEnd = now.toISOString().split('T')[0];
  const defaultStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [symbol, setSymbol] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [initialCapital, setInitialCapital] = useState('10000');
  const [commission, setCommission] = useState('0.1');
  const [slippage, setSlippage] = useState('0.01');

  const handleRun = () => {
    const startMs = new Date(startDate).getTime() / 1000;
    const endMs = new Date(endDate).getTime() / 1000;
    onRun({
      strategy_code: strategyCode,
      symbol: symbol.replace('/', ''),
      timeframe,
      start_time: startMs,
      end_time: endMs,
      initial_balance: parseFloat(initialCapital) || 10000,
      commission: (parseFloat(commission) || 0.1) / 100,
      slippage: (parseFloat(slippage) || 0.01) / 100,
    });
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Backtest Settings</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Symbol</label>
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 font-mono"
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Timeframe</label>
          <select
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 font-mono"
          >
            {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Initial Capital ($)</label>
          <input
            type="number"
            value={initialCapital}
            onChange={e => setInitialCapital(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Commission (%)</label>
          <input
            type="number"
            value={commission}
            onChange={e => setCommission(e.target.value)}
            step="0.01"
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Slippage (%)</label>
          <input
            type="number"
            value={slippage}
            onChange={e => setSlippage(e.target.value)}
            step="0.001"
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 font-mono"
          />
        </div>
        <div />
      </div>

      <button
        onClick={handleRun}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-all shadow-lg shadow-blue-500/20"
      >
        {running ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Play size={14} fill="currentColor" />
        )}
        {running ? 'Running Backtest...' : 'Run Backtest'}
      </button>
    </div>
  );
};
