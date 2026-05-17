# TradingView System — Task Checklist

> Generated from `tradingview-system-plan.md`. 6 sprints, ~90 tasks.
> Legend: `[ ]` pending · `[~]` in progress · `[x]` completed · `[-]` cancelled

---

## Sprint 1: Bar-by-Bar Engine Foundation (Week 1)

### Backend — Candle Aggregator

- `[x]` Create `backend/src/candle_aggregator.rs` module
- `[x]` Implement `CandleAggregator` struct (timeframe, current candle, completed ring buffer)
- `[x]` Implement `CandleAggregator::new(symbol, timeframe_minutes)`
- `[x]` Implement `CandleAggregator::process_tick(tick) -> Vec<Candle>`
- `[x]` Implement `CandleAggregator::get_history() -> &[Candle]`
- `[x]` Implement `CandleAggregator::load_history(candles)`
- `[x]` Add Candle struct to `models.rs` (time, open, high, low, close, volume)
- `[x]` Add `aggregators: HashMap<(String, u32), CandleAggregator>` to `AppState`
- `[x]` Wire `CandleAggregator` into `start_binance_stream()` — feed ticks into aggregator
- `[x]` Emit completed candles via broadcast channel (separate from tick channel)

### Backend — Time Series

- `[x]` Create `TimeSeries` struct with ring buffer per variable name
- `[x]` Implement `TimeSeries::push(name, value)`
- `[x]` Implement `TimeSeries::get(name, offset) -> Option<f64>`
- `[x]` Implement `TimeSeries::get_current(name) -> f64`
- `[x]` Implement `TimeSeries::len(name) -> usize` (check available history)

### Backend — Strategy Engine (Bar Execution)

- `[x]` Add `execute_on_candle(candle) -> Option<PythonSignal>` to `PythonRuntime`
- `[x]` Inject `open`, `high`, `low`, `close`, `volume` as `Series` objects into Python globals
- `[x]` Inject `TimeSeries` instance into Python globals (enable `close[1]` syntax)
- `[x]` Implement Python `Series` class with `__getitem__` and `__float__`
- `[x]` Modify `StrategyEngine::on_candle()` to pass full OHLCV
- `[x]` Modify `StrategyEngine::on_tick()` to use aggregator's latest candle

### Backend — Candle-Aware Simulator

- `[x]` Add `process_candle(candle)` to `SimulatorEngine`
- `[x]` Implement OHLC-range-aware TP/SL checking (triggers within bar's full range)
- `[x]` Modify `process_tick()` to still work for real-time tick-by-tick

### Frontend — Candle Data Feed

- `[x]` Add candle subscription to `useMarketData` hook (new WS message type for candles)
- `[x]` Update candle aggregation in frontend to receive candles from backend
- `[x]` Ensure Chart component uses server-aggregated candles

---

## Sprint 2: Backtesting Engine (Week 2)

### Backend — Backtest Engine

- `[x]` Create `backend/src/backtest.rs` module
- `[x]` Implement `BacktestEngine` struct (balance, strategy, symbol, timeframe, dates, commission, slippage)
- `[x]` Implement `BacktestEngine::fetch_historical_candles()`
- `[x]` Implement `BacktestEngine::run() -> BacktestResult` — bar-by-bar simulation
- `[x]` Implement `BacktestResult` struct (all performance metrics)
- `[x]` Compute net profit, total trades, winning/losing trades, win rate
- `[x]` Compute max drawdown (absolute + percentage) from equity curve
- `[x]` Compute Sharpe ratio
- `[x]` Compute profit factor
- `[x]` Compute avg win, avg loss, largest win, largest loss
- `[x]` Compute average holding time (in bars)
- `[x]` Generate `equity_curve: Vec<EquityPoint>` from simulator state snapshots
- `[x]` Generate `trade_history: Vec<BacktestTrade>` from closed positions
- `[x]` Register strategies deploy symbol format for backtest compatibility
- `[x]` Implement `POST /api/backtest/run` endpoint
- `[x]` Implement `POST /api/backtest/save` endpoint
- `[x]` Implement `GET /api/backtest/:id` endpoint
- `[x]` Implement `GET /api/backtest/list` endpoint

### Backend — Backtest DB Schema

- `[x]` Create migration `003_create_backtest_results.sql`
- `[x]` Create `backtest_results` table (PRD schema + strategy_code, parameters, equity_curve JSONB)
- `[x]` Add sqlx queries for backtest CRUD

### Frontend — Backtest Configuration

- `[x]` Create `frontend/src/components/backtest/BacktestConfig.tsx`
- `[x]` Symbol selector, timeframe picker, date range inputs
- `[x]` Initial capital, commission, slippage inputs
- `[x]` [Run Backtest] button → calls `POST /api/backtest/run`
- `[x]` Create `frontend/src/hooks/useBacktest.ts` API client

### Frontend — Backtest Results Dashboard

- `[x]` Create `frontend/src/components/backtest/BacktestResults.tsx`
- `[x]` Summary card grid (net profit, win rate, profit factor, Sharpe, max drawdown)
- `[x]` Equity curve mini chart (using lightweight-charts LineSeries)
- `[x]` Trade list (sortable table: #, side, entry, exit, PnL, %, reason, duration)
- `[x]` [Export CSV] button for trade list
- `[x]` [Save Result] button → calls `POST /api/backtest/save`
- `[x]` [Show on Chart] button → renders trade markers on main chart

### Frontend — Strategy Tab Redesign

- `[x]` Redesign `TerminalTabs.tsx` strategy pane with tab navigation: [Editor] [Backtest] [Settings]
- `[x]` Backtest tab shows config + results inline below the editor
- `[x]` Load strategy from code editor when running backtest

---

## Sprint 3: Indicator System (Week 3)

### Backend — Rust Native Indicators

- `[x]` Create `backend/src/indicators/` directory
- `[x]` Create `backend/src/indicators/mod.rs` with `Indicator` trait + registry
- `[x]` Implement `Indicator` trait (name, calculate, parameters)
- `[x]` Implement `IndicatorOutput`, `IndicatorPlot`, `IndicatorLine` types
- `[x]` Create `backend/src/indicators/sma.rs` — Simple Moving Average
- `[x]` Create `backend/src/indicators/ema.rs` — Exponential Moving Average
- `[x]` Create `backend/src/indicators/rsi.rs` — Relative Strength Index
- `[x]` Create `backend/src/indicators/macd.rs` — MACD + Signal + Histogram
- `[x]` Create `backend/src/indicators/bollinger.rs` — Bollinger Bands
- `[x]` Create `backend/src/indicators/atr.rs` — Average True Range
- `[x]` Create `backend/src/indicators/stochastic.rs` — Stochastic Oscillator
- `[x]` Create `backend/src/indicators/vwap.rs` — Volume-Weighted Average Price

### Backend — Indicator Pipeline

- `[x]` Implement `IndicatorPipeline` struct (list of indicators, pane assignment)
- `[x]` Implement `IndicatorPipeline::evaluate_all(candles) -> Vec<PipelineOutput>`
- `[x]` Create `POST /api/indicators/evaluate-batch` endpoint
- `[x]` Create `IndicatorParam` serialization for JSON API
- `[x]` Create `GET /api/indicators/list` endpoint (returns available indicators + their params)
- `[x]` Implement multi-timeframe resolution (`resolve_mtf()`)
- `[x]` Wire MTF into `CandleAggregator` map lookup
- `[x]` Create `POST /api/indicators/mtf/resolve` endpoint

### Backend — Custom Indicators (Enhanced)

- `[x]` Enhance `POST /api/indicator/evaluate` to support multi-output
- `[x]` Inject `sma()`, `ema()`, `rsi()`, `macd()`, etc. into Python custom indicator runtime
- `[x]` Inject `plot()`, `plotshape()`, `hline()`, `bgcolor()` into Python runtime
- `[x]` Add `POST /api/indicators/custom/save` endpoint
- `[x]` Add `GET /api/indicators/custom/list` endpoint

### Frontend — Indicator Panel

- `[x]` Create `frontend/src/components/indicators/IndicatorPanel.tsx`
- `[x]` Search bar for filtering indicators
- `[x]` Category groups: Favorites, Trend, Oscillators, Volume, Custom
- `[x]` Indicator list with add/remove toggles
- `[x]` Expandable parameter configuration (period, color, style) per indicator
- `[x]` Connect to `POST /api/indicators/evaluate-batch` for data
- `[x]` Replace client-side `resolveIndicatorLines()` with server-side batch call

### Frontend — Sub-char & Overlay Rendering

- `[x]` Update `Chart.tsx` to receive structured indicator data from API
- `[x]` Auto-assign overlay vs sub-chart pane based on indicator type
- `[x]` Support multi-pane layout (2+ sub-charts stacked)
- `[x]` Time scale sync for all panes

---

## Sprint 4: Alert & Webhook Enhancements (Week 4)

### Backend — Alert Engine

- `[x]` Create `backend/src/alerts.rs` module
- `[x]` Implement `AlertCondition` enum (Crossing, CrossingUp, CrossingDown, GT, LT, GTE, LTE, Range, Custom)
- `[x]` Implement `AlertRule` struct
- `[x]` Implement `AlertAction` enum (Webhook, Email, PushNotification, Sound)
- `[x]` Implement `AlertFrequency` enum (OncePerBarClose, OncePerBar, OnEveryTick)
- `[x]` Implement `AlertEngine::evaluate(candle, aggregator) -> Vec<TriggeredAlert>`
- `[x]` Implement condition evaluation logic (all condition types)
- `[x]` Implement `should_fire(rule, last_fired)` frequency check
- `[x]` Wire alert evaluation into main tick/candle processing loop

### Backend — Alert CRUD API

- `[x]` Implement `GET /api/alerts` endpoint
- `[x]` Implement `POST /api/alerts` endpoint (create/update)
- `[x]` Implement `DELETE /api/alerts/:id` endpoint

### Backend — Webhook Enhancements

- `[x]` Implement `dispatch_webhook_with_retry()` — 3 retries with exponential backoff
- `[x]` Implement customizable webhook payload template (`{{timestamp}}`, `{{trade}}`, etc.)
- `[x]` Implement webhook timeout configuration
- `[x]` Create `webhook_logs` table (migration)
- `[x]` Implement `GET /api/webhooks/logs` endpoint
- `[x]` Implement `log_webhook_delivery()` — log every dispatch attempt
- `[x]` Modify existing webhook dispatch in `webhooks.rs` to use retry + logging
- `[x]` Add `template`, `retry_count`, `timeout_ms` columns to `webhook_configs` table
- `[x]` Allow multiple webhook endpoints per alert

### Backend — Notification Channels

- `[x]` Implement desktop push via WebSocket message to frontend
- `[x]` Implement sound notification trigger (WebSocket → Web Audio API)
- `[x]` Implement email notification (via reqwest SMTP relay API)

### Frontend — Alert Creator UI

- `[x]` Create `frontend/src/components/alerts/AlertCreator.tsx`
- `[x]` Name, symbol, timeframe fields
- `[x]` Condition builder UI (type dropdown, series/value inputs)
- `[x]` Series selector referencing active indicators on the chart
- `[x]` Frequency selector (Once Per Bar Close / Once Per Bar / Every Tick)
- `[x]` Actions configuration (webhook URL, email, push toggle)
- `[x]` Alert preview text generation
- `[x]` Save/Cancel buttons → `POST /api/alerts`

### Frontend — Alerts Dashboard

- `[x]` Create `frontend/src/components/alerts/AlertsList.tsx`
- `[x]` List all alert rules with enable/disable toggle
- `[x]` Edit and delete actions per rule
- `[x]` Last triggered timestamp display
- `[x]` Webhook delivery log viewer (expandable per webhook)

### Frontend — Browser Notifications

- `[x]` Request Notification API permission on first alert
- `[x]` Show browser notification when WebSocket push received
- `[x]` Play alert sound using Web Audio API
- `[x]` Add /alerts route to navigation

---

## Sprint 5: Strategy DSL & Advanced Features (Week 5)

### Backend — Python TA Function Library

- `[x]` Implement and inject `ta.sma(source, length)` into Python globals
- `[x]` Implement and inject `ta.ema(source, length)` into Python globals
- `[x]` Implement and inject `ta.rsi(source, length)` into Python globals
- `[x]` Implement and inject `ta.macd(source, fast, slow, signal)` into Python globals
- `[x]` Implement and inject `ta.bb(source, length, std)` into Python globals
- `[x]` Implement and inject `ta.atr(length)` into Python globals
- `[x]` Implement and inject `ta.stoch(high, low, close, k, d)` into Python globals
- `[x]` Implement and inject `ta.crossover(a, b)` / `ta.crossunder(a, b)` into Python globals
- `[x]` Implement and inject `ta.highest(source, length)` / `ta.lowest(source, length)` into Python globals
- `[x]` Implement and inject `ta.change(source, length)` into Python globals
- `[x]` Implement and inject `ta.alma(source, length, offset, sigma)` into Python globals
- `[x]` Implement and inject `ta.vwap()` into Python globals
- `[x]` Implement and inject `nz(value, fallback)` into Python globals
- `[x]` Implement and inject `iff(condition, a, b)` into Python globals
- `[x]` Implement and inject `security(symbol, timeframe, expression)` into Python globals
- `[x]` Implement and inject `timeframe.period`, `syminfo.tickerid` into Python globals
- `[x]` Implement and inject `bar_index`, `barstate.isrealtime`, `barstate.isconfirmed` into Python globals

### Backend — Python Plot/BG/Shape Functions

- `[x]` Implement and inject `plot(series, title, color, style, width)` into Python globals
- `[x]` Implement and inject `plotshape(series, title, location, style, size)` into Python globals
- `[x]` Implement and inject `plotarrow(series, colorup, colordown)` into Python globals
- `[x]` Implement and inject `hline(price, title, color, linestyle)` into Python globals
- `[x]` Implement and inject `bgcolor(color)` into Python globals
- `[x]` Implement and inject `fill(series1, series2, color)` into Python globals
- `[x]` Return plot data alongside signals from `PythonRuntime`

### Backend — Strategy DSL Decorator

- `[x]` Implement `@strategy` decorator injection (title, overlay, initial_capital, etc.)
- `[x]` Parse decorator parameters in `PythonRuntime`
- `[x]` Implement `strategy.entry(id, direction, qty, limit, stop)` in Python

### Backend — Strategy Optimization
- `[x]` Implement `strategy.exit(id, from_entry, qty, limit, stop)` in Python
- `[x]` Implement `strategy.close(id, qty)` in Python
- `[x]` Implement `strategy.order(id, direction, qty, limit, stop)` in Python
- `[x]` Implement `strategy.position_size`, `strategy.position_avg_price`, `strategy.equity`
- `[x]` Implement `input(default, title)` for strategy parameters

### Backend — Strategy Optimization

- `[x]` Implement `ParameterRange` struct
- `[x]` Implement `run_optimization(code, symbol, timeframe, ranges) -> Vec<OptimizationResult>`
- `[x]` Cartesian product parameter grid search
- `[x]` Sort results by Sharpe ratio / net profit
- `[x]` Implement `POST /api/backtest/optimize` endpoint

### Backend — Strategy Library

- `[x]` Create `saved_strategies` table (migration)
- `[x]` Implement `POST /api/strategy/save` endpoint
- `[x]` Implement `GET /api/strategy/list` endpoint

### Frontend — JavaScript Strategy Runner

- `[x]` Create a Strategy DSL interpreter in TypeScript
- `[x]` Implement Web Worker for JS strategy execution
- `[x]` Port TA functions to TypeScript for Web Worker
- `[x]` Create JS strategy editor mode in Monaco
- `[x]` Live preview of JS strategy on chart

### Frontend — Optimization UI

- `[x]` Create `OptimizationPanel.tsx` component
- `[x]` Parameter range inputs (name, min, max, step)
- `[x]` [Run Optimization] button → `POST /api/backtest/optimize`
- `[x]` Results table sorted by Sharpe (parameter set + metrics per row)
- `[x]` [Apply Best] button → copies best parameters to strategy editor

### Frontend — Strategy Library UI

- `[x]` Create strategy browser (list saved strategies)
- `[x]` Load strategy into editor on click
- `[x]` Save current editor code as named strategy
- `[x]` Delete saved strategies

### Frontend — Advanced Editor Features

- `[x]` Syntax highlighting for Tradify DSL functions
- `[x]` Autocomplete for built-in functions (ta.*, plot*, strategy.*)
- `[x]` Inline documentation tooltips on hover
- `[x]` Plot output preview pane (mini chart of strategy plots)

---

## Sprint 6: Polish & Edge Cases (Week 6)

### Backend — Stream State Persistence

- `[x]` Create `state_persistence.rs` module
- `[x]` Implement `save_state()` — serialize SimulatorState + active strategies to PostgreSQL
- `[x]` Implement `load_state()` — restore state on startup
- `[x]` Auto-save timer (every N ticks or every N seconds)
- `[x]` Graceful shutdown handler (`tokio::signal::ctrl_c()` → save state)
- `[x]` Strategy persistence (save/restore Python runtime state)

### Backend — Historical Data Cache

- `[x]` Create `candle_cache` table (migration)
- `[x]` Implement cache lookup before Binance API fetch
- `[x]` Implement cache write after successful fetch
- `[x]` Cache invalidation (stale data older than N hours)
- `[x]` Fallback to API if cache miss

### Backend — Exchange Abstraction

- `[x]` Implement `ExchangeStream` trait
- `[x]` Extract existing Binance code into `BinanceStream` struct
- `[x]` Implement `BybitStream` (WebSocket + REST) [stub]
- `[x]` Implement `CoinbaseStream` (WebSocket + REST) [stub]
- `[x]` Add exchange selector to `WebhookConfig` / `AppState`
- `[x]` Route data fetching through `ExchangeStream` trait

### Backend — Performance Profiling

- `[x]` Add execution timing instrumentation to `PythonRuntime`
- `[x]` Track per-bar Python execution time
- `[x]` Expose timing stats via API endpoint
- `[x]` Implement warning when Python execution exceeds threshold (>100ms)

### Backend — Edge Case Handling

- `[x]` Division by zero guard in all indicator calculations
- `[x]` Insufficient history guard (return `na` if not enough bars)
- `[x]` Exchange disconnection detection + auto-reconnect circuit breaker
- `[x]` Webhook timeout + retry exhaustion logging
- `[x]` Strategy deployment syntax error handling (detailed error messages)
- `[x]` Alert deduplication (multiple alerts on same tick — fire once)
- `[x]` NaN/Infinity propagation guard in indicator pipeline
- `[x]` Handle empty candle list gracefully in all endpoints

### Frontend — Trade Markers on Live Chart

- `[x]` Implement `BacktestTradeMarker` interface (price lines with labels)
- `[x]` Buy arrow (green triangle) and sell arrow (red triangle) markers using lightweight-charts shape markers
- `[x]` TP/SL line markers on backtest trades
- `[x]` Toggle backtest trade overlay on/off

### Frontend — Error Handling & UX

- `[x]` Display Python syntax errors inline in Monaco editor (onValidate handler added)
- `[x]` Webhook delivery status badge (success/failure) in UI
- `[x]` Connection status indicator for exchange WebSocket
- `[x]` Loading states for backtest execution (spinner + "Running...")
- `[x]` Error toast notifications for API failures
- `[x]` Keyboard shortcuts (Ctrl+Enter = deploy, Ctrl+B = backtest)

### Testing — Backend Unit Tests

- `[x]` `candle_aggregator` inline tests — 6 test cases
- `[x]` `indicator` inline tests — 15 test cases
- `[x]` `backtest` inline tests — 7 test cases
- `[x]` `simulator` inline tests — 7 test cases

### Testing — Integration Tests

- `[ ]` `test_backtest_api_flow` — run, save, load backtest
- `[ ]` `test_indicator_batch_api` — batch evaluate indicators
- `[ ]` `test_alert_lifecycle` — create, trigger, delete alert

### Testing — E2E Tests

- `[ ]` `test_backtest_flow` — open strategy, run backtest, see results + trade markers
- `[ ]` `test_alert_creation` — create alert, verify trigger + webhook dispatch
- `[ ]` `test_indicator_management` — add/remove indicators, verify chart updates
- `[ ]` `test_strategy_deployment` — deploy strategy, verify tick processing

---

## Summary

| Sprint | Focus | Backend Tasks | Frontend Tasks | Total |
|--------|-------|--------------|----------------|-------|
| 1 | Bar-by-Bar Engine | 14 | 2 | 16 |
| 2 | Backtesting | 16 | 8 | 24 |
| 3 | Indicator System | 16 | 6 | 22 |
| 4 | Alert & Webhooks | 14 | 8 | 22 |
| 5 | Strategy DSL | 24 | 8 | 32 |
| 6 | Polish & Edge Cases | 18 | 8 | 26 |
| **Total** | | **102** | **40** | **142** |
