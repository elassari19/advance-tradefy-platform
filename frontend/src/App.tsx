import { LayoutPanelLeft, LineChart, Activity } from "lucide-react";
import { useMarketData } from "./hooks/useMarketData";
import { Chart } from "./components/Chart";

function App() {
  const { lastTick, ticks, isConnected } = useMarketData();

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
            <span className="text-zinc-500">Balance:</span>
            <span className="text-green-400 font-bold">$10,000.00</span>
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

        <Chart ticks={ticks} />

        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col">
           <div className="flex border-b border-zinc-800">
             <button className="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 border-blue-500 text-blue-400">Positions</button>
             <button className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors">History</button>
             <button className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors">Logs</button>
           </div>
           <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm italic">
             No active positions
           </div>
        </div>
      </main>

      {/* Right Sidebar - Order Panel */}
      <aside className="border-l border-zinc-800 p-6 bg-zinc-950/50 flex flex-col gap-6">
        <div className="flex items-center gap-2 px-2">
          <Activity size={18} className="text-zinc-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Order Terminal</h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button className="py-3 bg-zinc-900 border border-zinc-800 rounded-lg font-bold text-sm hover:bg-zinc-800 transition-all active:scale-95">LIMIT</button>
            <button className="py-3 bg-blue-600 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 active:scale-95">MARKET</button>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Size (BTC)</label>
            <div className="relative">
              <input type="number" defaultValue="0.1" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">BTC</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Take Profit</label>
              <input type="number" placeholder="Optional" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-500/50" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Stop Loss</label>
              <input type="number" placeholder="Optional" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-500/50" />
            </div>
          </div>

          <div className="pt-4 grid grid-cols-2 gap-4">
            <button className="py-4 bg-green-600/10 border border-green-600/30 text-green-500 rounded-xl font-black text-lg hover:bg-green-600 hover:text-white transition-all active:scale-95">BUY</button>
            <button className="py-4 bg-red-600/10 border border-red-600/30 text-red-500 rounded-xl font-black text-lg hover:bg-red-600 hover:text-white transition-all active:scale-95">SELL</button>
          </div>
        </div>

        <div className="mt-auto bg-zinc-900/30 border border-zinc-800/50 p-4 rounded-xl">
           <div className="flex justify-between text-xs mb-2">
             <span className="text-zinc-500">Available</span>
             <span className="text-zinc-300 font-mono">$10,000.00</span>
           </div>
           <div className="flex justify-between text-xs mb-2">
             <span className="text-zinc-500">Margin</span>
             <span className="text-zinc-300 font-mono">$0.00</span>
           </div>
           <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
             <div className="bg-blue-600 h-full w-0"></div>
           </div>
        </div>
      </aside>
    </div>
  );
}

export default App;
