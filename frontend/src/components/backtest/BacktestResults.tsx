import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { Save, Download, TrendingUp, TrendingDown, AlertTriangle, DollarSign } from 'lucide-react';
import type { BacktestResult, BacktestTrade } from '../../hooks/useBacktest';

interface BacktestResultsProps {
  result: BacktestResult;
  onSave?: () => void;
  onShowOnChart?: () => void;
}

type SortField = '#' | 'side' | 'entry' | 'exit' | 'pnl' | 'pct' | 'reason' | 'duration';
type SortDir = 'asc' | 'desc';

export const BacktestResults: React.FC<BacktestResultsProps> = ({ result, onSave, onShowOnChart }) => {
  const { summary, trades, equity_curve } = result;
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<IChartApi | null>(null);
  const [sortField, setSortField] = useState<SortField>('#');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (!chartRef.current || equity_curve.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.remove();
    }

    const chart = createChart(chartRef.current, {
      height: 160,
      layout: {
        background: { color: '#09090b' },
        textColor: '#71717a',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      timeScale: {
        visible: false,
      },
      rightPriceScale: {
        visible: true,
        borderColor: '#27272a',
      },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
    });

    const series = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      priceFormat: { type: 'price', minMove: 0.01 } as any,
    });

    const data = equity_curve.map((p, i) => ({
      time: Math.floor(p.time / 86400) as any,
      value: p.equity,
    }));

    series.setData(data);
    chart.timeScale().fitContent();
    chartInstance.current = chart;

    return () => {
      chart.remove();
      chartInstance.current = null;
    };
  }, [equity_curve]);

  const formatCurrency = (v: number) => {
    const abs = Math.abs(v);
    const str = abs >= 1000
      ? '$' + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '$' + abs.toFixed(2);
    return v < 0 ? '-' + str : str;
  };

  const formatPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

  const sortedTrades = [...trades].sort((a, b) => {
    let cmp = 0;
    const aIdx = trades.indexOf(a);
    const bIdx = trades.indexOf(b);
    switch (sortField) {
      case '#': cmp = aIdx - bIdx; break;
      case 'side': cmp = a.side.localeCompare(b.side); break;
      case 'entry': cmp = a.entry_price - b.entry_price; break;
      case 'exit': cmp = a.exit_price - b.exit_price; break;
      case 'pnl': cmp = a.pnl - b.pnl; break;
      case 'pct': cmp = a.pnl_pct - b.pnl_pct; break;
      case 'reason': cmp = a.exit_reason.localeCompare(b.exit_reason); break;
      case 'duration': cmp = a.holding_bars - b.holding_bars; break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const exportCSV = async () => {
    const headers = '#,Side,Entry,Exit,PnL,PnL%,Reason,Duration';
    const rows = trades.map((t, i) =>
      `${i + 1},${t.side},${t.entry_price},${t.exit_price},${t.pnl.toFixed(2)},${t.pnl_pct.toFixed(2)},${t.exit_reason},${t.holding_bars}`
    );
    const csv = [headers, ...rows].join('\n');
    if (window.electronAPI) {
      await window.electronAPI.saveFile({
        defaultPath: `backtest_trades.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        content: csv,
      });
    } else {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backtest_trades.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const isProfitable = summary.net_profit >= 0;

  const cards = [
    { label: 'Net Profit', value: formatCurrency(summary.net_profit), sub: formatPct(summary.net_profit_pct), color: isProfitable ? 'text-green-400' : 'text-red-400', icon: DollarSign },
    { label: 'Win Rate', value: summary.win_rate.toFixed(1) + '%', sub: `${summary.winning_trades}W / ${summary.losing_trades}L`, color: 'text-blue-400', icon: TrendingUp },
    { label: 'Profit Factor', value: summary.profit_factor.toFixed(2), sub: summary.profit_factor >= 1.5 ? 'Good' : summary.profit_factor >= 1 ? 'Acceptable' : 'Poor', color: summary.profit_factor >= 1.5 ? 'text-green-400' : summary.profit_factor >= 1 ? 'text-yellow-400' : 'text-red-400', icon: TrendingDown },
    { label: 'Sharpe Ratio', value: summary.sharpe_ratio.toFixed(2), sub: summary.sharpe_ratio >= 1 ? 'Good' : 'Below avg', color: summary.sharpe_ratio >= 1 ? 'text-green-400' : 'text-yellow-400', icon: TrendingUp },
    { label: 'Max Drawdown', value: formatCurrency(summary.max_drawdown), sub: formatPct(summary.max_drawdown_pct), color: 'text-red-400', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Results</h3>
        <div className="flex items-center gap-2">
          {trades.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
            >
              <Download size={12} />
              Export CSV
            </button>
          )}
          {onSave && (
            <button
              onClick={onSave}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
            >
              <Save size={12} />
              Save Result
            </button>
          )}
          {onShowOnChart && (
            <button
              onClick={onShowOnChart}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/40 transition-all"
            >
              <TrendingUp size={12} />
              Show on Chart
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <card.icon size={12} className="text-zinc-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{card.label}</span>
            </div>
            <div className={`text-sm font-bold ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div ref={chartRef} className="w-full" />
      </div>

      {trades.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900/50 text-zinc-500 sticky top-0">
              <tr>
                {(['#', 'side', 'entry', 'exit', 'pnl', 'pct', 'reason', 'duration'] as SortField[]).map(f => (
                  <th
                    key={f}
                    onClick={() => toggleSort(f)}
                    className="px-3 py-2 font-medium cursor-pointer hover:text-zinc-300 select-none whitespace-nowrap"
                  >
                    {f === '#' ? '#' : f === 'pnl' ? 'PnL' : f === 'pct' ? 'PnL%' : f.charAt(0).toUpperCase() + f.slice(1)}
                    {sortField === f && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {sortedTrades.map((t, i) => (
                <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                  <td className={`px-3 py-2 font-bold ${t.side === 'Buy' ? 'text-green-500' : 'text-red-500'}`}>{t.side}</td>
                  <td className="px-3 py-2 text-zinc-300">${t.entry_price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-zinc-300">${t.exit_price.toLocaleString()}</td>
                  <td className={`px-3 py-2 font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2 ${t.pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{t.exit_reason}</td>
                  <td className="px-3 py-2 text-zinc-500">{t.holding_bars} bars</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
