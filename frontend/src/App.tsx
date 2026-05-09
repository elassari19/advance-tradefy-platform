import { LayoutPanelLeft, LineChart } from "lucide-react";
import { useMarketData } from "./hooks/useMarketData";
import { useSimulator } from "./hooks/useSimulator";
import { Chart } from "./components/Chart";
import { OrderPanel } from "./components/order/OrderPanel";
import { TerminalTabs } from "./components/terminal/TerminalTabs";

export function App() {
  const { lastTick, ticks, isConnected } = useMarketData();
  const { state: simState, placeOrder, updatePosition, closePosition } = useSimulator();

  return (
    <div className="terminal-grid h-screen w-screen bg-[#09090b] text-[#fafafa] font-sans grid grid-cols-[280px_1fr_300px] grid-rows-[64px_1fr]">
      {/* Header */}
      <header className="col-span-3 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <LineChart size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Tradefy</h1>
            <span className="text-[10px] text-zinc-500 font-mono">v0.1.0-alpha</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isConnected ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
              {isConnected ? 'Market Live' : 'Market Offline'}
            </span>
          </div>
          <div className="text-sm font-mono bg-zinc-900 px-4 py-1.5 rounded-md border border-zinc-800 flex items-center gap-3">
            <span className="text-zinc-500">Equity:</span>
            <span className={`${simState.equity >= simState.balance ? 'text-green-400' : 'text-red-400'} font-bold`}>
              ${simState.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </header>

      {/* Left Sidebar - AI Chat Placeholder */}
      <aside className="border-r border-zinc-800 p-4 bg-zinc-950/50 flex flex-col">
        <div className="flex items-center gap-2 mb-6 px-2">
          <LayoutPanelLeft size={18} className="text-zinc-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">AI Assistant</h2>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-2">
          <div className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300">
             Welcome to Tradefy. I am your trading assistant. I can help you build strategies and analyze market data.
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

      {/* Main Area */}
      <main className="flex flex-col overflow-hidden bg-[#09090b] p-6 gap-6">
        <div className="flex items-center justify-between mb-2">
           <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-500 font-mono">BTC / USDT</span>
                <span className="text-2xl font-bold font-mono text-white">
                  {lastTick ? lastTick.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}
                </span>
              </div>
              <div className="h-8 w-px bg-zinc-800 mx-2" />
              <div className="flex flex-col">
                <span className="text-xs text-zinc-500 font-mono">24h Change</span>
                <span className="text-sm font-mono text-green-400 font-bold">+2.45%</span>
              </div>
           </div>
           
           <div className="flex gap-2">
             <button className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-medium hover:bg-zinc-800 transition-colors">1m</button>
             <button className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs font-medium text-blue-400">5m</button>
             <button className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-medium hover:bg-zinc-800 transition-colors">15m</button>
             <button className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-medium hover:bg-zinc-800 transition-colors">1h</button>
           </div>
        </div>

        <Chart 
          ticks={ticks} 
          positions={simState.open_positions} 
          onUpdatePosition={updatePosition} 
        />

        <TerminalTabs 
          positions={simState.open_positions} 
          history={simState.history} 
          onClosePosition={closePosition}
          onUpdatePosition={updatePosition}
        />
      </main>

      {/* Right Sidebar - Order Panel */}
      <OrderPanel 
        balance={simState.balance} 
        onPlaceOrder={placeOrder} 
        symbol="BTCUSDT" 
      />
    </div>
  );
}

// No default export
