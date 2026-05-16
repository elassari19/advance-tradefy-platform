import { useState, useEffect, useCallback } from 'react';
import { FlaskConical, X, Plus, ChevronDown } from "lucide-react";
import { useMarketDataForSymbol } from "./hooks/useMarketData";
import { useSimulator } from "./hooks/useSimulator";
import { Chart } from "./components/Chart";
import { OrderPanel } from "./components/order/OrderPanel";
import { TerminalTabs } from "./components/terminal/TerminalTabs";
import { Header } from "./components/layout/Header";
import { WebhookSettings } from "./components/settings/WebhookSettings";
import { SymbolSearchModal } from "./components/settings/SymbolSearchModal";
import { TimeframeModal } from "./components/settings/TimeframeModal";
import { AIChat } from "./components/chat/AIChat";
import type { WebhookConfig } from "./hooks/useSimulator";

type View = 'trade' | 'backtest' | 'script';
type ChartType = 'area' | 'line' | 'candle';

function formatTimeframe(minutes: number): string {
  if (minutes >= 10080) return `${Math.floor(minutes / 10080)}W`;
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}D`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}H`;
  return `${minutes}m`;
}

export function App() {
  const [view, setView] = useState<View>('trade');
  const [showSettings, setShowSettings] = useState(false);
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [showTimeframeModal, setShowTimeframeModal] = useState(false);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);

  const [tabs, setTabs] = useState<string[]>(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
  const [activeSymbol, setActiveSymbol] = useState('BTC/USDT');
  const [timeframe, setTimeframe] = useState(5);
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [strategyCode, setStrategyCode] = useState('# Write your strategy here...\n\ndef on_tick(price, candles):\n    pass');

  const { state: simState, placeOrder, updatePosition, closePosition, deployStrategy, saveWebhooks, fetchWebhooks } = useSimulator();

  const handleApplyCode = useCallback((code: string) => {
    setStrategyCode(code);
  }, []);

  useEffect(() => {
    fetchWebhooks().then(setWebhooks).catch(console.error);
  }, [fetchWebhooks]);

  const handleAddSymbol = useCallback((symbol: string) => {
    setTabs(prev => {
      if (!prev.includes(symbol)) {
        return [...prev, symbol];
      }
      return prev;
    });
    setActiveSymbol(symbol);
  }, []);

  const handleCloseTab = useCallback((symbol: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return ['BTC/USDT'];
      const idx = prev.indexOf(symbol);
      const newTabs = prev.filter(s => s !== symbol);
      if (symbol === activeSymbol) {
        const newActive = newTabs[Math.max(0, idx - 1)];
        setActiveSymbol(newActive);
      }
      return newTabs;
    });
  }, [activeSymbol]);

  const handleSaveWebhooks = async (newWebhooks: WebhookConfig[]) => {
    await saveWebhooks(newWebhooks);
    setWebhooks(newWebhooks);
  };

  const chartTypeOptions = [
    { value: 'area', label: 'Area' },
    { value: 'line', label: 'Line' },
    { value: 'candle', label: 'Candle' },
  ];

  return (
    <div className="h-screen w-screen bg-[#09090b] text-[#fafafa] font-sans">
      <Header
        view={view}
        onViewChange={setView}
        simState={simState}
        isConnected={true}
        onOpenSettings={() => setShowSettings(true)}
      />

      {view === 'trade' && (
        <div className="grid h-[calc(100vh-64px)] grid-cols-[1fr_300px]">
          <main className="flex flex-col overflow-hidden bg-[#09090b]">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-[#09090b] overflow-x-auto scrollbar-none shrink-0">
              <div className="flex items-center">
                {tabs.map((symbol) => (
                  <button
                    key={symbol}
                    onClick={() => setActiveSymbol(symbol)}
                    className={`group flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-r border-zinc-800 whitespace-nowrap transition-colors ${
                      symbol === activeSymbol
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                    }`}
                  >
                    <span>{symbol}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); handleCloseTab(symbol); }}
                      className="ml-1 w-4 h-4 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => setShowSymbolSearch(true)}
                  className="flex items-center gap-1 px-4 py-2.5 text-zinc-500 hover:text-white transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 shrink-0">
                <div className="relative">
                  <button
                    onClick={() => {
                      const idx = chartTypeOptions.findIndex(o => o.value === chartType);
                      const next = chartTypeOptions[(idx + 1) % chartTypeOptions.length];
                      setChartType(next.value as ChartType);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 transition-colors border border-zinc-700"
                  >
                    {chartTypeOptions.find(o => o.value === chartType)?.label}
                    <ChevronDown size={12} />
                  </button>
                </div>
                <button
                  onClick={() => setShowTimeframeModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800/50 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 transition-colors border border-zinc-700"
                >
                  {formatTimeframe(timeframe)}
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <div className="h-full flex flex-col">
                <div className="flex-1 min-h-0">
                  <TabChart
                    key={activeSymbol}
                    symbol={activeSymbol}
                    timeframe={timeframe}
                    chartType={chartType}
                    positions={simState.open_positions}
                    onUpdatePosition={updatePosition}
                  />
                </div>
                <div className="h-[180px] shrink-0 border-t border-zinc-800">
                  <TerminalTabs
                    positions={simState.open_positions}
                    history={simState.history}
                    onClosePosition={closePosition}
                    onUpdatePosition={updatePosition}
                    onDeployStrategy={deployStrategy}
                  />
                </div>
              </div>
            </div>
          </main>

          <OrderPanel
            balance={simState.balance}
            onPlaceOrder={placeOrder}
            symbol={activeSymbol.replace('/', '')}
          />
        </div>
      )}

      {view === 'backtest' && (
        <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center p-8">
          <FlaskConical size={64} className="text-zinc-600 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Backtest</h2>
          <p className="text-zinc-400 max-w-md">
            Run historical simulations to validate your trading strategies.
            Configure your strategy and test it against past market data.
          </p>
        </div>
      )}

      {view === 'script' && (
        <AIChat 
          symbol={activeSymbol.replace('/', '')} 
          timeframe={formatTimeframe(timeframe)}
          onApplyCode={handleApplyCode}
        />
      )}

      <WebhookSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        webhooks={webhooks}
        onSaveWebhooks={handleSaveWebhooks}
      />

      <SymbolSearchModal
        isOpen={showSymbolSearch}
        onClose={() => setShowSymbolSearch(false)}
        onSelect={handleAddSymbol}
      />

      <TimeframeModal
        isOpen={showTimeframeModal}
        onClose={() => setShowTimeframeModal(false)}
        currentTimeframe={timeframe}
        onSelect={setTimeframe}
      />
    </div>
  );
}

function TabChart({
  symbol,
  timeframe,
  chartType,
  positions,
  onUpdatePosition,
}: {
  symbol: string;
  timeframe: number;
  chartType: ChartType;
  positions: any[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
}) {
  const { candles, isInitializing } = useMarketDataForSymbol(symbol, timeframe);

  if (isInitializing) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090b]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading {symbol}...</span>
        </div>
      </div>
    );
  }

  return (
    <Chart
      candles={candles}
      positions={positions}
      onUpdatePosition={onUpdatePosition}
      chartType={chartType}
    />
  );
}