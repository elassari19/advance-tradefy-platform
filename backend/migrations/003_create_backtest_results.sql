-- Migration: Create backtest_results table
-- Purpose: Store backtest execution results

CREATE TABLE IF NOT EXISTS backtest_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_name   TEXT NOT NULL DEFAULT 'Untitled',
    symbol          TEXT NOT NULL,
    timeframe       TEXT NOT NULL,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    initial_balance DOUBLE PRECISION NOT NULL,
    final_balance   DOUBLE PRECISION NOT NULL,
    net_profit      DOUBLE PRECISION NOT NULL,
    total_trades    INTEGER NOT NULL,
    winning_trades  INTEGER NOT NULL,
    losing_trades   INTEGER NOT NULL,
    win_rate        DOUBLE PRECISION NOT NULL,
    max_drawdown    DOUBLE PRECISION NOT NULL,
    max_drawdown_pct DOUBLE PRECISION NOT NULL,
    sharpe_ratio    DOUBLE PRECISION NOT NULL,
    profit_factor   DOUBLE PRECISION NOT NULL,
    avg_win         DOUBLE PRECISION NOT NULL,
    avg_loss        DOUBLE PRECISION NOT NULL,
    trade_history   JSONB NOT NULL,
    equity_curve    JSONB NOT NULL,
    strategy_code   TEXT NOT NULL,
    parameters      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_results_created_at ON backtest_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_results_symbol ON backtest_results(symbol);
