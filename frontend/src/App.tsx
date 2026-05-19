import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, ChevronDown, BarChart3, FlaskConical, AlertTriangle, Loader2, Radio, Pause, Settings, ScrollText, BarChartHorizontal, FileText, ListTodo, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useMarketDataForSymbol } from "./hooks/useMarketData";
import { useSimulator } from "./hooks/useSimulator";
import { useBacktest } from "./hooks/useBacktest";
import { Chart, type Drawing } from "./components/Chart";
import { OrderPanel } from "./components/order/OrderPanel";
import { TerminalTabs } from "./components/terminal/TerminalTabs";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { WebhookSettings } from "./components/settings/WebhookSettings";
import { SymbolSearchModal } from "./components/settings/SymbolSearchModal";
import { TimeframeModal } from "./components/settings/TimeframeModal";
import { AIChat } from "./components/chat/AIChat";
import { IndicatorPanel } from "./components/indicators/IndicatorPanel";
import { CustomIndicatorModal } from "./components/CustomIndicatorModal";
import { StrategyBrowser } from "./components/terminal/StrategyBrowser";
import { AlertCreator } from "./components/alerts/AlertCreator";
import { AlertsList } from "./components/alerts/AlertsList";
import { TesterSettings } from "./components/backtest/TesterSettings";
import { TesterResults } from "./components/backtest/TesterResults";
import { TesterReport } from "./components/backtest/TesterReport";
import { TesterJournal } from "./components/backtest/TesterJournal";
import { TesterToolbar } from "./components/backtest/TesterToolbar";
import { VisualBacktestChart } from "./components/backtest/VisualBacktestChart";
import { DrawingToolbar } from "./components/DrawingToolbar";
import type { DrawingTool } from "./components/DrawingToolbar";
import type { WebhookConfig } from "./hooks/useSimulator";
import type { IndicatorConfig, CustomIndicatorDef } from "./utils/indicators";
import type { BacktestResult, BacktestRequest, BacktestTrade, BacktestEvent, TestingMode, BacktestProgress } from "./hooks/useBacktest";
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

const BacktestChartPanel = ({
  symbol,
  timeframe,
  chartType,
  backtestTrades,
  showBacktestOverlay,
  backtestCursorTime,
}: {
  symbol: string;
  timeframe: number;
  chartType: ChartType;
  backtestTrades?: BacktestTrade[];
  showBacktestOverlay?: boolean;
  backtestCursorTime?: number;
}) => {
  const { candles, isInitializing } = useMarketDataForSymbol(symbol, timeframe);
  const noop = useCallback(() => {}, []);

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
      positions={[]}
      onUpdatePosition={noop}
      chartType={chartType}
      indicatorConfigs={[]}
      backtestTrades={backtestTrades}
      showBacktestOverlay={showBacktestOverlay}
      backtestCursorTime={backtestCursorTime}
    />
  );
};

export function App() {
  const [view, setView] = useState<View>('trade');
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  const [activeTesterTab, setActiveTesterTab] = useState<string>('settings');
  const [backtestEvents, setBacktestEvents] = useState<BacktestEvent[]>([]);
  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const [visualBacktestAllCandles, setVisualBacktestAllCandles] = useState<any[]>([]);
  const [prepDataStatus, setPrepDataStatus] = useState<string>('');
  const [showStrategyBrowser, setShowStrategyBrowser] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [toasts, setToasts] = useState<Array<{id: string; message: string; type: 'error' | 'success' | 'info'}>>([]);
  const [showBacktestOverlay, setShowBacktestOverlay] = useState(false);
  const [orderPanelOpen, setOrderPanelOpen] = useState(true);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pointer');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const backtestTradesRef = useRef<BacktestTrade[]>([]);
  const [backtestTradesState, setBacktestTradesState] = useState<BacktestTrade[]>([]);
  const [backtestLiveMode, setBacktestLiveMode] = useState(false);
  const [backtestSpeed, setBacktestSpeed] = useState(1);
  const [liveBacktestProgress, setLiveBacktestProgress] = useState(0);
  const [liveBacktestRunning, setLiveBacktestRunning] = useState(false);
  const [liveBacktestPaused, setLiveBacktestPaused] = useState(false);
  const [lastBacktestSymbol, setLastBacktestSymbol] = useState('');
  const [lastBacktestTimeframe, setLastBacktestTimeframe] = useState('');
  const [backtestTotalCandles, setBacktestTotalCandles] = useState(0);
  const [backtestCursorTime, setBacktestCursorTime] = useState<number | undefined>(undefined);
  const backtestWsRef = useRef<WebSocket | null>(null);
  const backtestContainerRef = useRef<HTMLDivElement>(null);
  const [backtestSplitRatio, setBacktestSplitRatio] = useState(0.67);
  const isDragging = useRef(false);

  // ── Alert State ──
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [showAlertCreator, setShowAlertCreator] = useState(false);
  const [editingAlert, setEditingAlert] = useState<AlertRule | null>(null);
  const [notificationSent, setNotificationSent] = useState<Set<string>>(new Set());
  const alertWsRef = useRef<WebSocket | null>(null);

  const { state: simState, placeOrder, updatePosition, closePosition, deployStrategy, removeStrategy, fetchActiveStrategies, saveWebhooks, fetchWebhooks, fetchAlerts, saveAlert, deleteAlert, fetchWebhookLogs } = useSimulator();
  const { runBacktest, saveBacktest, prepareData, running: backtestRunning, error: backtestError } = useBacktest();

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
          
          if (!notificationSent.has(data.rule_id + data.timestamp)) {
            if (window.electronAPI) {
              window.electronAPI.showNotification(`Alert: ${data.rule_name}`, data.message);
            } else if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`Alert: ${data.rule_name}`, {
                body: data.message,
                icon: '/favicon.svg',
              });
            }
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

  // ── Request notification permission (web only) ──
  useEffect(() => {
    if (!window.electronAPI && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Resize handler for backtest split panes
  useEffect(() => {
    let rafId: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const container = backtestContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        let ratio = (e.clientY - rect.top) / rect.height;
        ratio = Math.max(0.2, Math.min(0.7, ratio));
        setBacktestSplitRatio(ratio);
      });
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

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
    setBacktestEvents([]);
    setCurrentBarIndex(0);
    setVisualBacktestAllCandles([]);
    setActiveTesterTab('journal');

    const isVisual = req.visual;

    // Step 1: Prepare data
    if (prepareData || window.electronAPI) {
      setPrepDataStatus('Preparing data...');
      const prepReq = {
        symbol: req.symbol,
        timeframe: req.timeframe,
        testing_mode: req.testing_mode || 'EveryTick',
        start_time: req.start_time,
        end_time: req.end_time,
      };
      const prep = window.electronAPI
        ? await window.electronAPI.prepareBacktestData(prepReq)
        : await prepareData(prepReq);
      if (prep) {
        setBacktestTotalCandles(prep.total_candles);
        setPrepDataStatus(`Data ready: ${prep.total_candles} candles, ${prep.total_ticks} ticks`);
      } else {
        setPrepDataStatus('');
      }
    }

    if (isVisual) {
      setLiveBacktestRunning(true);
      setLiveBacktestProgress(0);
      backtestTradesRef.current = [];
      setBacktestTradesState([]);
      setLastBacktestSymbol(req.symbol);
      setLastBacktestTimeframe(req.timeframe);

      // Fetch candles for visual display
      try {
        const data = window.electronAPI
          ? await window.electronAPI.fetchBacktestHistory({ symbol: req.symbol, interval: req.timeframe, limit: 500 })
          : await fetch(`http://127.0.0.1:3000/api/history?symbol=${req.symbol}&interval=${req.timeframe}&limit=500`).then(r => r.ok ? r.json() : []);
        if (Array.isArray(data)) {
          setVisualBacktestAllCandles(data.map((c: any) => ({
            time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          })));
        }
      } catch {}

      // ── Handle incoming progress data (shared between IPC & fallback) ──
      // Backend BacktestProgress format: {progress, trades, equity_curve, events, current_candle, done, summary}
      // Error format: {error: "..."}
      const handleProgressData = (data: any, finalTradesRef: { current: BacktestTrade[] }) => {
        try {
          // Error
          if (data.error) {
            addToast(data.error, 'error');
            setLiveBacktestRunning(false);
            setPrepDataStatus('');
            return;
          }

          // Done / final message
          if (data.done) {
            console.log('[backtest-renderer] DONE received, trades:', finalTradesRef.current.length, 'hasSummary:', !!data.summary);
            if (data.summary) {
              // Completed with results
              setBacktestResult({
                summary: data.summary,
                trades: finalTradesRef.current,
                equity_curve: data.equity_curve || [],
                events: data.events || [],
                request: req as any,
              });
              setActiveTesterTab('results');
              if (window.electronAPI) {
                window.electronAPI.showNotification('Backtest Complete', `${finalTradesRef.current.length} trades, ${data.summary.net_profit >= 0 ? '+' : ''}$${data.summary.net_profit.toFixed(2)} profit`);
              }
            }
            setLiveBacktestRunning(false);
            setLiveBacktestProgress(1);
            setBacktestCursorTime(undefined);
            setPrepDataStatus('');
            addToast(`Backtest complete: ${finalTradesRef.current.length} trades`, 'success');
            return;
          }

          // Progress message
          console.log('[backtest-renderer] PROGRESS:', data.progress, 'hasCurrentCandle:', !!data.current_candle, 'trades:', data.trades?.length, 'events:', data.events?.length);
          setLiveBacktestProgress(data.progress);
          if (data.current_candle) {
            setCurrentBarIndex(prev => prev + 1);
          }
          if (data.equity_curve && data.equity_curve.length > 0) {
            const last = data.equity_curve[data.equity_curve.length - 1];
            setBacktestCursorTime(last.time);
          }
          if (data.events) {
            setBacktestEvents(prev => [...prev, ...data.events]);
          }
          if (data.trades) {
            finalTradesRef.current = data.trades;
            backtestTradesRef.current = data.trades;
            setBacktestTradesState(data.trades);
          }
        } catch (e) {
          console.error('[backtest-renderer] Error in handleProgressData:', e);
        }
      };

      // ── Direct WebSocket (streaming progress from Rust backend) ──
      const ws = new WebSocket('ws://127.0.0.1:3000/ws/backtest');
      backtestWsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify(req));

      const finalTradesRef: { current: BacktestTrade[] } = { current: [] };

      ws.onmessage = (event) => handleProgressData(JSON.parse(event.data), finalTradesRef);

      ws.onerror = () => {
        addToast('WebSocket connection failed', 'error');
        setLiveBacktestRunning(false);
        setPrepDataStatus('');
      };

      ws.onclose = () => {
        setLiveBacktestRunning(false);
        setLiveBacktestPaused(false);
        setBacktestCursorTime(undefined);
        setPrepDataStatus('');
        backtestWsRef.current = null;
      };
    } else {
      const result = await runBacktest(req);
      if (result) {
        setBacktestResult(result);
        const trades = result.trades || [];
        backtestTradesRef.current = trades;
        setBacktestTradesState(trades);
        setLastBacktestSymbol(req.symbol);
        setLastBacktestTimeframe(req.timeframe);
        if (result.events) setBacktestEvents(result.events);
        setActiveTesterTab('results');
        setPrepDataStatus('');
        addToast('Backtest completed successfully', 'success');
      }
    }
  }, [runBacktest, addToast, backtestLiveMode, setView, prepareData]);

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
      <Sidebar view={view} onViewChange={setView} isOpen={sidebarOpen} alertCount={alerts.length} />
      <div className={`h-full ${sidebarOpen ? 'ml-14' : ''}`}>
      <Header
        simState={simState}
        isConnected={isConnected}
        onOpenSettings={() => setShowSettings(true)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      {view === 'trade' && (
        <div className="h-[calc(100vh-56px)] flex">
          <main className="flex-1 flex flex-col overflow-hidden bg-[#09090b]">
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
                  onClick={() => setOrderPanelOpen(!orderPanelOpen)}
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 transition-colors border border-zinc-700"
                >
                  {orderPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                </button>
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

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-h-0 relative">
                  <DrawingToolbar
                    activeTool={drawingTool}
                    onToolChange={setDrawingTool}
                    onClearAll={() => setDrawings([])}
                  />
                  <TabChart
                    key={activeSymbol}
                    symbol={activeSymbol}
                    timeframe={timeframe}
                    chartType={chartType}
                    positions={simState.open_positions}
                    onUpdatePosition={updatePosition}
                    indicatorConfigs={currentIndicators}
                    backtestTrades={backtestTradesState}
                  backtestCursorTime={backtestCursorTime}
                    showBacktestOverlay={showBacktestOverlay}
                    backtestCursorTime={backtestCursorTime}
                    drawingTool={drawingTool}
                    drawings={drawings}
                    onDrawingsChange={setDrawings}
                  />
                </div>

                <motion.div
                  animate={{ width: orderPanelOpen ? 300 : 0, opacity: orderPanelOpen ? 1 : 0 }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                  className="overflow-hidden shrink-0"
                >
                  <OrderPanel
                    balance={simState.balance}
                    onPlaceOrder={placeOrder}
                    symbol={activeSymbol.replace('/', '')}
                  />
                </motion.div>
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
          </main>
        </div>
      )}

      {view === 'backtest' && (
        <div ref={backtestContainerRef} className="h-[calc(100vh-56px)] flex flex-col overflow-hidden bg-[#09090b]">
          {/* Top section: Chart (always visible, resizable) */}
          <div
            className="shrink-0 overflow-hidden flex flex-col"
            style={{ height: `${backtestSplitRatio * 100}%` }}
          >
            <div className="flex-1 min-h-0 relative">
              <div className={`absolute inset-0 ${(liveBacktestRunning || liveBacktestPaused) && visualBacktestAllCandles.length > 0 ? '' : 'hidden'}`}>
                <VisualBacktestChart
                  allCandles={visualBacktestAllCandles}
                  currentBarIndex={currentBarIndex}
                  trades={backtestTradesState}
                  cursorTime={backtestCursorTime}
                  symbol={lastBacktestSymbol || activeSymbol.replace('/', '')}
                />
              </div>
              <div className={`absolute inset-0 ${(liveBacktestRunning || liveBacktestPaused) && visualBacktestAllCandles.length > 0 ? 'hidden' : ''}`}>
                <BacktestChartPanel
                  symbol={activeSymbol}
                  timeframe={timeframe}
                  chartType={chartType}
                  backtestTrades={backtestTradesState}
                  showBacktestOverlay={showBacktestOverlay}
                  backtestCursorTime={backtestCursorTime}
                />
              </div>
            </div>
          </div>

          {/* Drag handle */}
          <div
            className="shrink-0 h-2 cursor-row-resize bg-transparent hover:bg-blue-500/20 active:bg-blue-500/30 relative flex items-center justify-center transition-colors group z-10"
            onMouseDown={() => {
              isDragging.current = true;
              document.body.style.cursor = 'row-resize';
              document.body.style.userSelect = 'none';
            }}
          >
            <div className="w-8 h-0.5 rounded-full bg-zinc-700 group-hover:bg-blue-400 transition-colors" />
          </div>

          {/* Bottom section: toolbar + tabs + content */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Visual mode toolbar (below chart during live playback) */}
            {liveBacktestRunning && (
              <div className="shrink-0 px-4 py-2 border-b border-zinc-800">
                <TesterToolbar
                  running={liveBacktestRunning}
                  paused={liveBacktestPaused}
                  progress={liveBacktestProgress}
                  currentBar={currentBarIndex}
                  totalBars={backtestTotalCandles || visualBacktestAllCandles.length}
                  currentTime={backtestCursorTime ? new Date(backtestCursorTime * 1000).toISOString().slice(0, 16).replace('T', ' ') : undefined}
                  speed={backtestSpeed}
                  onPlay={() => {
                    if (liveBacktestPaused) {
                      backtestWsRef.current?.send(JSON.stringify({ type: 'continue' }));
                      setLiveBacktestPaused(false);
                    } else if (!liveBacktestRunning) {
                      // Re-run logic
                    }
                  }}
                  onPause={() => backtestWsRef.current?.send(JSON.stringify({ type: 'pause' }))}
                  onStop={() => backtestWsRef.current?.send(JSON.stringify({ type: 'stop' }))}
                  onStepBack={() => backtestWsRef.current?.send(JSON.stringify({ type: 'step', direction: -1 }))}
                  onStepForward={() => backtestWsRef.current?.send(JSON.stringify({ type: 'step', direction: 1 }))}
                  onSpeedChange={(s) => {
                    setBacktestSpeed(s);
                    backtestWsRef.current?.send(JSON.stringify({ type: 'speed', speed: s }));
                  }}
                />
              </div>
            )}

            {/* Tab Bar (below chart) */}
            <div className="flex items-center border-b border-zinc-800 bg-[#09090b] shrink-0 overflow-x-auto">
              {[
                { id: 'settings', label: 'Settings', icon: Settings },
                { id: 'results', label: 'Results', icon: BarChartHorizontal },
                { id: 'report', label: 'Report', icon: FileText },
                { id: 'journal', label: 'Journal', icon: ListTodo },
              ].map(tab => {
                const isActive = activeTesterTab === tab.id;
                const showTab = tab.id === 'settings' || tab.id === 'journal' || (backtestResult && tab.id !== 'settings');
                if (!showTab) return null;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTesterTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-r border-zinc-800 transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-zinc-900 text-white border-b-2 border-b-blue-500'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                    }`}
                  >
                    <tab.icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content (below tab bar) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTesterTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="h-full"
                >
                {activeTesterTab === 'settings' && (
                  <TesterSettings
                    strategyCode={currentStrategyCode}
                    onRun={handleBacktestRun}
                    running={backtestRunning || liveBacktestRunning}
                    onLoadStrategy={handleLoadStrategy}
                  />
                )}
                  {activeTesterTab === 'results' && backtestResult && (
                    <TesterResults result={backtestResult} />
                  )}
                  {activeTesterTab === 'report' && backtestResult && (
                    <TesterReport result={backtestResult} />
                  )}
                  {activeTesterTab === 'journal' && (
                    <div className="h-full flex flex-col" style={{ minHeight: '300px' }}>
                      <TesterJournal events={backtestEvents} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Prep data status */}
            {prepDataStatus && !liveBacktestRunning && (
              <div className="shrink-0 px-4 py-2 border-t border-zinc-800">
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-[10px] text-zinc-400">
                  {prepDataStatus}
                </div>
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
        <div className="h-[calc(100vh-56px)]">
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
      {(backtestResult || backtestTradesState.length > 0) && view === 'trade' && (
        <button
          onClick={() => setShowBacktestOverlay(!showBacktestOverlay)}
          className={`fixed bottom-[200px] z-10 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            orderPanelOpen ? 'right-[320px]' : 'right-4'
          } ${
            showBacktestOverlay
              ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
              : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {showBacktestOverlay ? 'Hide Trades' : 'Show Trades'}
        </button>
      )}
      </div>
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
  backtestCursorTime,
  drawingTool,
  drawings,
  onDrawingsChange,
}: {
  symbol: string;
  timeframe: number;
  chartType: ChartType;
  positions: any[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
  indicatorConfigs: IndicatorConfig[];
  backtestTrades?: BacktestTrade[];
  showBacktestOverlay?: boolean;
  backtestCursorTime?: number;
  drawingTool?: DrawingTool;
  drawings?: Drawing[];
  onDrawingsChange?: (drawings: Drawing[]) => void;
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
      backtestCursorTime={backtestCursorTime}
      drawingTool={drawingTool}
      drawings={drawings}
      onDrawingsChange={onDrawingsChange}
    />
  );
}
