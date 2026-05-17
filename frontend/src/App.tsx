import { useState, useEffect, useCallback } from 'react';
import { X, Plus, ChevronDown, BarChart3, FlaskConical } from "lucide-react";
import { useMarketDataForSymbol } from "./hooks/useMarketData";
import { useSimulator } from "./hooks/useSimulator";
import { useBacktest } from "./hooks/useBacktest";
import { Chart } from "./components/Chart";
import { OrderPanel } from "./components/order/OrderPanel";
import { TerminalTabs } from "./components/terminal/TerminalTabs";
import { Header } from "./components/layout/Header";
import { WebhookSettings } from "./components/settings/WebhookSettings";
import { SymbolSearchModal } from "./components/settings/SymbolSearchModal";
import { TimeframeModal } from "./components/settings/TimeframeModal";
import { AIChat } from "./components/chat/AIChat";
import { IndicatorPanel } from "./components/indicators/IndicatorPanel";
import { CustomIndicatorModal } from "./components/CustomIndicatorModal";
import { BacktestConfig } from "./components/backtest/BacktestConfig";
import { BacktestResults } from "./components/backtest/BacktestResults";
import type { WebhookConfig } from "./hooks/useSimulator";
import type { IndicatorConfig, CustomIndicatorDef } from "./utils/indicators";
import type { BacktestResult, BacktestRequest } from "./hooks/useBacktest";

type View = 'trade' | 'backtest' | 'script';
type ChartType = 'area' | 'line' | 'candle';

const DEFAULT_STRATEGY_CODE = '# Write your strategy here...\n\ndef on_tick(price, candles):\n    pass';

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

  const [strategyCodes, setStrategyCodes] = useState<Record<string, string>>({});
  const [activeStrategySymbols, setActiveStrategySymbols] = useState<string[]>([]);
  const [indicatorConfigs, setIndicatorConfigs] = useState<Record<string, IndicatorConfig[]>>({});
  const [customIndicatorDefs, setCustomIndicatorDefs] = useState<CustomIndicatorDef[]>(() => {
    try {
      const saved = localStorage.getItem('customIndicators');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editCustomDef, setEditCustomDef] = useState<CustomIndicatorDef | null>(null);
  const [showIndicatorsModal, setShowIndicatorsModal] = useState(false);
  const [focusTab, setFocusTab] = useState<'positions' | 'history' | 'strategy' | 'logs' | undefined>(undefined);

  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  const { state: simState, placeOrder, updatePosition, closePosition, deployStrategy, removeStrategy, fetchActiveStrategies, saveWebhooks, fetchWebhooks } = useSimulator();
  const { runBacktest, saveBacktest, running: backtestRunning } = useBacktest();

  useEffect(() => {
    fetchWebhooks().then(setWebhooks).catch(console.error);
    fetchActiveStrategies().then(setActiveStrategySymbols).catch(console.error);
  }, [fetchWebhooks, fetchActiveStrategies]);

  const currentStrategyCode = strategyCodes[activeSymbol] ?? DEFAULT_STRATEGY_CODE;
  const currentStrategyActive = activeStrategySymbols.includes(activeSymbol.replace('/', ''));
  const currentIndicators = indicatorConfigs[activeSymbol] ?? [];

  const handleStrategyCodeChange = useCallback((code: string) => {
    setStrategyCodes(prev => ({ ...prev, [activeSymbol]: code }));
  }, [activeSymbol]);

  const handleDeployStrategy = useCallback(async (symbol: string, code: string) => {
    const rawSymbol = symbol.replace('/', '');
    await deployStrategy(rawSymbol, code);
    setActiveStrategySymbols(prev => prev.includes(rawSymbol) ? prev : [...prev, rawSymbol]);
  }, [deployStrategy]);

  const handleRemoveStrategy = useCallback(async (symbol: string) => {
    const rawSymbol = symbol.replace('/', '');
    await removeStrategy(rawSymbol);
    setActiveStrategySymbols(prev => prev.filter(s => s !== rawSymbol));
  }, [removeStrategy]);

  const handleToggleIndicator = useCallback((config: IndicatorConfig) => {
    setIndicatorConfigs(prev => {
      const current = prev[activeSymbol] ?? [];
      const exists = current.find(i => i.id === config.id);
      if (exists) {
        return { ...prev, [activeSymbol]: current.filter(i => i.id !== config.id) };
      }
      return { ...prev, [activeSymbol]: [...current, config] };
    });
  }, [activeSymbol]);

  const handleBacktestRun = useCallback(async (req: BacktestRequest) => {
    const result = await runBacktest(req);
    if (result) {
      setBacktestResult(result);
    }
  }, [runBacktest]);

  const handleBacktestSave = useCallback(async () => {
    if (!backtestResult) return;
    const id = await saveBacktest(backtestResult, backtestResult.request.strategy_code.slice(0, 30) + '...');
    if (id) {
      alert(`Backtest saved with ID: ${id}`);
    }
  }, [backtestResult, saveBacktest]);

  const handleRemoveIndicator = useCallback((id: string) => {
    setIndicatorConfigs(prev => {
      const current = prev[activeSymbol] ?? [];
      return { ...prev, [activeSymbol]: current.filter(i => i.id !== id) };
    });
  }, [activeSymbol]);

  const handleOpenStrategy = useCallback(() => {
    setFocusTab('strategy');
    setTimeout(() => setFocusTab(undefined), 100);
  }, []);

  const handleSaveCustomIndicator = useCallback((def: CustomIndicatorDef) => {
    setCustomIndicatorDefs(prev => {
      const existing = prev.findIndex(d => d.id === def.id);
      const next = existing >= 0
        ? prev.map((d, i) => i === existing ? def : d)
        : [...prev, def];
      localStorage.setItem('customIndicators', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleOpenCustomModal = useCallback(() => {
    setEditCustomDef(null);
    setShowCustomModal(true);
  }, []);

  const handleEditCustomIndicator = useCallback((def: CustomIndicatorDef) => {
    setEditCustomDef(def);
    setShowCustomModal(true);
  }, []);

  const handleApplyCode = useCallback((code: string) => {
    setStrategyCodes(prev => ({ ...prev, [activeSymbol]: code }));
  }, [activeSymbol]);

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
                {tabs.map((symbol) => {
                  const hasStrategy = activeStrategySymbols.includes(symbol.replace('/', ''));
                  const hasIndicators = (indicatorConfigs[symbol] ?? []).length > 0;
                  const hasAny = hasStrategy || hasIndicators;
                  return (
                    <button
                      key={symbol}
                      onClick={() => setActiveSymbol(symbol)}
                      className={`group flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-r border-zinc-800 whitespace-nowrap transition-colors ${
                        symbol === activeSymbol
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                      }`}
                    >
                      {hasAny && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                      <span>{symbol}</span>
                      <span
                        onClick={(e) => { e.stopPropagation(); handleCloseTab(symbol); }}
                        className="ml-1 w-4 h-4 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowSymbolSearch(true)}
                  className="flex items-center gap-1 px-4 py-2.5 text-zinc-500 hover:text-white transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 shrink-0">
                <button
                  onClick={() => setShowIndicatorsModal(true)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-mono transition-colors border ${
                    currentIndicators.length > 0
                      ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                      : 'bg-zinc-800/50 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <BarChart3 size={14} />
                  Indicators
                  {currentIndicators.length > 0 && (
                    <span className="ml-1 w-4 h-4 rounded-full bg-blue-500 text-[9px] font-bold text-white flex items-center justify-center">
                      {currentIndicators.length}
                    </span>
                  )}
                </button>
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
                    indicatorConfigs={currentIndicators}
                  />
                </div>
                <div className="h-[180px] shrink-0 border-t border-zinc-800">
                  <TerminalTabs
                    positions={simState.open_positions}
                    history={simState.history}
                    activeSymbol={activeSymbol}
                    strategyCode={currentStrategyCode}
                    strategyActive={currentStrategyActive}
                    onClosePosition={closePosition}
                    onUpdatePosition={updatePosition}
                    onDeployStrategy={handleDeployStrategy}
                    onRemoveStrategy={handleRemoveStrategy}
                    onStrategyCodeChange={handleStrategyCodeChange}
                    focusTab={focusTab}
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
        <div className="h-[calc(100vh-64px)] grid grid-cols-[360px_1fr] overflow-hidden">
          <div className="overflow-y-auto border-r border-zinc-800 p-4 space-y-4">
            <BacktestConfig
              strategyCode={currentStrategyCode}
              onRun={handleBacktestRun}
              running={backtestRunning}
            />
            {backtestResult && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Strategy</h3>
                <pre className="text-[10px] text-zinc-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {currentStrategyCode}
                </pre>
              </div>
            )}
          </div>
          <div className="overflow-y-auto p-4">
            {backtestResult ? (
              <BacktestResults result={backtestResult} onSave={handleBacktestSave} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <FlaskConical size={64} className="text-zinc-600 mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Backtest</h2>
                <p className="text-zinc-400 max-w-md text-sm">
                  Configure your backtest settings on the left and click <span className="text-blue-400 font-bold">Run Backtest</span> to simulate your strategy against historical market data.
                </p>
              </div>
            )}
          </div>
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

      <IndicatorPanel
        isOpen={showIndicatorsModal}
        onClose={() => setShowIndicatorsModal(false)}
        activeIndicators={currentIndicators}
        customIndicators={customIndicatorDefs}
        onToggleIndicator={handleToggleIndicator}
        onRemoveIndicator={handleRemoveIndicator}
        onOpenStrategy={handleOpenStrategy}
        onOpenCustomModal={handleOpenCustomModal}
        onEditCustomIndicator={handleEditCustomIndicator}
      />

      <CustomIndicatorModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onSave={handleSaveCustomIndicator}
        editDef={editCustomDef}
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
  indicatorConfigs,
}: {
  symbol: string;
  timeframe: number;
  chartType: ChartType;
  positions: any[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
  indicatorConfigs: IndicatorConfig[];
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
      indicatorConfigs={indicatorConfigs}
    />
  );
}
