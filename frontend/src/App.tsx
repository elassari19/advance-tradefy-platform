import { useState, useEffect } from "react";
import { LayoutPanelLeft, Code, FlaskConical } from "lucide-react";
import { useMarketData } from "./hooks/useMarketData";
import { useSimulator } from "./hooks/useSimulator";
import { Chart } from "./components/Chart";
import { OrderPanel } from "./components/order/OrderPanel";
import { TerminalTabs } from "./components/terminal/TerminalTabs";
import { Header } from "./components/layout/Header";
import { WebhookSettings } from "./components/settings/WebhookSettings";
import type { WebhookConfig } from "./hooks/useSimulator";

type View = 'trade' | 'backtest' | 'script';

export function App() {
  const [view, setView] = useState<View>('trade');
  const [showSettings, setShowSettings] = useState(false);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  
  const { lastTick, candles, isConnected, timeframe, setTimeframe } = useMarketData();
  const { state: simState, placeOrder, updatePosition, closePosition, deployStrategy, saveWebhooks, fetchWebhooks } = useSimulator();

  useEffect(() => {
    fetchWebhooks().then(setWebhooks).catch(console.error);
  }, [fetchWebhooks]);

  const handleSaveWebhooks = async (newWebhooks: WebhookConfig[]) => {
    await saveWebhooks(newWebhooks);
    setWebhooks(newWebhooks);
  };

  return (
    <div className="terminal-grid h-screen w-screen bg-[#09090b] text-[#fafafa] font-sans grid grid-cols-[1fr_300px] grid-rows-[64px_1fr]">
      <Header 
        view={view}
        onViewChange={setView}
        simState={simState}
        isConnected={isConnected}
        onOpenSettings={() => setShowSettings(true)}
      />

      {view === 'trade' && (
        <>
          <main className="flex flex-col overflow-hidden bg-[#09090b] p-6 gap-6">
            <Chart 
              candles={candles}
              positions={simState.open_positions} 
              onUpdatePosition={updatePosition}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              pairName="BTC/USDT"
              price={lastTick?.price}
              change24h={2.45}
            />

            <TerminalTabs 
              positions={simState.open_positions} 
              history={simState.history} 
              onClosePosition={closePosition}
              onUpdatePosition={updatePosition}
              onDeployStrategy={deployStrategy}
            />
          </main>

          <OrderPanel 
            balance={simState.balance} 
            onPlaceOrder={placeOrder} 
            symbol="BTCUSDT" 
          />
        </>
      )}

      {view === 'backtest' && (
        <main className="col-span-1 flex flex-col items-center justify-center text-center p-8">
          <FlaskConical size={64} className="text-zinc-600 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Backtest</h2>
          <p className="text-zinc-400 max-w-md">
            Run historical simulations to validate your trading strategies. 
            Configure your strategy and test it against past market data.
          </p>
        </main>
      )}

      {view === 'script' && (
        <>
          <aside className="border-r border-zinc-800 p-4 bg-zinc-950/50 flex flex-col">
            <div className="flex items-center gap-2 mb-6 px-2">
              <LayoutPanelLeft size={18} className="text-zinc-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">AI Assistant</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-2">
              <div className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300">
                Welcome to Pen Script. I can help you build trading strategies. Ask me to create an indicator, strategy, or explain market patterns.
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Ask AI anything..." 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </aside>

          <main className="col-span-1 flex flex-col">
            <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
              <Code size={18} className="text-zinc-400" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Strategy Script</h2>
            </div>
            <div className="flex-1 bg-zinc-950 p-4 overflow-auto">
              <textarea 
                className="w-full h-full bg-transparent text-zinc-300 font-mono text-sm resize-none focus:outline-none"
                placeholder="# Write your strategy here...&#10;&#10;def on_tick(price):&#10;    if price < 50000:&#10;        buy(0.1)&#10;    elif price > 60000:&#10;        sell(0.1)"
                spellCheck={false}
              />
            </div>
          </main>
        </>
      )}

      <WebhookSettings 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        webhooks={webhooks}
        onSaveWebhooks={handleSaveWebhooks}
      />
    </div>
  );
}