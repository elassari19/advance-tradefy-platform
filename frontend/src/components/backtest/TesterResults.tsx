import React, { useState, useMemo } from 'react';
import { Download, ChevronDown, ChevronUp, Filter, Copy } from 'lucide-react';
import type { BacktestResult, BacktestTrade } from '../../hooks/useBacktest';

interface TesterResultsProps {
  result: BacktestResult;
}

type SortField = '#' | 'time' | 'type' | 'symbol' | 'volume' | 'open' | 'close' | 'commission' | 'swap' | 'profit' | 'balance';
type SortDir = 'asc' | 'desc';
type FilterType = 'all' | 'buy' | 'sell';

export const TesterResults: React.FC<TesterResultsProps> = ({ result }) => {
  const { summary, trades } = result;
  const [sortField, setSortField] = useState<SortField>('#');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const formatCurrency = (v: number) => {
    const abs = Math.abs(v);
    const str = abs >= 1000
      ? '$' + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '$' + abs.toFixed(2);
    return v < 0 ? '-' + str : str;
  };

  const formatPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

  const filteredTrades = useMemo(() => {
    let list = [...trades];
    if (filterType === 'buy') list = list.filter(t => t.side.toLowerCase() === 'buy');
    else if (filterType === 'sell') list = list.filter(t => t.side.toLowerCase() === 'sell');
    return list;
  }, [trades, filterType]);

  const sortedTrades = useMemo(() => {
    const list = [...filteredTrades];
    list.sort((a, b) => {
      let cmp = 0;
      const aIdx = trades.indexOf(a);
      const bIdx = trades.indexOf(b);
      switch (sortField) {
        case '#': cmp = aIdx - bIdx; break;
        case 'time': cmp = a.opened_at - b.opened_at; break;
        case 'type': cmp = a.side.localeCompare(b.side); break;
        case 'volume': cmp = a.quantity - b.quantity; break;
        case 'open': cmp = a.entry_price - b.entry_price; break;
        case 'close': cmp = (a.exit_price || 0) - (b.exit_price || 0); break;
        case 'profit': cmp = a.pnl - b.pnl; break;
        case 'balance': cmp = (a.pnl || 0) - (b.pnl || 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredTrades, sortField, sortDir, trades]);

  const pageCount = Math.ceil(sortedTrades.length / pageSize);
  const pageTrades = sortedTrades.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) sortDir === 'asc' ? setSortDir('desc') : setSortDir('asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const copyEntry = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const copyAll = async () => {
    const headers = ['#', 'Time', 'Type', 'Volume', 'Open Price', 'SL', 'TP', 'Close Price', 'Commission', 'Swap', 'Profit', 'Balance'];
    const rows = trades.map((t, i) => [
      i + 1,
      new Date(t.opened_at * 1000).toISOString().slice(0, 16).replace('T', ' '),
      t.side, t.quantity.toFixed(4),
      t.entry_price.toFixed(2),
      t.stop_loss?.toFixed(2) || '-',
      t.take_profit?.toFixed(2) || '-',
      t.exit_price?.toFixed(2) || '-',
      '0', '0',
      t.pnl.toFixed(2),
      '0',
    ].join('\t'));
    const text = [headers.join('\t'), ...rows].join('\n');
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const exportHTML = async () => {
    const rows = trades.map((t, i) => `<tr>
      <td>${i + 1}</td>
      <td>${new Date(t.opened_at * 1000).toISOString().slice(0, 16).replace('T', ' ')}</td>
      <td>${t.side}</td>
      <td>${t.quantity.toFixed(4)}</td>
      <td>${t.entry_price.toFixed(2)}</td>
      <td>${t.stop_loss?.toFixed(2) || '-'}</td>
      <td>${t.take_profit?.toFixed(2) || '-'}</td>
      <td>${t.exit_price?.toFixed(2) || '-'}</td>
      <td class="${t.pnl >= 0 ? 'green' : 'red'}">${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</td>
    </tr>`).join('\n');
    const html = `<!DOCTYPE html><html><head><style>
      body { font-family: monospace; background: #09090b; color: #e4e4e7; padding: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 6px 10px; border: 1px solid #27272a; text-align: left; font-size: 12px; }
      th { background: #18181b; color: #a1a1aa; font-weight: 600; }
      .green { color: #22c55e; } .red { color: #ef4444; }
      h2 { color: #fafafa; } .summary { display: flex; gap: 16px; margin-bottom: 16px; }
      .stat { background: #18181b; padding: 8px 12px; border-radius: 6px; border: 1px solid #27272a; }
      .stat-label { font-size: 10px; color: #71717a; } .stat-value { font-size: 14px; font-weight: bold; }
    </style></head><body>
      <h2>Backtest Report</h2>
      <div class="summary">
        <div class="stat"><div class="stat-label">Net Profit</div><div class="stat-value" style="color:${summary.net_profit >= 0 ? '#22c55e' : '#ef4444'}">${formatCurrency(summary.net_profit)}</div></div>
        <div class="stat"><div class="stat-label">Win Rate</div><div class="stat-value">${(summary.win_rate).toFixed(1)}%</div></div>
        <div class="stat"><div class="stat-label">Total Trades</div><div class="stat-value">${summary.total_trades}</div></div>
        <div class="stat"><div class="stat-label">Profit Factor</div><div class="stat-value">${summary.profit_factor.toFixed(2)}</div></div>
      </div>
      <table><thead><tr><th>#</th><th>Time</th><th>Type</th><th>Volume</th><th>Open Price</th><th>SL</th><th>TP</th><th>Close Price</th><th>Profit</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;

    if (window.electronAPI) {
      await window.electronAPI.saveHtmlReport(html);
    } else {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backtest-results.html';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-400">
            {summary.total_trades} trades · {summary.winning_trades}W / {summary.losing_trades}L · {summary.win_rate.toFixed(1)}% win rate
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            {(['all', 'buy', 'sell'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => { setFilterType(f); setPage(0); }}
                className={`px-2.5 py-1 text-[10px] font-bold transition-all ${
                  filterType === f
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f === 'all' ? 'All' : f === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          <button
            onClick={copyAll}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
          >
            <Copy size={12} />
            Copy All
          </button>
          <button
            onClick={exportHTML}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
          >
            <Download size={12} />
            Save HTML
          </button>
        </div>
      </div>

      {sortedTrades.length > 0 ? (
        <>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono">
              <thead className="bg-zinc-900/50 text-zinc-500 sticky top-0">
                <tr>
                  {[
                    { key: '#' as SortField, label: '#' },
                    { key: 'time' as SortField, label: 'Time' },
                    { key: 'type' as SortField, label: 'Type' },
                    { key: 'volume' as SortField, label: 'Volume' },
                    { key: 'open' as SortField, label: 'Open Price' },
                    { key: '#2' as SortField, label: 'SL' },
                    { key: '#3' as SortField, label: 'TP' },
                    { key: 'close' as SortField, label: 'Close Price' },
                    { key: '#4' as SortField, label: 'Comm.' },
                    { key: '#5' as SortField, label: 'Swap' },
                    { key: 'profit' as SortField, label: 'Profit' },
                    { key: 'balance' as SortField, label: 'Balance' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => ['#', 'time', 'type', 'volume', 'open', 'close', 'profit', 'balance'].includes(col.key) ? toggleSort(col.key) : null}
                      className={`px-2 py-2 font-medium select-none whitespace-nowrap ${['#', 'time', 'type', 'volume', 'open', 'close', 'profit', 'balance'].includes(col.key) ? 'cursor-pointer hover:text-zinc-300' : ''}`}
                    >
                      {col.label}{sortIndicator(col.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {pageTrades.map((t, i) => {
                  const idx = trades.indexOf(t);
                  const isExpanded = expandedRow === t.id;
                  return (
                    <React.Fragment key={t.id}>
                      <tr
                        onClick={() => setExpandedRow(isExpanded ? null : t.id)}
                        className="hover:bg-zinc-900/30 transition-colors cursor-pointer"
                      >
                        <td className="px-2 py-2 text-zinc-500">{idx + 1}</td>
                        <td className="px-2 py-2 text-zinc-400 text-[10px]">
                          {new Date(t.opened_at * 1000).toISOString().slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className={`px-2 py-2 font-bold ${t.side.toLowerCase() === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                          {t.side}
                        </td>
                        <td className="px-2 py-2 text-zinc-300">{t.quantity.toFixed(4)}</td>
                        <td className="px-2 py-2 text-zinc-300">{t.entry_price.toFixed(2)}</td>
                        <td className="px-2 py-2 text-zinc-500">{t.stop_loss?.toFixed(2) || '-'}</td>
                        <td className="px-2 py-2 text-zinc-500">{t.take_profit?.toFixed(2) || '-'}</td>
                        <td className="px-2 py-2 text-zinc-300">{t.exit_price?.toFixed(2) || '-'}</td>
                        <td className="px-2 py-2 text-zinc-500">0</td>
                        <td className="px-2 py-2 text-zinc-500">0</td>
                        <td className={`px-2 py-2 font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-zinc-300">
                          {formatCurrency(summary.initial_balance + (trades.slice(0, idx + 1).reduce((s, tt) => s + tt.pnl, 0)))}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-900/20">
                          <td colSpan={12} className="px-4 py-3">
                            <div className="grid grid-cols-4 gap-3">
                              <div>
                                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Entry Price</div>
                                <div className="text-xs font-mono text-zinc-200">${t.entry_price.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Exit Price</div>
                                <div className="text-xs font-mono text-zinc-200">${t.exit_price?.toFixed(2) || '-'}</div>
                              </div>
                              <div>
                                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">PnL %</div>
                                <div className={`text-xs font-mono ${t.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Exit Reason</div>
                                <div className="text-xs font-mono text-zinc-200">{t.exit_reason}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded text-[10px] font-bold bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-[10px] text-zinc-500">
                {page + 1} / {pageCount}
              </span>
              <button
                disabled={page >= pageCount - 1}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded text-[10px] font-bold bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-sm text-zinc-500">No trades to display</p>
        </div>
      )}
    </div>
  );
};
