import { PanelLeft, LineChart, Settings } from "lucide-react";
import type { SimulatorState } from "../../hooks/useSimulator";

interface HeaderProps {
  simState: SimulatorState;
  isConnected: boolean;
  onOpenSettings: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Header({ simState, isConnected, onOpenSettings, sidebarOpen, onToggleSidebar }: HeaderProps) {
  return (
    <header className="h-14 flex items-center justify-between px-4 bg-[#09090b] border-b border-zinc-800 z-30">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <PanelLeft size={20} />
        </button>
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
          <LineChart size={18} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isConnected ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className={`text-xs font-semibold uppercase tracking-wider ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
            {isConnected ? 'Live' : 'Offline'}
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
