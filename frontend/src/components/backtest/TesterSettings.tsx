import React, { useState } from 'react';
import { Play, Loader2, FolderOpen, FileCode, Radio } from 'lucide-react';
import type { BacktestRequest, TestingMode } from '../../hooks/useBacktest';

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'DOT/USDT'];
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const SPEED_PRESETS = [1, 10, 50, 100, 500];

interface TesterSettingsProps {
  strategyCode: string;
  onRun: (req: BacktestRequest) => void;
  running: boolean;
  onLoadStrategy: () => void;
}

export const TesterSettings: React.FC<TesterSettingsProps> = ({ strategyCode, onRun, running, onLoadStrategy }) => {
  const now = new Date();
  const defaultEnd = now.toISOString().split('T')[0];
  const defaultStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [symbol, setSymbol] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [periodPreset, setPeriodPreset] = useState<'all' | '1m' | '3m' | '1y' | 'custom'>('custom');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [testingMode, setTestingMode] = useState<TestingMode>('EveryTick');
  const [initialCapital, setInitialCapital] = useState('10000');
  const [commission, setCommission] = useState('0.1');
  const [slippage, setSlippage] = useState('0.01');
  const [visualMode, setVisualMode] = useState(false);
  const [visualSpeed, setVisualSpeed] = useState(10);

  const handlePeriodPreset = (preset: typeof periodPreset) => {
    setPeriodPreset(preset);
    const end = new Date();
    let start = new Date();
    if (preset === 'all') start = new Date(0);
    else if (preset === '1m') start.setMonth(start.getMonth() - 1);
    else if (preset === '3m') start.setMonth(start.getMonth() - 3);
    else if (preset === '1y') start.setFullYear(start.getFullYear() - 1);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

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
      speed: visualMode ? visualSpeed : undefined,
      testing_mode: testingMode,
      visual: visualMode,
    });
  };

  const strategyLabel = strategyCode.trim().split('\n')[0]?.replace(/^#\s*/, '') || 'Untitled Strategy';
  const isDefault = strategyCode === '# Write your strategy here...\n\ndef on_tick(price, candles):\n    pass';

  const testingModeOptions: { value: TestingMode; label: string; desc: string }[] = [
    { value: 'EveryTick', label: 'Every tick', desc: 'Most accurate, slowest' },
    { value: 'ControlPoints', label: '1 minute OHLC', desc: 'Balance speed & accuracy' },
    { value: 'OpenPricesOnly', label: 'Open prices only', desc: 'Fastest, least accurate' },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Expert Advisor</h4>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 flex items-center gap-3">
            <FileCode size={14} className="text-zinc-500 shrink-0" />
            <span className="text-xs text-zinc-400 font-mono truncate flex-1">
              {isDefault ? 'No strategy selected' : strategyLabel}
            </span>
            <span className="text-[10px] text-zinc-600 font-mono shrink-0">
              {strategyCode.length} chars
            </span>
          </div>
          <button
            onClick={onLoadStrategy}
            className="flex items-center gap-1 px-2.5 py-2 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
          >
            <FolderOpen size={12} />
            Browse
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Symbol / Timeframe</h4>
        <div className="flex gap-2">
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono"
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono"
          >
            {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Testing Period</h4>
        <div className="flex gap-1 mb-2">
          {[
            { value: 'all' as const, label: 'All history' },
            { value: '1m' as const, label: '1 month' },
            { value: '3m' as const, label: '3 months' },
            { value: '1y' as const, label: '1 year' },
            { value: 'custom' as const, label: 'Custom' },
          ].map(p => (
            <button
              key={p.value}
              onClick={() => handlePeriodPreset(p.value)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                periodPreset === p.value
                  ? 'bg-blue-600/20 border border-blue-500/40 text-blue-400'
                  : 'bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodPreset === 'custom' && (
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono"
            />
            <span className="text-zinc-600 text-xs self-center">→</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono"
            />
          </div>
        )}
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Testing Mode</h4>
        <div className="space-y-1.5">
          {testingModeOptions.map(opt => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                testingMode === opt.value
                  ? 'bg-blue-600/10 border-blue-500/30'
                  : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <input
                type="radio"
                name="testingMode"
                checked={testingMode === opt.value}
                onChange={() => setTestingMode(opt.value)}
                className="accent-blue-500"
              />
              <div>
                <div className={`text-xs font-bold ${testingMode === opt.value ? 'text-blue-400' : 'text-zinc-300'}`}>
                  {opt.label}
                </div>
                <div className="text-[10px] text-zinc-500">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Parameters</h4>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[9px] font-bold text-zinc-500 block mb-1">Initial Balance</label>
            <input
              type="number"
              value={initialCapital}
              onChange={e => setInitialCapital(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold text-zinc-500 block mb-1">Commission</label>
            <div className="relative">
              <input
                type="number"
                value={commission}
                onChange={e => setCommission(e.target.value)}
                step="0.01"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono pr-5"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-bold text-zinc-500 block mb-1">Slippage</label>
            <div className="relative">
              <input
                type="number"
                value={slippage}
                onChange={e => setSlippage(e.target.value)}
                step="0.001"
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono pr-5"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Visual Mode</h4>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={visualMode}
              onChange={e => setVisualMode(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>
        {visualMode && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">Speed:</span>
            <div className="flex gap-1">
              {SPEED_PRESETS.map(s => (
                <button
                  key={s}
                  onClick={() => setVisualSpeed(s)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                    visualSpeed === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleRun}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-xs font-bold text-white transition-all shadow-lg shadow-blue-500/20"
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
