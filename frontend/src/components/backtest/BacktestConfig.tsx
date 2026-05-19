import React, { useState } from 'react';
import { Play, Loader2, FolderOpen, FileCode, Radio, Pause, Square, PlayIcon } from 'lucide-react';
import type { BacktestRequest } from '../../hooks/useBacktest';

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'DOT/USDT'];
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const SPEED_OPTIONS = [1, 10, 50, 100, 500];

interface BacktestConfigProps {
  strategyCode: string;
  onRun: (req: BacktestRequest) => void;
  running: boolean;
  onLoadStrategy: () => void;
  liveMode?: boolean;
  onLiveModeChange?: (v: boolean) => void;
  speed?: number;
  onSpeedChange?: (v: number) => void;
  liveRunning?: boolean;
  livePaused?: boolean;
  onPause?: () => void;
  onContinue?: () => void;
  onStop?: () => void;
}

export const BacktestConfig: React.FC<BacktestConfigProps> = ({
  strategyCode, onRun, running, onLoadStrategy,
  liveMode, onLiveModeChange, speed = 1, onSpeedChange,
  liveRunning, livePaused, onPause, onContinue, onStop,
}) => {
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
      speed,
    });
  };

  const strategyLabel = strategyCode.trim().split('\n')[0]?.replace(/^#\s*/, '') || 'Untitled Strategy';
  const isDefault = strategyCode === '# Write your strategy here...\n\ndef on_tick(price, candles):\n    pass';

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Backtest Settings</h3>
        <button
          onClick={onLoadStrategy}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
        >
          <FolderOpen size={12} />
          Browse Strategies
        </button>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5 flex items-center gap-3">
        <FileCode size={14} className="text-zinc-500 shrink-0" />
        <span className="text-xs text-zinc-400 font-mono truncate flex-1">
          {isDefault ? 'No strategy selected' : strategyLabel}
        </span>
        <span className="text-[10px] text-zinc-600 font-mono shrink-0">
          {strategyCode.length} chars
        </span>
      </div>

      <div className="grid grid-cols-7 gap-2">
        <div className="col-span-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Symbol</label>
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200 font-mono"
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">TF</label>
          <select
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200 font-mono"
          >
            {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200 font-mono"
          />
        </div>
        <div className="col-span-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200 font-mono"
          />
        </div>
        <div className="col-span-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Capital</label>
          <input
            type="number"
            value={initialCapital}
            onChange={e => setInitialCapital(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200 font-mono"
          />
        </div>
        <div className="col-span-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Comm.</label>
          <input
            type="number"
            value={commission}
            onChange={e => setCommission(e.target.value)}
            step="0.01"
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200 font-mono"
          />
        </div>
        <div className="col-span-1">
          <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Slip.</label>
          <input
            type="number"
            value={slippage}
            onChange={e => setSlippage(e.target.value)}
            step="0.001"
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-[10px] text-zinc-200 font-mono"
          />
        </div>
      </div>

      {onLiveModeChange && onSpeedChange && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => onLiveModeChange(!liveMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-bold border transition-all ${
              liveMode
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio size={12} className={liveMode ? 'animate-pulse' : ''} />
            Live Chart
          </button>
          {liveMode && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Speed</span>
              <div className="flex gap-0.5">
                {SPEED_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => onSpeedChange(s)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                      speed === s
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {liveRunning ? (
        <div className="flex gap-2">
          {livePaused ? (
            <button
              onClick={onContinue}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md text-xs font-bold text-white transition-all shadow-lg shadow-green-500/20"
            >
              <PlayIcon size={14} />
              Continue
            </button>
          ) : (
            <button
              onClick={onPause}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-md text-xs font-bold text-white transition-all shadow-lg shadow-amber-500/20"
            >
              <Pause size={14} />
              Pause
            </button>
          )}
          <button
            onClick={onStop}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-md text-xs font-bold text-white transition-all shadow-lg shadow-red-500/20"
          >
            <Square size={14} />
            End
          </button>
        </div>
      ) : (
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
          {running ? (liveMode ? 'Streaming Backtest...' : 'Running Backtest...') : 'Run Backtest'}
        </button>
      )}
    </div>
  );
};
