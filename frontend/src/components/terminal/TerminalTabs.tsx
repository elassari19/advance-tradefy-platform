import { useState, useEffect } from 'react';
import type { Position, TradeHistory } from "../../hooks/useSimulator";
import { X, Edit2, Check, XCircle, Terminal } from 'lucide-react';
import { globalStrategyLogs } from '../../hooks/useLiveStrategy';

interface TerminalTabsProps {
  positions: Position[];
  history: TradeHistory[];
  onClosePosition: (id: string) => void;
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
}

export const TerminalTabs: React.FC<TerminalTabsProps> = ({
  positions, history,
  onClosePosition, onUpdatePosition,
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'history' | 'strategy'>('positions');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ tp: string; sl: string }>({ tp: '', sl: '' });
  const [strategyLogs, setStrategyLogs] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setStrategyLogs([...globalStrategyLogs]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const startEdit = (pos: Position) => {
    setEditingId(pos.id);
    setEditValues({
      tp: pos.take_profit?.toString() || '',
      sl: pos.stop_loss?.toString() || '',
    });
  };

  const saveEdit = (id: string) => {
    const tpVal = editValues.tp.trim();
    const slVal = editValues.sl.trim();
    
    const tp = tpVal !== '' ? parseFloat(tpVal) : null;
    const sl = slVal !== '' ? parseFloat(slVal) : null;
    
    if ((tpVal !== '' && isNaN(tp as number)) || (slVal !== '' && isNaN(sl as number))) {
      alert('Invalid price format');
      return;
    }

    onUpdatePosition(id, tp, sl);
    setEditingId(null);
  };

  return (
    <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
      <div className="flex border-b border-zinc-800 bg-zinc-900/50">
        <button
          onClick={() => setActiveTab('positions')}
          className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'positions' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
        >
          Positions ({positions.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'history' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
        >
          History ({history.length})
        </button>
        <button
          onClick={() => setActiveTab('strategy')}
          className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'strategy' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
        >
          <Terminal size={12} className="inline mr-1" />
          Strategy Logs
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'positions' && (
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900/50 text-zinc-500 sticky top-0">
              <tr>
                <th className="px-4 py-2 font-medium">Symbol</th>
                <th className="px-4 py-2 font-medium">Side</th>
                <th className="px-4 py-2 font-medium">Entry</th>
                <th className="px-4 py-2 font-medium">Current</th>
                <th className="px-4 py-2 font-medium">Quantity</th>
                <th className="px-4 py-2 font-medium">PnL</th>
                <th className="px-4 py-2 font-medium">TP/SL</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-600 italic">No active positions</td>
                </tr>
              ) : (
                positions.map((pos) => (
                  <tr key={pos.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-zinc-300">{pos.symbol}</td>
                    <td className={`px-4 py-3 font-bold ${pos.side === 'Buy' ? 'text-green-500' : 'text-red-500'}`}>{pos.side}</td>
                    <td className="px-4 py-3 text-zinc-400">${pos.entry_price.toLocaleString()}</td>
                    <td className="px-4 py-3 text-zinc-400">${pos.current_price.toLocaleString()}</td>
                    <td className="px-4 py-3 text-zinc-400">{pos.quantity}</td>
                    <td className={`px-4 py-3 font-bold ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-zinc-500">
                      {editingId === pos.id ? (
                        <div className="flex flex-col gap-1">
                          <input 
                            type="text" 
                            className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 w-16" 
                            placeholder="TP"
                            value={editValues.tp}
                            onChange={(e) => setEditValues({ ...editValues, tp: e.target.value })}
                          />
                          <input 
                            type="text" 
                            className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 w-16" 
                            placeholder="SL"
                            value={editValues.sl}
                            onChange={(e) => setEditValues({ ...editValues, sl: e.target.value })}
                          />
                        </div>
                      ) : (
                        <>
                          {pos.take_profit ? `TP: ${pos.take_profit}` : 'TP: -'} / {pos.stop_loss ? `SL: ${pos.stop_loss}` : 'SL: -'}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {editingId === pos.id ? (
                          <>
                            <button onClick={() => saveEdit(pos.id)} className="text-green-500 hover:text-green-400">
                              <Check size={14} />
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-zinc-500 hover:text-zinc-400">
                              <XCircle size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(pos)} className="text-zinc-500 hover:text-zinc-300">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => onClosePosition(pos.id)} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors">
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'history' && (
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900/50 text-zinc-500 sticky top-0">
              <tr>
                <th className="px-4 py-2 font-medium">Symbol</th>
                <th className="px-4 py-2 font-medium">Side</th>
                <th className="px-4 py-2 font-medium">Entry/Exit</th>
                <th className="px-4 py-2 font-medium">PnL</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-600 italic">No trade history</td>
                </tr>
              ) : (
                history.map((trade) => (
                  <tr key={trade.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-zinc-300">{trade.symbol}</td>
                    <td className={`px-4 py-3 font-bold ${trade.side === 'Buy' ? 'text-green-500' : 'text-red-500'}`}>{trade.side}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      <div>E: ${trade.entry_price.toLocaleString()}</div>
                      <div>X: ${trade.exit_price.toLocaleString()}</div>
                    </td>
                    <td className={`px-4 py-3 font-bold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{trade.exit_reason}</td>
                    <td className="px-4 py-3 text-[10px] text-zinc-500">
                      {new Date(trade.closed_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'strategy' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto font-mono text-[11px] p-4 space-y-1 bg-zinc-950">
              {strategyLogs.length === 0 ? (
                <div className="text-zinc-600 italic text-center py-8">
                  No strategy logs yet. Deploy a JavaScript strategy to see logs here.
                </div>
              ) : (
                strategyLogs.map((log, i) => (
                  <div key={i} className="text-zinc-400 hover:bg-zinc-900/50 px-1 py-0.5 rounded">
                    <span className="text-zinc-600 mr-2">[{i + 1}]</span>
                    {log}
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 px-4 py-2 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">{strategyLogs.length} entries</span>
              <button
                onClick={() => setStrategyLogs([])}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
