import { Pencil, Trash2, RefreshCw, Wallet } from "lucide-react";
import type { PlatformConnection, PlatformDef } from "../../types/platforms";

interface ConnectedPlatformCardProps {
  connection: PlatformConnection;
  platformDef?: PlatformDef;
  onEdit: (connection: PlatformConnection) => void;
  onDelete: (id: string) => void;
  onTest: (connection: PlatformConnection) => void;
  isTesting: boolean;
}

const STATUS_CONFIG = {
  connected: { label: 'Connected', class: 'bg-green-500/10 text-green-500 border-green-500/20' },
  error: { label: 'Error', class: 'bg-red-500/10 text-red-500 border-red-500/20' },
  unknown: { label: 'Unknown', class: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
} as const;

export function ConnectedPlatformCard({
  connection,
  platformDef,
  onEdit,
  onDelete,
  onTest,
  isTesting,
}: ConnectedPlatformCardProps) {
  const status = STATUS_CONFIG[connection.status] ?? STATUS_CONFIG.unknown;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center gap-4 hover:border-zinc-700 transition-colors group">
      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
        <Wallet size={20} className="text-zinc-400 shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white truncate">
            {platformDef?.name ?? connection.platform_id}
          </span>
          <span className="text-xs text-zinc-500 shrink-0">·</span>
          <span className="text-xs text-zinc-300 truncate">{connection.connection_name}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${status.class}`}>
            {status.label}
          </span>
          {connection.is_testnet && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border border-yellow-500/20 bg-yellow-500/10 text-yellow-500">
              Testnet
            </span>
          )}
          {connection.last_tested_at && (
            <span className="text-[10px] text-zinc-600 shrink-0">
              Tested {new Date(connection.last_tested_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onTest(connection)}
          disabled={isTesting}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          title="Test Connection"
        >
          <RefreshCw size={14} className={isTesting ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={() => onEdit(connection)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(connection.id)}
          className="p-2 rounded-lg text-red-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
