import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Play, CheckCircle, AlertCircle, Loader2, Download, Upload } from 'lucide-react';
import '../../utils/monaco-setup';
import { useJsStrategy } from '../../hooks/useJsStrategy';
import { useMarketDataForSymbol } from '../../hooks/useMarketData';
import type { Candle } from '../../hooks/useMarketData';
import { PlotPreviewPane } from './PlotPreviewPane';

const JS_TEMPLATE = `// Tradify Strategy DSL — JavaScript Edition
//
// Available in ctx:
//   ctx.candles     - Array of candle objects
//   ctx.open        - Array of open prices
//   ctx.high        - Array of high prices
//   ctx.low         - Array of low prices
//   ctx.close       - Array of close prices
//   ctx.volume      - Array of volumes
//   ctx.time        - Array of timestamps
//   ctx.barIndex    - Current bar index
//   ctx.ta          - TA function library (sma, ema, rsi, macd, bb, atr, stoch, vwap, crossover, crossunder, highest, lowest, change, alma)
//   ctx.plot()      - Plot a series on the chart

export default {
    title: "My JS Strategy",
    overlay: true,

    setup() {
        return {
            period: 14,
        };
    },

    calculate(ctx) {
        const close = ctx.close;
        const sma20 = ctx.ta.sma(close, 20);
        const sma50 = ctx.ta.sma(close, 50);

        ctx.plot(sma20, "SMA 20", "#bfff1d", "line");
        ctx.plot(sma50, "SMA 50", "#f59e0b", "line");
    }
};
`;

interface JsStrategyEditorProps {
  symbol: string;
}

export const JsStrategyEditor: React.FC<JsStrategyEditorProps> = ({ symbol }) => {
  const { candles } = useMarketDataForSymbol(symbol, 5);
  const [code, setCode] = useState(JS_TEMPLATE);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const strategy = useJsStrategy();

  const handleExport = useCallback(async () => {
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.saveFile({
      defaultPath: `${symbol.replace('/', '_')}_strategy.js`,
      filters: [{ name: 'JavaScript', extensions: ['js'] }],
      content: code,
    });
    if (filePath) {
      setStatus('success');
      setMessage(`Exported to ${filePath}`);
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [code, symbol]);

  const handleImport = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFile({
      filters: [{ name: 'JavaScript', extensions: ['js'] }],
    });
    if (result) {
      setCode(result.content);
      setStatus('success');
      setMessage(`Imported ${result.filePath}`);
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, []);

  const handleRun = useCallback(async () => {
    setStatus('loading');
    const loadResult = await strategy.loadStrategy(code);
    if (!loadResult.success) {
      setStatus('error');
      setMessage(loadResult.error || 'Failed to load strategy');
      return;
    }
    const result = await strategy.runStrategy(candles);
    if (result) {
      setStatus('success');
      setMessage(`Strategy executed on ${candles.length} bars`);
      setTimeout(() => setStatus('idle'), 3000);
    } else {
      setStatus('error');
      setMessage('Strategy execution produced no output');
    }
  }, [code, candles, strategy]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">strategy.js</span>
          <span className="text-[10px] text-zinc-600">—</span>
          <span className="text-[10px] font-bold text-zinc-600">{symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          {window.electronAPI && (
            <>
              <button
                onClick={handleImport}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              >
                <Upload size={12} />
                Import
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              >
                <Download size={12} />
                Export
              </button>
            </>
          )}
        <button
          onClick={handleRun}
          disabled={status === 'loading'}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
            status === 'success'
              ? 'bg-green-600 text-white'
              : status === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20'
          } disabled:opacity-50`}
        >
          {status === 'loading' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle size={14} />
          ) : status === 'error' ? (
            <AlertCircle size={14} />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
          {status === 'loading' ? 'Running...' : status === 'success' ? 'Done' : status === 'error' ? 'Error' : 'Run Strategy'}
        </button>
      </div>
      </div>

      <div className="flex-1 min-h-[300px]">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={code}
          onChange={(value) => setCode(value || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16 },
          }}
        />
      </div>

      {message && (
        <div className={`px-4 py-2 text-[10px] font-medium border-t border-zinc-800 ${
          status === 'success' ? 'text-green-400 bg-green-500/5' : 'text-red-400 bg-red-500/5'
        }`}>
          {message}
        </div>
      )}
      {strategy.result?.plots && strategy.result.plots.length > 0 && (
        <PlotPreviewPane plots={strategy.result.plots} />
      )}
    </div>
  );
};
