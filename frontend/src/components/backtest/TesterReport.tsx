import React from 'react';
import { Download, Copy } from 'lucide-react';
import type { BacktestResult } from '../../hooks/useBacktest';

interface TesterReportProps {
  result: BacktestResult;
}

export const TesterReport: React.FC<TesterReportProps> = ({ result }) => {
  const { summary } = result;

  const formatCurrency = (v: number) => {
    const abs = Math.abs(v);
    const str = abs >= 1000
      ? '$' + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '$' + abs.toFixed(2);
    return v < 0 ? '-' + str : str;
  };

  const formatPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const copyToClipboard = async () => {
    const lines = [
      '=== Backtest Report ===',
      '',
      '── Results ──',
      `Initial Balance:   ${formatCurrency(summary.initial_balance)}`,
      `Final Balance:     ${formatCurrency(summary.final_balance)}`,
      `Net Profit:        ${formatCurrency(summary.net_profit)} (${formatPct(summary.net_profit_pct)})`,
      '',
      '── Profitability ──',
      `Gross Profit:      ${formatCurrency(summary.gross_profit || 0)}`,
      `Gross Loss:        ${formatCurrency(summary.gross_loss || 0)}`,
      `Profit Factor:     ${summary.profit_factor.toFixed(2)}`,
      `Expected Payoff:   ${formatCurrency(summary.expected_payoff || 0)}`,
      `Recovery Factor:   ${(summary.recovery_factor || 0).toFixed(2)}`,
      '',
      '── Drawdown ──',
      `Max Drawdown:      ${formatCurrency(summary.max_drawdown)} (${formatPct(summary.max_drawdown_pct)})`,
      `Max DD Duration:   ${formatDuration(summary.max_drawdown_duration || 0)}`,
      '',
      '── Trades ──',
      `Total Trades:      ${summary.total_trades}`,
      `Winning Trades:    ${summary.winning_trades}`,
      `Losing Trades:     ${summary.losing_trades}`,
      `Win Rate:          ${summary.win_rate.toFixed(1)}%`,
      `Consecutive Wins:  ${summary.max_consecutive_wins || 0}`,
      `Consecutive Losses: ${summary.max_consecutive_losses || 0}`,
      `Avg Trade Duration: ${(summary.avg_trade_duration || 0).toFixed(1)}h`,
      `Long Trades:       ${summary.long_trades || 0}`,
      `Short Trades:      ${summary.short_trades || 0}`,
      '',
      '── Ratios ──',
      `Sharpe Ratio:      ${summary.sharpe_ratio.toFixed(2)}`,
      `Sortino Ratio:     ${(summary.sortino_ratio || 0).toFixed(2)}`,
      `Calmar Ratio:      ${(summary.calmar_ratio || 0).toFixed(2)}`,
      '',
      '── Statistics ──',
      `Bars in Test:      ${summary.bars_in_test || 0}`,
      `Ticks Processed:   ${summary.ticks_processed || 0}`,
      `Modeling Quality:  ${(summary.modeling_quality || 0).toFixed(1)}%`,
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); } catch {}
  };

  const exportHTML = async () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #09090b; color: #e4e4e7; padding: 32px; max-width: 700px; margin: 0 auto; }
      h1 { color: #fafafa; font-size: 22px; margin-bottom: 24px; }
      h2 { color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 8px; }
      .card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
      .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
      .label { color: #71717a; } .value { color: #e4e4e7; font-weight: 600; font-variant-numeric: tabular-nums; }
      .green { color: #22c55e; } .red { color: #ef4444; }
    </style></head><body>
      <h1>Backtest Report</h1>
      <h2>Results</h2>
      <div class="card">
        <div class="row"><span class="label">Initial Balance</span><span class="value">${formatCurrency(summary.initial_balance)}</span></div>
        <div class="row"><span class="label">Final Balance</span><span class="value">${formatCurrency(summary.final_balance)}</span></div>
        <div class="row"><span class="label">Net Profit</span><span class="value ${summary.net_profit >= 0 ? 'green' : 'red'}">${formatCurrency(summary.net_profit)} (${formatPct(summary.net_profit_pct)})</span></div>
      </div>
      <h2>Profitability</h2>
      <div class="card">
        <div class="row"><span class="label">Gross Profit</span><span class="value green">${formatCurrency(summary.gross_profit || 0)}</span></div>
        <div class="row"><span class="label">Gross Loss</span><span class="value red">${formatCurrency(summary.gross_loss || 0)}</span></div>
        <div class="row"><span class="label">Profit Factor</span><span class="value">${summary.profit_factor.toFixed(2)}</span></div>
        <div class="row"><span class="label">Expected Payoff</span><span class="value">${formatCurrency(summary.expected_payoff || 0)}</span></div>
        <div class="row"><span class="label">Recovery Factor</span><span class="value">${(summary.recovery_factor || 0).toFixed(2)}</span></div>
      </div>
      <h2>Drawdown</h2>
      <div class="card">
        <div class="row"><span class="label">Max Drawdown</span><span class="value red">${formatCurrency(summary.max_drawdown)} (${formatPct(summary.max_drawdown_pct)})</span></div>
        <div class="row"><span class="label">Max DD Duration</span><span class="value">${formatDuration(summary.max_drawdown_duration || 0)}</span></div>
      </div>
      <h2>Trades</h2>
      <div class="card">
        <div class="row"><span class="label">Total Trades</span><span class="value">${summary.total_trades}</span></div>
        <div class="row"><span class="label">Win Rate</span><span class="value">${summary.win_rate.toFixed(1)}% (${summary.winning_trades}W / ${summary.losing_trades}L)</span></div>
        <div class="row"><span class="label">Consecutive Wins / Losses</span><span class="value">${summary.max_consecutive_wins || 0} / ${summary.max_consecutive_losses || 0}</span></div>
        <div class="row"><span class="label">Avg Trade Duration</span><span class="value">${(summary.avg_trade_duration || 0).toFixed(1)}h</span></div>
        <div class="row"><span class="label">Long / Short</span><span class="value">${summary.long_trades || 0} / ${summary.short_trades || 0}</span></div>
      </div>
      <h2>Ratios</h2>
      <div class="card">
        <div class="row"><span class="label">Sharpe Ratio</span><span class="value">${summary.sharpe_ratio.toFixed(2)}</span></div>
        <div class="row"><span class="label">Sortino Ratio</span><span class="value">${(summary.sortino_ratio || 0).toFixed(2)}</span></div>
        <div class="row"><span class="label">Calmar Ratio</span><span class="value">${(summary.calmar_ratio || 0).toFixed(2)}</span></div>
      </div>
      <h2>Statistics</h2>
      <div class="card">
        <div class="row"><span class="label">Bars in Test</span><span class="value">${summary.bars_in_test || 0}</span></div>
        <div class="row"><span class="label">Ticks Processed</span><span class="value">${summary.ticks_processed || 0}</span></div>
        <div class="row"><span class="label">Modeling Quality</span><span class="value">${(summary.modeling_quality || 0).toFixed(1)}%</span></div>
      </div>
    </body></html>`;

    if (window.electronAPI) {
      await window.electronAPI.saveHtmlReport(html);
    } else {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backtest-report.html';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400">Comprehensive Statistics</span>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
          >
            <Copy size={12} />
            Copy
          </button>
          <button
            onClick={exportHTML}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
          >
            <Download size={12} />
            Save HTML
          </button>
        </div>
      </div>

      <Section title="Results">
        <Row label="Initial Balance" value={formatCurrency(summary.initial_balance)} />
        <Row label="Final Balance" value={formatCurrency(summary.final_balance)} />
        <Row label="Net Profit" value={`${formatCurrency(summary.net_profit)} (${formatPct(summary.net_profit_pct)})`} color={summary.net_profit >= 0 ? 'green' : 'red'} />
      </Section>

      <Section title="Profitability">
        <Row label="Gross Profit" value={formatCurrency(summary.gross_profit || 0)} color="green" />
        <Row label="Gross Loss" value={formatCurrency(summary.gross_loss || 0)} color="red" />
        <Row label="Profit Factor" value={summary.profit_factor.toFixed(2)} />
        <Row label="Expected Payoff" value={formatCurrency(summary.expected_payoff || 0)} />
        <Row label="Recovery Factor" value={(summary.recovery_factor || 0).toFixed(2)} />
      </Section>

      <Section title="Drawdown">
        <Row label="Max Drawdown" value={`${formatCurrency(summary.max_drawdown)} (${formatPct(summary.max_drawdown_pct)})`} color="red" />
        <Row label="Max DD Duration" value={formatDuration(summary.max_drawdown_duration || 0)} />
      </Section>

      <Section title="Trades">
        <Row label="Total Trades" value={summary.total_trades.toString()} />
        <Row label="Win Rate" value={`${summary.win_rate.toFixed(1)}% (${summary.winning_trades}W / ${summary.losing_trades}L)`} />
        <Row label="Consecutive Wins" value={(summary.max_consecutive_wins || 0).toString()} color="green" />
        <Row label="Consecutive Losses" value={(summary.max_consecutive_losses || 0).toString()} color="red" />
        <Row label="Avg Trade Duration" value={`${(summary.avg_trade_duration || 0).toFixed(1)}h`} />
      </Section>

      <Section title="Ratios">
        <Row label="Sharpe Ratio" value={summary.sharpe_ratio.toFixed(2)} />
        <Row label="Sortino Ratio" value={(summary.sortino_ratio || 0).toFixed(2)} />
        <Row label="Calmar Ratio" value={(summary.calmar_ratio || 0).toFixed(2)} />
      </Section>

      <Section title="Statistics">
        <Row label="Bars in Test" value={(summary.bars_in_test || 0).toLocaleString()} />
        <Row label="Ticks Processed" value={(summary.ticks_processed || 0).toLocaleString()} />
        <Row label="Modeling Quality" value={`${(summary.modeling_quality || 0).toFixed(1)}%`} />
      </Section>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-zinc-900/80 border-b border-zinc-800">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{title}</h4>
      </div>
      <div className="p-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'green' ? 'text-green-400' : color === 'red' ? 'text-red-400' : 'text-zinc-200';
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`text-[11px] font-bold font-mono ${colorClass}`}>{value}</span>
    </div>
  );
}
