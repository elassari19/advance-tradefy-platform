# Backtest Redesign Plan — MetaTrader 4/5 Style

## Overview

Transform the current backtest system into a full-featured MT4/5-style **Strategy Tester** with:
- Visual mode (progressive candle playback on chart)
- Three testing modes (Every Tick / 1-min OHLC / Open Prices Only)
- Tabbed results: Settings | Results | Graph | Report | Journal
- Chronological event log
- Comprehensive statistics report
- Real-time trade visualization

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    STRATEGY TESTER WINDOW                     │
├──────────────────────────────────────────────────────────────┤
│  [Settings] [Results] [Graph] [Report] [Journal]             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Visual Mode Chart (candles play back progressively)    │  │
│  │  • Trade arrows ▲▼ at entry/exit                       │  │
│  │  • TP/SL dashed lines                                  │  │
│  │  • Current candle highlighted                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  [▶ Play] [⏸ Pause] [⏹ Stop] [⏮ Step -1] [⏭ Step +1] │  │
│  │  Speed: [1x] [2x][5x] [10x] [50x] [100x] [500x] [Max] │  │
│  │  ████████████████████░░░░░░░ 67%                       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Backend (Rust)

### 1.1 Three Testing Modes (`backend/src/models.rs`)

```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum TestingMode {
    EveryTick,       // Process individual ticks — most accurate
    ControlPoints,   // Use 1-min OHLC internally — balance speed/accuracy
    OpenPricesOnly,  // Only open price of each bar — fastest
}
```

Extend `BacktestRequest`:
```rust
pub struct BacktestRequest {
    pub strategy_code: String,
    pub symbol: String,
    pub timeframe: String,
    pub start_time: u64,
    pub end_time: u64,
    pub initial_balance: f64,
    pub commission: f64,
    pub slippage: f64,
    pub speed: u32,
    pub testing_mode: TestingMode,
    pub visual: bool,
}
```

### 1.2 Tick History from Binance (`backend/src/exchange.rs`)

Add `fetch_tick_history()` to `ExchangeStream` trait:

```rust
pub trait ExchangeStream: Send + Sync {
    fn name(&self) -> &str;
    fn connect(&self) -> Result<String, String>;
    fn fetch_history(&self, symbol: &str, interval: &str, start: u64, end: u64) -> Result<Vec<Candle>, String>;
    fn fetch_tick_history(&self, symbol: &str, start: u64, end: u64) -> Result<Vec<Tick>, String>;  // NEW
    fn parse_tick(&self, raw: &str) -> Option<Tick>;
}
```

Binance implementation uses `GET /api/v3/aggTrades`:
```
https://api.binance.com/api/v3/aggTrades?symbol=BTCUSDT&startTime={}&endTime={}&limit=1000
```

Paginate with `fromId` until all ticks in range are collected.

### 1.3 Event Log Model (`backend/src/models.rs`)

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BacktestEvent {
    pub timestamp: u64,
    pub event_type: String,  // "info" | "signal" | "order_open" | "order_close" | "order_modify" | "tp_hit" | "sl_hit" | "error"
    pub description: String,
    pub details: Option<serde_json::Value>,
}
```

Add `events` to `BacktestResult` and `BacktestProgress`.

Add `current_candle` to `BacktestProgress` for visual playback.

### 1.4 Three Execution Modes (`backend/src/backtest.rs`)

```
EveryTick:
  1. Fetch tick history via fetch_tick_history()
  2. Process each tick through SimulatorEngine.process_tick()
  3. Aggregate ticks into micro-candles for strategy context
  4. Record events for every order/TP/SL action
  5. Build equity curve from tick-level PnL
  6. Most accurate, slowest

ControlPoints:
  1. Fetch 1-min candle history regardless of target timeframe
  2. For each 1-min candle: simulate O→H→L→C price path
  3. Check TP/SL within candle range (high/low)
  4. Same accuracy as current candle-mode but enhanced TP/SL checks

OpenPricesOnly:
  1. Fetch target timeframe candles
  2. Execute only at open price of each bar
  3. No intra-bar TP/SL checking
  4. Fastest, least accurate
```

### 1.5 Enhanced Metrics (`backend/src/models.rs` — `BacktestResultSummary`)

Add MT5-style complete statistics:

```rust
// New fields to add:
gross_profit: f64
gross_loss: f64
sortino_ratio: f64
calmar_ratio: f64
recovery_factor: f64
expected_payoff: f64
max_consecutive_wins: u32
max_consecutive_losses: u32
max_drawdown_duration: u64       // in seconds
avg_trade_duration: f64          // in hours
return_on_account: f64           // %
long_trades: u32
short_trades: u32
winning_long_pct: f64
winning_short_pct: f64
modeling_quality: f64            // %
bars_in_test: u32
ticks_processed: u64
```

### 1.6 Two-Step API (`backend/src/main.rs`)

```
Step 1 — Prepare data:
  POST /api/backtest/prepare-data
  Body: { symbol, timeframe, testing_mode, start_time, end_time }
  Response: { status, total_candles, total_ticks, date_range, modeling_quality }

Step 2 — Run backtest:
  POST /api/backtest/run  (existing, enhanced)
  Body: BacktestRequest (with testing_mode, visual)
  Response: BacktestResult (with events, modeling_quality)

Streaming (for visual mode):
  ws://localhost:3000/ws/backtest (existing, enhanced)
  Add to BacktestProgress: events[], current_candle
```

### 1.7 Simulator Event Emission (`backend/src/simulator.rs`)

Modify `SimulatorEngine` to emit events on:
- `place_order()` → "order_open" event
- `close_position()` → "order_close" event
- `process_tick()` on TP hit → "tp_hit" event
- `process_tick()` on SL hit → "sl_hit" event
- `update_position()` → "order_modify" event

Return events alongside trade results.

---

## Phase 2: Frontend (React)

### 2.1 Tabbed Tester Layout (`frontend/src/App.tsx` — modify)

Replace current backtest view with tabbed layout:

```tsx
<div className="tester-layout">
  <div className="tester-tabs">
    <Tab label="Settings" active={tab === 'settings'} />
    <Tab label="Results" active={tab === 'results'} />
    <Tab label="Graph" active={tab === 'graph'} />
    <Tab label="Report" active={tab === 'report'} />
    <Tab label="Journal" active={tab === 'journal'} />
  </div>
  <div className="tester-content">
    {tab === 'settings' && <TesterSettings />}
    {tab === 'results' && <TesterResults />}
    {tab === 'graph' && <TesterGraph />}
    {tab === 'report' && <TesterReport />}
    {tab === 'journal' && <TesterJournal />}
  </div>
  <TesterToolbar />
</div>
```

Tabs appear/dissapear based on state:
- **Settings** + **Journal**: always visible
- **Results**, **Graph**, **Report**: only after backtest completes
- **Optimization Results**, **Optimization Graph**: after optimization (future)

### 2.2 Settings Tab (`frontend/src/components/backtest/TesterSettings.tsx` — NEW)

MT4/5 settings with sections:

```
─ Expert Advisor ──────────────────
  Strategy: [dropdown] [Browse] [Edit]

─ Symbol / Timeframe ─────────────
  Symbol: [BTC/USDT ▼]  TF: [1h ▼]

─ Testing Period ─────────────────
  ○ All history
  ○ Last month / 3 months / Year
  ● Custom: [date] → [date]

─ Testing Mode ────────────────────
  ● Every tick        "Most accurate, slowest"
  ○ 1 minute OHLC     "Balance speed & accuracy"
  ○ Open prices only  "Fastest, least accurate"

─ Parameters ─────────────────────
  Initial balance: [$10,000]
  Commission: [0.1%]
  Slippage: [0.01%]

─ Visual Mode ────────────────────
  ☑ Visual mode
  Speed: [1x] [10x] [100x] [Max]
```

### 2.3 Visual Mode Chart (`frontend/src/components/backtest/VisualBacktestChart.tsx` — NEW)

Progressive candle playback using `lightweight-charts`:

```tsx
const VisualBacktestChart: React.FC<{
  allCandles: Candle[];
  currentBarIndex: number;  // 0 → allCandles.length (increments via WS)
  trades: BacktestTrade[];
  cursorTime?: number;
}> = () => {
  // candles.slice(0, currentBarIndex) → progressively rendered
  // Trade markers: ▲ green for Buy entry, ▼ red for Sell entry
  // Closed trades: line connecting entry → exit
  // TP/SL: horizontal dashed lines at respective prices
  // Current bar: highlighted border
  // Crosshair + tooltip showing bar info
};
```

### 2.4 Results Tab (`frontend/src/components/backtest/TesterResults.tsx` — NEW)

Full trade results table:

- Columns: # | Time | Type | Symbol | Volume | Open Price | SL | TP | Close Price | Commission | Swap | Profit | Balance
- Sortable, filterable by Buy/Sell
- Right-click context: Copy, Copy All, Save as HTML
- Expandable rows with trade detail card
- Pagination for large trade sets

### 2.5 Graph Tab (`frontend/src/components/backtest/TesterGraph.tsx` — NEW)

Three synchronized charts stacked vertically:

```
Chart 1: Balance (blue) + Equity (green) line chart
Chart 2: Drawdown % (red filled area / histogram)
Chart 3: Trade profitability dots (green win ↑, red loss ↓)
```

- Interactive cursor sync across all three charts
- Export as image (PNG via canvas)
- Tooltip on hover showing exact values

### 2.6 Report Tab (`frontend/src/components/backtest/TesterReport.tsx` — NEW)

MT5-style comprehensive report as structured card layout:

```
┌─ Results ──────────────────────────────────┐
│ Initial balance     $10,000.00              │
│ Final balance       $15,234.50              │
│ Net profit          $5,234.50 (+52.35%)    │
│─────────────────────────────────────────────│
│ Profit factor       2.63                    │
│ Expected payoff     $74.78                  │
│ Recovery factor     4.12                    │
│─────────────────────────────────────────────│
│ Max drawdown        $1,270.00 (8.33%)       │
│ Max DD duration     14 days 6h              │
│─────────────────────────────────────────────│
│ Total trades        70                      │
│ Win rate            61.4% (43W / 27L)       │
│ Consecutive wins    8                       │
│ Consecutive losses  4                       │
│─────────────────────────────────────────────│
│ Sharpe ratio        1.85                    │
│ Sortino ratio       2.34                    │
│ Calmar ratio        3.12                    │
│─────────────────────────────────────────────│
│ Bars in test        8,760                   │
│ Ticks processed     1,234,567               │
│ Modeling quality    90.0%                   │
└─────────────────────────────────────────────┘
```

Buttons: "Save as HTML" (electron save dialog), "Copy to clipboard".

### 2.7 Journal Tab (`frontend/src/components/backtest/TesterJournal.tsx` — NEW)

Terminal-style chronological log:

```
[2024-01-15 10:00] INFO  Backtest started — BTCUSDT 1h
[2024-01-15 10:00] SIGNAL Buy signal (RSI < 30)
[2024-01-15 10:00] ORDER  Buy 0.1 @ 45,200 TP:45,800 SL:44,900
[2024-01-15 12:00] SIGNAL Sell signal (RSI > 70)
[2024-01-15 12:00] ORDER  Close Buy 0.1 @ 45,650 +$45.00
[2024-01-15 12:00] ORDER  Sell 0.1 @ 45,650 TP:45,100 SL:46,100
[2024-01-15 14:00] TP     TP hit: Sell 0.1 @ 45,100 +$55.00
```

Features:
- Auto-scroll toggle
- Filter by event type (checkboxes: info, signal, order, tp, sl, error)
- Color-coded: blue=info, green=buy, red=sell, yellow=tp/sl, orange=signal
- Right-click: Copy, Copy All, Clear

### 2.8 Tester Toolbar (`frontend/src/components/backtest/TesterToolbar.tsx` — NEW)

```
┌─────────────────────────────────────────────────────────┐
│  [▶] [⏸] [⏹] [⏮] [⏭]   Speed: 1x ○ 10x ○ 100x ○ Max  │
│  ████████████████████████████░░░░░░░░ 67%               │
│  Bar: 5,876 / 8,760     Time: 2024-08-15 14:00         │
└─────────────────────────────────────────────────────────┘
```

- Play/Pause/Stop buttons
- Step backward/forward (single bar advance for debugging)
- Speed radio buttons: 1x, 2x, 5x, 10x, 50x, 100x, 500x, Max
- Progress bar with bar count
- Current date/time indicator

### 2.9 TypeScript Types Update (`frontend/src/hooks/useBacktest.ts` — modify)

Add new types:

```typescript
export type TestingMode = 'EveryTick' | 'ControlPoints' | 'OpenPricesOnly';

export interface BacktestRequest {
  strategy_code: string;
  symbol: string;
  timeframe: string;
  start_time: number;
  end_time: number;
  initial_balance: number;
  commission: number;
  slippage: number;
  speed?: number;
  testing_mode?: TestingMode;
  visual?: boolean;
}

export interface BacktestEvent {
  timestamp: number;
  event_type: string;
  description: string;
  details?: any;
}

export interface BacktestProgress {
  progress: number;
  trades: BacktestTrade[];
  equity_curve: EquityPoint[];
  events: BacktestEvent[];        // NEW
  current_candle?: Candle;        // NEW
  done: boolean;
  summary?: BacktestResultSummary;
}

export interface BacktestResultSummary {
  // existing fields...
  // NEW:
  gross_profit: number;
  gross_loss: number;
  sortino_ratio: number;
  calmar_ratio: number;
  recovery_factor: number;
  expected_payoff: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  max_drawdown_duration: number;
  avg_trade_duration: number;
  return_on_account: number;
  long_trades: number;
  short_trades: number;
  winning_long_pct: number;
  winning_short_pct: number;
  modeling_quality: number;
  bars_in_test: number;
  ticks_processed: number;
}
```

Add `prepareData()` function:

```typescript
const prepareData = useCallback(async (req: PrepareRequest): Promise<PrepareResponse | null> => {
  // POST /api/backtest/prepare-data
  // Returns data summary: { total_candles, total_ticks, modeling_quality }
}, []);
```

### 2.10 App.tsx Orchestration Updates

Update `handleBacktestRun` for two-step flow:

```
1. User clicks "Run Backtest"
2. If visual mode:
   a. Send prepare-data request, show "Preparing data..." overlay
   b. Connect WebSocket, send BacktestRequest with testing_mode
   c. On each WS message:
      - Update currentBarIndex → VisualBacktestChart redraws
      - Append new events to journal
      - Update progress bar
      - When done: switch Results/Graph/Report tabs visible
3. If non-visual mode:
   a. Send prepare-data (optional, for feedback)
   b. POST /api/backtest/run
   c. Switch to Results tab with full data
```

---

## Phase 3: Electron

### 3.1 IPC for Report Export (`electron/src/main.ts`)

```typescript
ipcMain.handle('backtest:save-html', async (event, htmlContent: string) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: 'backtest-report.html',
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (filePath) {
    await fs.writeFile(filePath, htmlContent, 'utf-8');
    return filePath;
  }
  return null;
});
```

### 3.2 Notification on Completion

Use existing `notification:show` IPC to send OS notification when a long backtest completes.

---

## Phase 4: Database Migration

```sql
-- 010_add_enhanced_backtest_fields.sql
ALTER TABLE backtest_results
  ADD COLUMN IF NOT EXISTS testing_mode VARCHAR(20) DEFAULT 'EveryTick',
  ADD COLUMN IF NOT EXISTS events JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS modeling_quality FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS gross_profit FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS gross_loss FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS sortino_ratio FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS calmar_ratio FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS recovery_factor FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS expected_payoff FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS max_consecutive_wins INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_consecutive_losses INT DEFAULT 0;
```

---

## Data Flow

```
User clicks "Run Backtest"
        │
        ▼
POST /api/backtest/prepare-data
  { symbol, timeframe, testing_mode, start_time, end_time }
        │
        ▼
Backend fetches data:
  EveryTick       → Binance aggTrades API  → Vec<Tick>
  ControlPoints   → Binance klines (1m)    → Vec<Candle>
  OpenPricesOnly  → Binance klines         → Vec<Candle>
        │
        ▼
Response: { total_ticks, total_candles, date_range, modeling_quality }
        │
        ▼
WebSocket: ws://localhost:3000/ws/backtest
  Send: BacktestRequest
        │
        ▼
Backend iterates data → for each tick/candle:
  ─ run_strategy()
  ─ check_signals()
  ─ execute_order() → emit event → record trade
  ─ check_tp_sl()   → emit event → record trade
  ─ update_equity()
  ─ stream: { progress, trades, events, current_candle, equity_curve }
        │
        ▼
Frontend updates:
  VisualBacktestChart  → candle appears, trade markers plotted
  TesterJournal        → new event appended with timestamp
  Progress bar         → advances
        │
        ▼
On complete:
  Results tab → full trade table
  Graph tab   → balance/equity/drawdown charts
  Report tab  → comprehensive statistics
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/src/models.rs` | Modify | TestingMode enum, BacktestEvent, enhanced summary, progress |
| `backend/src/exchange.rs` | Modify | fetch_tick_history() trait + Binance impl |
| `backend/src/backtest.rs` | Modify | Three execution modes, event logging, enhanced metrics, prepare_data() |
| `backend/src/simulator.rs` | Modify | Event emission on order/tp/sl actions |
| `backend/src/main.rs` | Modify | /api/backtest/prepare-data route, enhanced WS streaming |
| `backend/migrations/010_add_enhanced_backtest_fields.sql` | NEW | DB migration |
| `frontend/src/hooks/useBacktest.ts` | Modify | New types, prepareData() |
| `frontend/src/App.tsx` | Modify | Tabbed tester layout, visual mode orchestration |
| `frontend/src/components/backtest/TesterSettings.tsx` | NEW | MT4-style settings tab |
| `frontend/src/components/backtest/TesterResults.tsx` | NEW | Enhanced trade results |
| `frontend/src/components/backtest/TesterGraph.tsx` | NEW | Balance/Equity/Drawdown charts |
| `frontend/src/components/backtest/TesterReport.tsx` | NEW | Comprehensive report |
| `frontend/src/components/backtest/TesterJournal.tsx` | NEW | Chronological event log |
| `frontend/src/components/backtest/VisualBacktestChart.tsx` | NEW | Progressive candle playback |
| `frontend/src/components/backtest/TesterToolbar.tsx` | NEW | Play/Pause/Stop/Speed controls |
| `frontend/src/components/Chart.tsx` | Modify | Support progressive data updates |
| `electron/src/main.ts` | Modify (minor) | IPC for HTML report save |
