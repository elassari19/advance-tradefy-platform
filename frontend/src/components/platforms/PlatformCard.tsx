import { Wallet } from "lucide-react";
import type { PlatformDef } from "../../types/platforms";

interface PlatformCardProps {
  platform: PlatformDef;
  connectionCount: number;
  onConnect: (platformId: string) => void;
}

export function PlatformCard({ platform, connectionCount, onConnect }: PlatformCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
          <Wallet size={20} className="text-zinc-400 shrink-0" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{platform.name}</h3>
          <p className="text-[10px] text-zinc-500 font-mono">{platform.ccxtId}</p>
        </div>
        {connectionCount > 0 && (
          <span className="shrink-0 px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded text-[10px] font-bold text-green-500 uppercase">
            {connectionCount}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{platform.description}</p>
      <button
        onClick={() => onConnect(platform.id)}
        className="w-full py-2 bg-lime-600 hover:bg-lime-500 text-white text-xs font-bold rounded-lg transition-colors"
      >
        Connect
      </button>
    </div>
  );
}
