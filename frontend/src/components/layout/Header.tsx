import { LineChart, Settings, Bell } from "lucide-react";
import type { SimulatorState } from "../../hooks/useSimulator";

interface HeaderProps {
  view: 'trade' | 'backtest' | 'script' | 'alerts';
  onViewChange: (view: 'trade' | 'backtest' | 'script' | 'alerts') => void;
  simState: SimulatorState;
  isConnected: boolean;
  onOpenSettings: () => void;
  alertCount?: number;
}

export function Header({ view, onViewChange, simState, isConnected, onOpenSettings, alertCount }: HeaderProps) {
  return (
    <header className="col-span-3 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#09090b] z-10">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <LineChart size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Tradefy</h1>
            <span className="text-[10px] text-zinc-500 font-mono">v0.1.0-alpha</span>
          </div>
        </div>
        
        <nav className="flex items-center gap-1 ml-8">
          <button
            onClick={() => onViewChange('trade')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              view === 'trade'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Trade
          </button>
          <button
            onClick={() => onViewChange('backtest')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              view === 'backtest'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Backtest
          </button>
          <button
            onClick={() => onViewChange('script')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              view === 'script'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            Pen Script
          </button>
          <button
            onClick={() => onViewChange('alerts')}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              view === 'alerts'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Bell size={16} />
            Alerts
            {alertCount !== undefined && alertCount > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
                {alertCount}
              </span>
            )}
          </button>
        </nav>
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
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
