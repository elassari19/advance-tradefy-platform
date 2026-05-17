import { useState, useCallback } from 'react';

const API_BASE = 'http://127.0.0.1:3000';

export interface BacktestRequest {
  strategy_code: string;
  symbol: string;
  timeframe: string;
  start_time: number;
  end_time: number;
  initial_balance: number;
  commission: number;
  slippage: number;
}

export interface BacktestTrade {
  id: string;
  side: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  pnl_pct: number;
  opened_at: number;
  closed_at: number;
  exit_reason: string;
  holding_bars: number;
}

export interface EquityPoint {
  bar_index: number;
  time: number;
  equity: number;
  balance: number;
  drawdown: number;
  drawdown_pct: number;
}

export interface BacktestResultSummary {
  initial_balance: number;
  final_balance: number;
  net_profit: number;
  net_profit_pct: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  profit_factor: number;
  avg_win: number;
  avg_loss: number;
  largest_win: number;
  largest_loss: number;
  avg_holding_bars: number;
}

export interface BacktestResult {
  summary: BacktestResultSummary;
  trades: BacktestTrade[];
  equity_curve: EquityPoint[];
  request: BacktestRequest;
}

export function useBacktest() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runBacktest = useCallback(async (req: BacktestRequest): Promise<BacktestResult | null> => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Backtest failed');
      }
      return await res.json() as BacktestResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Backtest request failed';
      setError(msg);
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  const saveBacktest = useCallback(async (result: BacktestResult, name?: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/backtest/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result, name: name || 'Untitled' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save backtest');
      }
      const data = await res.json();
      return data.id as string;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      return null;
    }
  }, []);

  const getBacktest = useCallback(async (id: string): Promise<BacktestResult | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/backtest/${id}`);
      if (!res.ok) return null;
      return await res.json() as BacktestResult;
    } catch {
      return null;
    }
  }, []);

  const listBacktests = useCallback(async (): Promise<any[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/backtest/list`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch {
      return [];
    }
  }, []);

  const optimize = useCallback(async (req: any): Promise<any[] | null> => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/backtest/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Optimization failed');
      }
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Optimization request failed';
      setError(msg);
      return null;
    } finally {
      setRunning(false);
    }
  }, []);

  return { runBacktest, saveBacktest, getBacktest, listBacktests, optimize, running, error };
}
