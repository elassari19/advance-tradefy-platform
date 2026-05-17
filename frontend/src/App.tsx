import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, ChevronDown, BarChart3, FlaskConical, AlertTriangle } from "lucide-react";
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
import { OptimizationPanel } from "./components/backtest/OptimizationPanel";
import { StrategyBrowser } from "./components/terminal/StrategyBrowser";
import { AlertCreator } from "./components/alerts/AlertCreator";
import { AlertsList } from "./components/alerts/AlertsList";
import type { WebhookConfig } from "./hooks/useSimulator";
import type { IndicatorConfig, CustomIndicatorDef } from "./utils/indicators";
import type { BacktestResult, BacktestRequest } from "./hooks/useBacktest";
import type { AlertRule, TriggeredAlert, WebhookLog } from "./hooks/useSimulator";

type View = 'trade' | 'backtest' | 'script' | 'alerts';
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
  const [showStrategyBrowser, setShowStrategyBrowser] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [toasts, setToasts] = useState<Array<{id: string; message: string; type: 'error' | 'success' | 'info'}>>([]);
  const [showBacktestOverlay, setShowBacktestOverlay] = useState(false);
  const backtestTradesRef = useRef<BacktestTrade[]>([]);

  // ── Alert State ──
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [showAlertCreator, setShowAlertCreator] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null);
  const [notificationSent, setNotificationSent] = useState<Set<string>>(new Set());
  const alertWsRef = useRef<WebSocket | null>(null);

  const { state: simState, placeOrder, updatePosition, closePosition, deployStrategy, removeStrategy, fetchActiveStrategies, saveWebhooks, fetchWebhooks, fetchAlerts, saveAlert, deleteAlert, fetchWebhookLogs } = useSimulator();
  const { runBacktest, saveBacktest, running: backtestRunning, error: backtestError } = useBacktest();

  const addToast = useCallback((message: string, type: 'error' | 'success' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // Monitor backtest errors
  useEffect(() => {
    if (backtestError) {
      addToast(backtestError, 'error');
    }
  }, [backtestError, addToast]);

  // Connection status check
  useEffect(() => {
    const checkConnection = () => {
      const ws = new WebSocket('ws://127.0.0.1:3000/ws/live');
      ws.onopen = () => { setIsConnected(true); ws.close(); };
      ws.onerror = () => { setIsConnected(false); };
      ws.onclose = () => setIsConnected(false);
    };
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchWebhooks().then(setWebhooks).catch(console.error);
    fetchActiveStrategies().then(setActiveStrategySymbols).catch(console.error);
  }, [fetchWebhooks, fetchActiveStrategies]);

  // ── Fetch alerts on mount ──
  useEffect(() => {
    fetchAlerts().then(setAlerts).catch(console.error);
    fetchWebhookLogs().then(setWebhookLogs).catch(console.error);
  }, [fetchAlerts, fetchWebhookLogs]);

  // ── Alert WebSocket for browser notifications ──
  useEffect(() => {
    function connectAlertWs() {
      const ws = new WebSocket('ws://127.0.0.1:3000/ws/alerts');
      ws.onmessage = (event) => {
        try {
          const data: TriggeredAlert = JSON.parse(event.data);
          
          // Browser Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            if (!notificationSent.has(data.rule_id + data.timestamp)) {
              new Notification(`Alert: ${data.rule_name}`, {
                body: data.message,
                icon: '/vite.svg',
              });
              setNotificationSent(prev => new Set(prev).add(data.rule_id + data.timestamp));

              // Play alert sound
              try {
                const audioCtx = new AudioContext();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.value = 880;
                gain.gain.value = 0.3;
                osc.start();
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
                osc.stop(audioCtx.currentTime + 0.5);
              } catch {}
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        setTimeout(connectAlertWs, 3000);
      };
      alertWsRef.current = ws;
    }

    if (view === 'trade' || view === 'alerts') {
      connectAlertWs();
    }

    return () => {
      if (alertWsRef.current) {
        alertWsRef.current.close();
        alertWsRef.current = null;
      }
    };
  }, [view, notificationSent]);

  // ── Request notification permission ──
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const currentStrategyCode = strategyCodes[activeSymbol] ?? DEFAULT_STRATEGY_CODE;
  const currentStrategyActive = activeStrategySymbols.includes(activeSymbol.replace('/', ''));
  const currentIndicators = indicatorConfigs[activeSymbol] ?? [];

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (currentStrategyCode && currentStrategyCode !== DEFAULT_STRATEGY_CODE) {
          handleDeployStrategy(activeSymbol, currentStrategyCode);
        }
      }
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        if (view === 'trade') {
          setView('backtest');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentStrategyCode, activeSymbol, handleDeployStrategy, view]);

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
      backtestTradesRef.current = result.trades || [];
      setShowBacktestOverlay(true);
      addToast('Backtest completed successfully', 'success');
    }
  }, [runBacktest, addToast]);

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

  const handleSaveStrategy = useCallback(async (name: string, code: string) => {
    const rawSymbol = activeSymbol.replace('/', '');
    const res = await fetch('http://127.0.0.1:3000/api/strategy/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, symbol: rawSymbol, timeframe: formatTimeframe(timeframe), code }),
    });
    if (!res.ok) throw new Error('Failed to save strategy');
  }, [activeSymbol, timeframe]);

  const handleLoadStrategy = useCallback(() => {
    setShowStrategyBrowser(true);
  }, []);

  const handleOptimizeRun = useCallback(async () => {
    setOptimizeOpen(true);
  }, []);

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

  // ── Alert Handlers ──

  const handleAddAlert = useCallback(() => {
    setEditingAlert(null);
    setShowAlertCreator(true);
  }, []);

  const handleEditAlert = useCallback((alert: AlertRule) => {
    setEditingAlert(alert);
    setShowAlertCreator(true);
  }, []);

  const handleSaveAlert = useCallback(async (alert: Partial<AlertRule>) => {
    const ok = await saveAlert(alert);
    if (ok) {
      const updated = await fetchAlerts();
      setAlerts(updated);
    }
  }, [saveAlert, fetchAlerts]);

  const handleDeleteAlert = useCallback(async (id: string) => {
    const ok = await deleteAlert(id);
    if (ok) {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }
  }, [deleteAlert]);

  const handleToggleAlert = useCallback(async (alert: AlertRule) => {
    await handleSaveAlert({ ...alert, enabled: !alert.enabled });
  }, [handleSaveAlert]);

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
        isConnected={isConnected}
        onOpenSettings={() => setShowSettings(true)}
        alertCount={alerts.length}
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
                    backtestTrades={backtestTradesRef.current}
                    showBacktestOverlay={showBacktestOverlay}
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
                    onSaveStrategy={handleSaveStrategy}
                    onLoadStrategy={handleLoadStrategy}
                    focusTab={focusTab}
                    onRunBacktest={() => setView('backtest')}
                    backtestRunning={backtestRunning}
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
            <button
              onClick={() => setOptimizeOpen(!optimizeOpen)}
              className={`w-full flex items-center justify-between px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                optimizeOpen
                  ? 'bg-purple-600/10 border-purple-500/30 text-purple-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>Strategy Optimization</span>
              <ChevronDown size={14} className={`transition-transform ${optimizeOpen ? 'rotate-180' : ''}`} />
            </button>
            {optimizeOpen && (
              <OptimizationPanel
                strategyCode={currentStrategyCode}
                symbol={activeSymbol.replace('/', '')}
                timeframe="1h"
                startTime={Math.floor(new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000).getTime() / 1000)}
                endTime={Math.floor(Date.now() / 1000)}
                initialCapital={10000}
                commission={0.001}
                slippage={0.0001}
              />
            )}
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
              <BacktestResults result={backtestResult} onSave={handleBacktestSave} onShowOnChart={() => { setView('trade'); setShowBacktestOverlay(true); }} />
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

      {view === 'alerts' && (
        <div className="h-[calc(100vh-64px)]">
          <AlertsList
            alerts={alerts}
            webhookLogs={webhookLogs}
            onAdd={handleAddAlert}
            onEdit={handleEditAlert}
            onDelete={handleDeleteAlert}
            onToggle={handleToggleAlert}
          />
        </div>
      )}

      <AlertCreator
        isOpen={showAlertCreator}
        onClose={() => setShowAlertCreator(false)}
        onSave={handleSaveAlert}
        editAlert={editingAlert}
      />

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

      <StrategyBrowser
        isOpen={showStrategyBrowser}
        onClose={() => setShowStrategyBrowser(false)}
        onLoad={handleApplyCode}
      />

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-16 right-4 z-50 space-y-2 max-w-sm">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium border backdrop-blur-sm transition-all animate-in slide-in-from-right ${
                t.type === 'error' ? 'bg-red-900/90 border-red-700 text-red-100' :
                t.type === 'success' ? 'bg-green-900/90 border-green-700 text-green-100' :
                'bg-zinc-800/90 border-zinc-700 text-zinc-100'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.type === 'error' && <AlertTriangle size={14} />}
                <span>{t.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Backtest Overlay Toggle */}
      {backtestResult && view === 'trade' && (
        <button
          onClick={() => setShowBacktestOverlay(!showBacktestOverlay)}
          className={`fixed bottom-[200px] right-[320px] z-10 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            showBacktestOverlay
              ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
              : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {showBacktestOverlay ? 'Hide Trades' : 'Show Trades'}
        </button>
      )}
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
  backtestTrades,
  showBacktestOverlay,
}: {
  symbol: string;
  timeframe: number;
  chartType: ChartType;
  positions: any[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
  indicatorConfigs: IndicatorConfig[];
  backtestTrades?: BacktestTrade[];
  showBacktestOverlay?: boolean;
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
      backtestTrades={backtestTrades}
      showBacktestOverlay={showBacktestOverlay}
    />
  );
}
