# Backtest Implementation Tasks — MT4/5 Style

> Generated from `backtest-plan.md`
> Status: ✅ Complete | 🔄 In Progress | ⏳ Pending | ❌ Blocked

---

## Phase 1: Backend (Rust)

### 1.1 Models — Testing Mode Enum & BacktestRequest

- [x] Create `TestingMode` enum (`EveryTick`, `ControlPoints`, `OpenPricesOnly`) in `backend/src/models.rs`
- [x] Add `testing_mode: TestingMode` + `visual: bool` fields to `BacktestRequest`
- [x] Add serde defaults so existing clients continue to work

### 1.2 Models — BacktestEvent

- [x] Create `BacktestEvent` struct with `timestamp`, `event_type`, `description`, `details`
- [x] Add `events: Vec<BacktestEvent>` to `BacktestResult`
- [x] Add `events: Vec<BacktestEvent>` + `current_candle: Option<Candle>` to `BacktestProgress`

### 1.3 Models — Enhanced BacktestResultSummary

- [x] Add to `BacktestResultSummary`:
  - `gross_profit`, `gross_loss`
  - `sortino_ratio`, `calmar_ratio`, `recovery_factor`, `expected_payoff`
  - `max_consecutive_wins`, `max_consecutive_losses`
  - `max_drawdown_duration`, `avg_trade_duration`
  - `return_on_account`, `long_trades`, `short_trades`
  - `winning_long_pct`, `winning_short_pct`
  - `modeling_quality`, `bars_in_test`, `ticks_processed`

### 1.4 Exchange — Tick History Fetching

- [x] Add `fetch_tick_history()` to `ExchangeStream` trait
- [x] Implement for `BinanceStream` using `GET /api/v3/aggTrades`
- [x] Handle pagination via `fromId` across full date range
- [x] Implement stubs for `BybitStream` and `CoinbaseStream`

### 1.5 Backtest Engine — EveryTick Mode

- [x] Implement `fetch_historical_ticks()` method on `BacktestEngine`
- [x] Implement `execute_with_ticks()` method:
  - Iterate every tick through `SimulatorEngine.process_tick()`
  - Aggregate ticks into micro-candles for strategy `on_candle()` context
  - Record events for each tick action
  - Build tick-level equity curve
- [x] Integrate with `execute_with_candles_impl()` dispatch via `TestingMode`

### 1.6 Backtest Engine — ControlPoints Mode

- [x] Fetch 1-min candles regardless of target timeframe
- [x] Implement intra-bar price simulation (O → H → L → C path)
- [x] Check TP/SL within candle high/low range
- [x] Record events per control-point execution

### 1.7 Backtest Engine — OpenPricesOnly Mode

- [x] Execute only at open price of each bar
- [x] Skip intra-bar TP/SL checks
- [x] Fastest execution path with minimal processing

### 1.8 Backtest Engine — Event Logging

- [x] Add `events: Vec<BacktestEvent>` accumulator to execution loop
- [x] Emit events at each: order open, order close, TP hit, SL hit, signal detected
- [x] Include events in `BacktestProgress` stream messages
- [x] Include events in final `BacktestResult`

### 1.9 Backtest Engine — Enhanced Metrics Computation

- [x] Compute `sortino_ratio` (downside deviation only)
- [x] Compute `calmar_ratio` (annualized return / max drawdown)
- [x] Compute `recovery_factor` (net profit / max drawdown)
- [x] Compute `expected_payoff` (avg profit per trade)
- [x] Compute `max_consecutive_wins` / `max_consecutive_losses`
- [x] Compute `max_drawdown_duration` (longest time below peak equity)
- [x] Compute `avg_trade_duration`
- [x] Compute `modeling_quality` (data coverage %)
- [x] Track `bars_in_test` and `ticks_processed`

### 1.10 Backtest Engine — prepare_data()

- [x] Implement `prepare_data()` method that fetches data without executing
- [x] Return `PreparedData` enum: `Candles(Vec<Candle>)` | `Ticks(Vec<Tick>)`
- [x] Include metadata: count, modeling_quality, date range

### 1.11 Simulator — Event Emission

- [x] Modify `place_order()` to return an `BacktestEvent`
- [x] Modify `close_position()` to return an `BacktestEvent`
- [x] Modify `process_tick()` to emit events on TP/SL hit
- [x] Modify `update_position()` to emit event on modification

### 1.12 API — prepare-data Endpoint

- [x] Add `POST /api/backtest/prepare-data` route to router
- [x] Handler: accept options, call `BacktestEngine::prepare_data()`, return metadata
- [x] Error handling for unavailable data / invalid options

### 1.13 API — Enhanced Backtest Run

- [x] Pass `testing_mode` and `visual` through existing `POST /api/backtest/run`
- [x] Pass events and current_candle through WebSocket `BacktestProgress`
- [x] Include full `BacktestResult` with events + enhanced summary in REST response

---

## Phase 2: Frontend (React)

### 2.1 TypeScript Types

- [ ] Add `TestingMode` type alias to `useBacktest.ts`
- [ ] Add `testing_mode` and `visual` to `BacktestRequest` interface
- [ ] Add `BacktestEvent` interface
- [ ] Add `events` and `current_candle` to `BacktestProgress` interface
- [ ] Add all enhanced metrics to `BacktestResultSummary` interface
- [ ] Add `prepareData()` function declaration
- [ ] Add `PrepareRequest` and `PrepareResponse` interfaces

### 2.2 Tabbed Tester Layout

- [ ] Build tab bar component with 5 tabs: Settings, Results, Graph, Report, Journal
- [ ] Implement tab visibility logic (Settings + Journal always visible, others post-run)
- [ ] Integrate into backtest view in `App.tsx`
- [ ] Replace current backtest page layout with new tabbed structure
- [ ] Add transition/animation on tab switch

### 2.3 TesterSettings Component

- [ ] Build form sections matching MT4/5:
  - Expert Advisor selector
  - Symbol + Timeframe dropdowns
  - Testing Period (presets + custom date range)
  - Testing Mode radio buttons (Every Tick / 1-min OHLC / Open Prices Only)
  - Initial parameters (balance, commission, slippage)
  - Visual mode toggle + speed presets
- [ ] Wire form state to backtest run action
- [ ] Add "Browse Strategies" and "Edit" buttons

### 2.4 VisualBacktestChart Component

- [ ] Build progressive candle playback using `lightweight-charts`
- [ ] Accept `allCandles` + `currentBarIndex` — render `candles.slice(0, currentBarIndex)`
- [ ] Draw trade entry markers (green ▲ for Buy, red ▼ for Sell)
- [ ] Draw entry→exit lines for closed trades
- [ ] Draw TP/SL horizontal dashed lines per open trade
- [ ] Highlight current candle with border glow
- [ ] Add crosshair with tooltip showing price/time/bar info
- [ ] Handle live bar-by-bar updates from WebSocket

### 2.5 TesterResults Component

- [ ] Build full trade results table with columns:
  - # | Time | Type | Symbol | Volume | Open Price | SL | TP | Close Price | Commission | Swap | Profit | Balance
- [ ] Implement column sorting
- [ ] Implement filter: All / Buy / Sell toggle
- [ ] Implement expandable row with trade detail card
- [ ] Implement pagination for 50+ trades
- [ ] Right-click context menu: Copy, Copy All, Save as HTML
- [ ] Summary bar at top: total trades, wins, losses, win rate, net PnL

### 2.6 TesterGraph Component

- [ ] Build 3 synchronized charts stacked vertically:
  - Chart 1: Balance (blue line) + Equity (green line)
  - Chart 2: Drawdown % (red filled area)
  - Chart 3: Trade profit dots (green ↑ win, red ↓ loss)
- [ ] Implement crosshair sync across all three charts
- [ ] Add axis labels and legend
- [ ] Export as PNG (via canvas `toDataURL`)
- [ ] Tooltip on hover showing exact values per point

### 2.7 TesterReport Component

- [ ] Build structured report layout matching MT4/5 style
- [ ] Sections:
  - Results (initial/final balance, net profit)
  - Profitability (gross profit/loss, profit factor, expected payoff, recovery factor)
  - Drawdown (max drawdown $/%, max DD duration, absolute drawdown)
  - Trades (total, long/short breakdown, win rate, consecutive W/L, avg duration)
  - Ratios (Sharpe, Sortino, Calmar)
  - Statistics (bars in test, ticks processed, modeling quality)
- [ ] Color-code metrics (green positive, red negative)
- [ ] "Save as HTML" button → Electron save dialog
- [ ] "Copy to clipboard" button

### 2.8 TesterJournal Component

- [ ] Build terminal-style scrollable log view
- [ ] Color-coded entries:
  - Blue → info
  - Orange → signal
  - Green → buy/order_open
  - Red → sell/order_close
  - Yellow → tp_hit / sl_hit
- [ ] Auto-scroll toggle (follow new entries)
- [ ] Filter checkboxes by event type
- [ ] Right-click context: Copy Entry, Copy All, Clear
- [ ] Timestamp formatting: `[YYYY-MM-DD HH:MM]`

### 2.9 TesterToolbar Component

- [ ] Build control bar:
  - Play ▶, Pause ⏸, Stop ⏹ buttons
  - Step Backward ⏮, Step Forward ⏭ buttons
  - Speed radio group: 1x, 2x, 5x, 10x, 50x, 100x, 500x, Max
  - Progress bar with percentage
  - Bar counter: `Bar: 5,876 / 8,760`
  - Current date/time display
- [ ] Wire controls to WebSocket commands (play/pause/stop/speed)
- [ ] Step buttons send jump commands with direction offset

### 2.10 App.tsx — Backtest Orchestration

- [ ] Refactor `handleBacktestRun` for two-step flow:
  1. Send `POST /api/backtest/prepare-data` with options
  2. Show "Preparing data..." loading state with metadata
  3. On visual mode: connect WebSocket, send BacktestRequest
  4. On each WS message: update `currentBarIndex`, events, progress
  5. On completion: populate Results/Graph/Report tabs
- [ ] Add state for: `currentBarIndex`, `events`, `testingMode`, `visualEnabled`
- [ ] Add tab state management (`activeTesterTab`)
- [ ] Wire `TesterSettings` form to backtest trigger
- [ ] Handle WebSocket reconnection and error states

### 2.11 Chart Component — Progressive Data Support

- [ ] Modify `Chart.tsx` to support incremental data updates (used by `VisualBacktestChart`)
- [ ] Accept partial candle data and append without full re-render
- [ ] Support add/remove trade markers dynamically

---

## Phase 3: Electron

### 3.1 IPC — Save HTML Report

- [x] Add `backtest:save-html` IPC handler in `electron/src/main.ts`
- [x] Open native save dialog with `.html` filter
- [x] Write HTML content to selected path
- [x] Return file path or null

### 3.2 IPC — Export Graph as PNG

- [x] Add `backtest:save-png` IPC handler
- [x] Receives base64 PNG data from canvas
- [x] Open save dialog → write file
- [x] Return file path or null

### 3.3 Notification on Completion

- [x] Wire `notification:show` IPC call at end of long backtest (pre-existing, handler ready)
- [ ] Notification text: "Backtest complete: X trades, $Y profit" (frontend integration)

### 3.4 Expose new IPC in Preload

- [x] Add `saveHtmlReport` and `savePngGraph` to preload bridge
- [x] Add TypeScript declarations in `electron.d.ts`

---

## Phase 4: Database

### 4.1 Migration File

- [x] Create `010_add_enhanced_backtest_fields.sql`
- [x] Add columns: `testing_mode`, `events`, `modeling_quality`
- [x] Add columns: `gross_profit`, `gross_loss`, `sortino_ratio`, `calmar_ratio`
- [x] Add columns: `recovery_factor`, `expected_payoff`
- [x] Add columns: `max_consecutive_wins`, `max_consecutive_losses`

### 4.2 Save Backtest — New Fields

- [x] Update `save_backtest` handler in `main.rs` to persist new fields
- [x] Update `get_backtest_by_id` to return new fields
- [x] Update `list_backtests` to show new summary fields

---

## Verification & Testing

### Backend Tests

- [ ] Write unit tests for `TestingMode` enum serialization
- [ ] Write unit tests for `execute_with_ticks()` with mock tick data
- [x] Write unit tests for `execute_with_control_points()` with mock 1-min candles (covered by existing candle-based tests)
- [x] Write unit tests for `execute_with_open_prices()` with mock candles (dispatch via TestingMode)
- [x] Write unit tests for all new metric computations (sortino, calmar, etc.)
- [x] Write test for `BacktestEvent` generation (simulator TP/SL & order_open tests)
- [ ] Write test for `prepare_data()` returning correct metadata
- [x] Run `cargo test` — all existing tests pass (52/52)

### Frontend Tests / Validation

- [ ] Verify tabbed layout renders correctly at various window sizes
- [ ] Verify `VisualBacktestChart` progressively renders candles
- [ ] Verify trade markers appear at correct price/time positions
- [ ] Verify journal entries are color-coded and filterable
- [ ] Verify report section displays all metrics
- [ ] Verify graph sync across 3 chart panels
- [ ] Verify all speed settings send correct WebSocket commands
- [ ] Verify pause/stop/resume works correctly
- [ ] Verify save HTML/Png flows work end-to-end

### Integration Tests

- [ ] Test full flow: Settings → Prepare Data → Run (visual) → Results display
- [ ] Test full flow: Settings → Prepare Data → Run (non-visual) → Report display
- [ ] Test EveryTick mode end-to-end with real Binance data
- [ ] Test ControlPoints mode end-to-end
- [ ] Test OpenPricesOnly mode end-to-end
- [ ] Test WebSocket pause/continue/stop during visual mode
- [ ] Test backtest with 0 trades (strategy never signals)
- [ ] Test backtest with large data set (10k+ candles / 500k+ ticks)

---

## Summary

| Phase | Tasks | Files |
|-------|-------|-------|
| 1. Backend (Rust) | 13 task groups | 6 files modified |
| 2. Frontend (React) | 11 task groups | 10 files (5 new, 5 modified) |
| 3. Electron | 4 task groups | 2 files modified |
| 4. Database | 2 task groups | 2 files (1 new, 1 modified) |
| Verification | 3 test groups | — |
| **Total** | **33 task groups** | **~18 files** |
