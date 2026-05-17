# Tradify TradingView-System Implementation Plan

## Vision

Transform Tradify's existing paper trading terminal into a full TradingView-class
strategies/indicators/alerts platform. The core insight is that TradingView's
value is not just charting — it's the **execution model**: bar-by-bar time series
processing, composable indicators, and event-driven alert routing. Tradify will
replicate this model using Python (via PyO3) for strategy logic and Rust for
the execution engine, with a React frontend for visualization and control.

---

## Architecture Overview


```
┌──────────────────────────────────────────────────────────────────────────┐
│                         TRADIFY SYSTEM MAP                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐                │
│  │  Binance  │──▶│  Rust Engine │──▶│  Strategy Engine  │                │
│  │  WebSocket│   │  (Axum)      │   │  (Bar-by-bar)     │──▶ Simulator  │
│  └──────────┘   └──────┬───────┘   └──────────────────┘                │
│                         │                                                │
│                         ▼                                                │
│                  ┌──────────────┐   ┌──────────────────┐                │
│                  │  Candle       │──▶│  Indicator Engine │                │
│                  │  Aggregator   │   │  (Multi-TF)      │──▶ Chart       │
│                  └──────────────┘   └──────────────────┘                │
│                         │                                                │
│                         ▼                                                │
│                  ┌──────────────┐   ┌──────────────────┐                │
│                  │  Alert Engine │──▶│  Webhook          │                │
│                  │  (Event Eval) │   │  Dispatcher      │──▶ External    │
│                  └──────────────┘   └──────────────────┘                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │  React Frontend                                           │           │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │           │
│  │  │ Chart    │ │ Strategy │ │ Indicator│ │ Backtest    │  │           │
│  │  │ (LWC)   │ │ Editor   │ │ Manager  │ │ Results     │  │           │
│  │  └─────────┘ └──────────┘ └──────────┘ └─────────────┘  │           │
│  └──────────────────────────────────────────────────────────┘           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Bar-by-Bar Execution Engine

### 1.1 Candle Aggregator

TradingView's core abstraction is the **bar** (candle). The engine must
aggregate raw ticks into OHLCV candles before feeding them to strategies.

**New module: `backend/src/candle_aggregator.rs`**

```rust
pub struct CandleAggregator {
    /// Timeframe in minutes
    pub timeframe: u32,
    /// Current building candle (None until first tick)
    pub current: Option<Candle>,
    /// Completed candles (ring buffer, max N bars)
    pub completed: VecDeque<Candle>,
    /// Symbol this aggregator belongs to
    pub symbol: String,
}

impl CandleAggregator {
    pub fn new(symbol: &str, timeframe_minutes: u32) -> Self;
    /// Process a tick, returns vec of newly completed candles (usually 0 or 1)
    pub fn process_tick(&mut self, tick: &Tick) -> Vec<Candle>;
    /// Get the full candle history for backtesting
    pub fn get_history(&self) -> &[Candle];
    /// Reset with historical candles (for backtest init)
    pub fn load_history(&mut self, candles: Vec<Candle>);
}
```

**Architecture decisions:**
- One `CandleAggregator` instance per `(symbol, timeframe)` pair
- Stored in `AppState.aggregators: HashMap<(String, u32), CandleAggregator>`
- Currently only `btcusdt` at `5m` is used; extend to any symbol/timeframe
- Candle time is floored to the timeframe boundary using `(timestamp / interval) * interval`

### 1.2 Strategy Execution Model (Bar-by-Bar)

Replicate Pine Script's execution model:

```
For each bar (oldest → newest):
  1. Set built-in variables: open, high, low, close, volume, time
  2. Execute Python strategy code ONCE
  3. Commit variable states to time series
  4. Process any generated orders (broker emulator)
```

**Modified: `backend/src/strategy.rs`** — add bar-based execution:

```rust
pub fn on_candle(&self, candle: &Candle, webhook_configs: Vec<WebhookConfig>) {
    // Single execution per bar (historical) or per tick (realtime)
    let instance = self.strategies.lock().unwrap().get(&candle.symbol).cloned();
    if let Some(instance) = instance {
        // Pass full OHLCV to Python
        let signal = instance.runtime.execute_on_candle(candle);
        // Route signal → simulator + webhook
    }
}
```

**New Python runtime mode: `backend/src/python_runtime.rs`**

Add a new execution path that provides OHLCV candles instead of raw price:

```python
# Available globals in the new execution mode:
#   open, high, low, close, volume  (current bar values)
#   open[1], close[1], etc.         (history — bar back)
#   buy(qty, tp, sl), sell(qty, tp, sl)

def on_tick(price, open, high, low, close, volume):
    sma_20 = ta.sma(close, 20)  # Uses internal time series
    if close > sma_20:
        buy(0.1)
```

### 1.3 Time Series (History Reference Operator)

TradingView's `close[1]` lets scripts reference previous bar values. Implement
this as a **circular buffer** in the Python runtime:

```rust
pub struct TimeSeries {
    /// Ring buffer of values for each tracked variable
    buffers: HashMap<String, VecDeque<f64>>,
    /// Max history depth
    max_len: usize,
}

impl TimeSeries {
    pub fn push(&mut self, name: &str, value: f64);
    /// Get value N bars back. [1] = previous bar, [0] = current
    pub fn get(&self, name: &str, offset: usize) -> Option<f64>;
}
```

Exposed to Python as callable objects:

```python
# Internally:
#   close[1] → time_series.get("close", 1)
#   close    → time_series.get("close", 0)

# Implementation in injected Python wrapper:
class Series:
    def __init__(self, name, ts):
        self.name = name
        self.ts = ts
    def __getitem__(self, offset):
        return self.ts.get(self.name, offset)
    def __float__(self):
        return self.ts.get(self.name, 0)

close = Series("close", ts)
```

---

## Phase 2: Indicator System

### 2.1 Server-Side Indicator Engine

Currently, built-in indicators (SMA, EMA, RSI, MACD, Bollinger) run
client-side in TypeScript (`frontend/src/utils/indicators.ts`). For advanced
features (multi-timeframe, cross-referencing, strategy use), move them to
the Rust backend.

**New module: `backend/src/indicators/`**

```
backend/src/indicators/
  ├── mod.rs           # Registry + dispatch
  ├── sma.rs           # Simple Moving Average
  ├── ema.rs           # Exponential Moving Average
  ├── rsi.rs           # Relative Strength Index
  ├── macd.rs          # MACD + Signal + Histogram
  ├── bollinger.rs     # Bollinger Bands
  ├── atr.rs           # Average True Range
  ├── stochastic.rs    # Stochastic Oscillator
  └── vwap.rs          # Volume-Weighted Average Price
```

Each indicator implements:

```rust
pub trait Indicator {
    fn name(&self) -> &str;
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput;
    fn parameters(&self) -> Vec<IndicatorParam>;
}

pub struct IndicatorOutput {
    pub plots: Vec<IndicatorPlot>,
    pub lines: Vec<IndicatorLine>,
    pub levels: Vec<f64>,     // e.g., overbought/oversold
}

pub enum IndicatorPlot {
    Line { id: String, label: String, color: String, values: Vec<f64> },
    Histogram { id: String, color: String, values: Vec<f64> },
    Hline { price: f64, color: String, style: String },
}
```

### 2.2 Composable Indicator Pipeline

TradingView lets users layer any number of indicators. Implement a pipeline:

```rust
pub struct IndicatorPipeline {
    indicators: Vec<Box<dyn Indicator>>,
    /// For RSI/MACD etc. in a sub-pane
    pane: Pane,
}

pub enum Pane {
    Overlay,   // Drawn on the main chart
    Sub,       // Drawn in a separate pane below
}
```

**API endpoint:** `POST /api/indicators/evaluate-batch`

```json
{
  "candles": [...],
  "indicators": [
    { "type": "sma", "params": { "period": 20 }, "color": "#3b82f6" },
    { "type": "ema", "params": { "period": 50 }, "color": "#f59e0b" },
    { "type": "rsi", "params": { "period": 14 }, "color": "#22c55e" },
    { "type": "macd", "params": { "fast": 12, "slow": 26, "signal": 9 }, "color": "#8b5cf6" }
  ]
}
```

### 2.3 Multi-Timeframe (MTF) Resolution

TradingView's `security()` function lets scripts pull data from higher
timeframes. Implement via the candle aggregator:

```rust
pub fn resolve(symbol: &str, timeframe: &str, expression: &str) -> f64 {
    // 1. Find or create CandleAggregator for (symbol, timeframe)
    // 2. Return the requested value (e.g., close, high, etc.)
}
```

In Python strategies:

```python
# Available function:
btc_daily_close = request.security("BTCUSDT", "1d", close)
```

**Implementation:**
- Maintain a `HashMap<(String, u32), CandleAggregator>` in AppState
- Each aggregator is fed ticks from the main stream (downsampled by time)
- `request.security()` just reads the latest value from the target aggregator

### 2.4 Custom Python Indicators (Enhanced)

The current custom indicator endpoint (`POST /api/indicator/evaluate`) runs
Python once against a snapshot of candles. Enhance it with:

1. **Streaming evaluation** — run on each new candle, push results to frontend
2. **Multi-output** — allow returning multiple plot lines
3. **Built-in TA functions** — inject common TA functions into Python globals

```python
# New enhanced Python indicator format:
# Available: sma(), ema(), rsi(), macd(), bollinger(), atr(), stoch()
# Available: plot(), plotshape(), hline(), bgcolor()

def run(candles):
    close_series = [c["close"] for c in candles]
    time_series = [c["time"] for c in candles]

    return {
        "plots": [
            {
                "id": "my_indicator",
                "label": "Custom Momentum",
                "type": "line",
                "color": "#f59e0b",
                "values": [x / sum(close_series[:i+1]) * 1000 if i > 0 else 0
                          for i, x in enumerate(close_series)]
            }
        ]
    }
```

### 2.5 Frontend Indicator Panel

**New component: `frontend/src/components/indicators/IndicatorPanel.tsx`**

Replace the simple `IndicatorsModal.tsx` with a proper TradingView-style
indicator panel:

```
┌─────────────────────────────────────┐
│  Search indicators...         [+ Add]│
├─────────────────────────────────────┤
│  ► Favorites                        │
│     SMA (20)                        │
│     EMA (50, 200)                   │
│     RSI (14)                        │
├─────────────────────────────────────┤
│  ► Trend                           │
│     SMA •••                         │
│     EMA •••                         │
│     Bollinger Bands •••             │
│     Ichimoku Cloud •••              │
├─────────────────────────────────────┤
│  ► Oscillators                     │
│     RSI •••                         │
│     MACD •••                        │
│     Stochastic •••                  │
│     CCI •••                         │
├─────────────────────────────────────┤
│  ► Custom (Python)                 │
│     My Momentum Indicator           │
│     Volume Profile                  │
└─────────────────────────────────────┘
```

Each indicator config lets the user set parameters and colors via a
slide-down panel when clicked.

---

## Phase 3: Complete Backtesting Engine

### 3.1 Bar-by-Bar Historical Simulator

**New module: `backend/src/backtest.rs`**

```rust
pub struct BacktestEngine {
    pub initial_balance: f64,
    pub strategy_code: String,
    pub symbol: String,
    pub timeframe: String,
    pub start_time: u64,
    pub end_time: u64,
    pub commission: f64,         // e.g., 0.001 for 0.1%
    pub slippage: f64,           // e.g., 0.0001 for 1bp
}

pub struct BacktestResult {
    pub initial_balance: f64,
    pub final_balance: f64,
    pub net_profit: f64,
    pub total_trades: u32,
    pub winning_trades: u32,
    pub losing_trades: u32,
    pub win_rate: f64,
    pub max_drawdown: f64,
    pub max_drawdown_pct: f64,
    pub sharpe_ratio: f64,
    pub profit_factor: f64,
    pub avg_win: f64,
    pub avg_loss: f64,
    pub largest_win: f64,
    pub largest_loss: f64,
    pub avg_holding_time: f64,     // in bars
    pub trade_history: Vec<BacktestTrade>,
    pub equity_curve: Vec<EquityPoint>,
}
```

**Execution logic:**

```rust
pub fn run(&self) -> Result<BacktestResult, String> {
    let candles = fetch_historical_candles(&self.symbol, &self.timeframe,
                                            self.start_time, self.end_time)?;

    let mut engine = SimulatorEngine::new(self.initial_balance);
    let mut runtime = PythonRuntime::new();

    // Bar-by-bar execution
    for candle in &candles {
        // Call Python on_tick/on_candle with current bar's OHLCV
        let signal = runtime.execute_on_candle(candle);

        if let Some(signal) = signal {
            let order = OrderRequest {
                symbol: self.symbol.clone(),
                side: /* signal.action */,
                quantity: signal.quantity,
                take_profit: signal.tp,
                stop_loss: signal.sl,
            };
            // Fill at next bar's open (or current close for realism)
            engine.place_order(order, candle.close, candle.time);
        }

        // Tick engine to check TP/SL against current bar's full range
        engine.process_candle(candle);   // New: checks OHLC range for stops
    }

    // Calculate metrics from engine state
    Ok(compute_metrics(engine.get_state(), self.initial_balance))
}
```

### 3.2 Candle-Aware TP/SL Processing

Current simulator (`process_tick`) only checks current price. In backtesting
with candles, TP/SL can trigger anywhere within the bar's range:

```rust
impl SimulatorEngine {
    pub fn process_candle(&mut self, candle: &Candle) {
        for pos in self.open_positions.iter_mut() {
            // Check if TP/SL was hit within the candle's range
            // This is more accurate than just checking close
            if pos.side == Buy {
                // Long: SL below low, TP above high
                if pos.stop_loss.is_some_and(|sl| candle.low <= sl) {
                    close_position_at(pos.id, candle, "Stop Loss");
                } else if pos.take_profit.is_some_and(|tp| candle.high >= tp) {
                    close_position_at(pos.id, candle, "Take Profit");
                }
            } else {
                // Short: SL above high, TP below low
                if pos.stop_loss.is_some_and(|sl| candle.high >= sl) {
                    close_position_at(pos.id, candle, "Stop Loss");
                } else if pos.take_profit.is_some_and(|tp| candle.low <= tp) {
                    close_position_at(pos.id, candle, "Take Profit");
                }
            }
        }
    }
}
```

### 3.3 Strategy Performance Metrics

**`POST /api/backtest/run`** — returns full results including:

```
┌───────────────────────────────────────────────┐
│  Performance Summary                           │
│                                                │
│  Net Profit        +$1,245.30  (+12.45%)       │
│  Total Trades      47                           │
│  Win Rate          61.7%                        │
│  Profit Factor     2.14                         │
│  Max Drawdown      -$890.00  (-8.9%)            │
│  Sharpe Ratio      1.42                         │
│  Avg Win           $89.50                       │
│  Avg Loss          -$42.30                      │
│  Largest Win       $320.00                      │
│  Largest Loss      -$150.00                     │
│  Avg Hold Time     3.2 bars                     │
└───────────────────────────────────────────────┘
┌───────────────────────────────────────────────┐
│  Equity Curve                                  │
│  ╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲ (chart)                 │
└───────────────────────────────────────────────┘
┌───────────────────────────────────────────────┐
│  Trade List                                     │
│  # │ Type │ Entry │ Exit  │ PnL   │ Reason     │
│  1 │ BUY  │ 65000 │ 65200 │ +200  │ TP Hit     │
│  2 │ SELL │ 65200 │ 64800 │ +400  │ Manual     │
│  3 │ BUY  │ 64800 │ 64700 │ -100  │ SL Hit     │
└───────────────────────────────────────────────┘
```

### 3.4 Trade Visualization on Chart

Add execution markers (buy arrows, sell arrows, TP/SL lines) on the chart
during backtest replay. Frontend receives `BacktestTrade[]` and renders:

```typescript
// In Chart.tsx — add trade markers:
interface BacktestTradeMarker {
    time: number;
    type: 'buy' | 'sell' | 'tp' | 'sl';
    price: number;
}
// Render using shape markers from lightweight-charts
```

---

## Phase 4: Alert System (Like TradingView's)

### 4.1 Alert Condition Engine

TradingView alerts fire when conditions are met: crossovers, crossunders,
greater than, less than, etc.

**New module: `backend/src/alerts.rs`**

```rust
pub enum AlertCondition {
    Crossing { series1: String, series2: String },
    CrossingUp { series1: String, series2: String },
    CrossingDown { series1: String, series2: String },
    GreaterThan { series: String, value: f64 },
    LessThan { series: String, value: f64 },
    GreaterThanOrEqual { series: String, value: f64 },
    LessThanOrEqual { series: String, value: f64 },
    Range { series: String, upper: f64, lower: f64 },
    Custom { python_expression: String },
}

pub struct AlertRule {
    pub id: String,
    pub name: String,
    pub symbol: String,
    pub timeframe: String,
    pub condition: AlertCondition,
    pub frequency: AlertFrequency,  // OncePerBar, OncePerBarClose, OnEveryTick
    pub actions: Vec<AlertAction>,
    pub enabled: bool,
}

pub enum AlertAction {
    Webhook { url: String, secret: String },
    Email { to: String },
    PushNotification,
    Sound,
}

pub enum AlertFrequency {
    OncePerBarClose,     // Check when bar closes (default)
    OncePerBar,          // Check on every bar update
    OnEveryTick,         // Check on every tick
}
```

### 4.2 Alert Evaluation Pipeline

On each tick/candle close:

```rust
pub fn evaluate_alerts(
    state: &AppState,
    candle: &Candle,
    aggregator: &CandleAggregator,
) -> Vec<TriggeredAlert> {
    let mut triggered = Vec::new();

    for rule in state.alert_rules.lock().unwrap().iter() {
        if rule.symbol != candle.symbol { continue; }
        if !rule.enabled { continue; }

        let met = match &rule.condition {
            Crossing { series1, series2 } => {
                let prev1 = get_series_value(series1, 1, aggregator);
                let prev2 = get_series_value(series2, 1, aggregator);
                let curr1 = get_series_value(series1, 0, aggregator);
                let curr2 = get_series_value(series2, 0, aggregator);
                (prev1 < prev2 && curr1 >= curr2) || (prev1 > prev2 && curr1 <= curr2)
            }
            // ... other conditions
        };

        if met && should_fire(&rule, state.last_alert_fired) {
            triggered.push(TriggeredAlert { rule: rule.clone(), candle: candle.clone() });
        }
    }

    triggered
}
```

### 4.3 Alert Condition Creation UI

**New component: `frontend/src/components/alerts/AlertCreator.tsx`**

A modal where users create alert rules:

```
┌────────────────────────────────────────────────────────────┐
│  Create Alert                                               │
│                                                             │
│  Name: [SMA Crossover Alert              ]                  │
│  Symbol: [BTC/USDT      ▼]                                  │
│  Timeframe: [5m          ▼]                                 │
│                                                             │
│  Condition: [Crossing       ▼]                              │
│  Series 1: [SMA(20)          ▼]  [Add Series...]            │
│  Series 2: [SMA(50)          ▼]                             │
│                                                             │
│  Frequency: [Once Per Bar Close      ▼]                     │
│                                                             │
│  Actions:                                                   │
│  ☑ Webhook  [https://mybot.com/tradingview ▼]  [Edit]       │
│  ☐ Email    [hicham@example.com        ]                    │
│  ☐ Push Notification                                        │
│  ☐ Sound                                                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Preview: "BTC/USDT 5m: SMA(20) crossed SMA(50)"   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Cancel]                          [Create Alert]           │
└────────────────────────────────────────────────────────────┘
```

### 4.4 Webhook Dispatcher (Enhanced)

Current webhook dispatcher is minimal. Enhance with:

1. **Retry logic** — 3 retries with exponential backoff
2. **Payload templates** — user-customizable JSON body
3. **Multiple webhook endpoints** — fire to multiple URLs
4. **Webhook history log** — track delivery status

```rust
pub async fn dispatch_webhook_with_retry(
    config: &WebhookConfig,
    payload: &WebhookPayload,
) -> WebhookResult {
    let mut last_error = None;
    for attempt in 0..3 {
        let delay = Duration::from_millis(1000 * 2u64.pow(attempt));
        match send_webhook(config, payload).await {
            Ok(status) => {
                log_webhook_delivery(config.id, payload, status, None);
                return WebhookResult::Success;
            }
            Err(e) => {
                last_error = Some(e);
                tokio::time::sleep(delay).await;
            }
        }
    }
    log_webhook_delivery(config.id, payload, 0, last_error);
    WebhookResult::Failed
}
```

**New table: `webhook_logs`**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Unique |
| webhook_config_id | UUID | FK to webhook config |
| event_type | String | `strategy_signal`, `alert_triggered` |
| payload | JSONB | Full sent payload |
| response_status | Integer | HTTP status code |
| response_body | Text | Truncated response body |
| error | Text | Error message on failure |
| created_at | Timestamp | When dispatched |

### 4.5 Notification System

TradingView sends push/email/SMS notifications. Implement:

```rust
pub enum NotificationChannel {
    Desktop(NodePush),
    Mobile(APNS | Firebase),
    Email(Sendgrid | SMTP),
    Webhook(Custom),
}
```

**Simplified implementation:**
- **Desktop**: Browser Notification API via WebSocket message
- **Webhook**: Already implemented, extend with template system
- **Email**: Optional via `lettre` crate or SendGrid API
- **Sound**: Play alert sound in browser via Web Audio API

---

## Phase 5: Strategy DSL (TradingView-Inspired Python)

### 5.1 Current State

The current Python DSL is minimal:
```python
def on_tick(price, candles):
    buy(qty, tp, sl) / sell(qty, tp, sl)
```

### 5.2 New DSL — `@strategy` decorator

```python
# Tradify Strategy DSL v2

@strategy(
    title="MACD Crossover",
    overlay=True,          # Plot on main chart
    initial_capital=10000,
    commission=0.001,
    slippage=0.0001,
    default_qty_type="percent_of_equity",
    default_qty_value=100,  # 100% of equity per trade
)
def my_strategy():

    # ── Indicator Setup ──
    fast_ma = input(12, "Fast MA Length")
    slow_ma = input(26, "Slow MA Length")
    signal_ma = input(9, "Signal Line Length")

    macd_line = ta.ema(close, fast_ma) - ta.ema(close, slow_ma)
    signal_line = ta.ema(macd_line, signal_ma)
    histogram = macd_line - signal_line

    # ── Plotting ──
    plot(macd_line, "MACD", color="#8b5cf6")
    plot(signal_line, "Signal", color="#f59e0b")
    plot(histogram, "Histogram", color="#22c55e", style="histogram")
    hline(0, "Zero Line", color="#a1a1aa")

    # ── Entry Conditions ──
    if crossover(macd_line, signal_line):
        strategy.entry("long", strategy.long, stop=close * 0.98)

    if crossunder(macd_line, signal_line):
        strategy.entry("short", strategy.short, stop=close * 1.02)

    # ── Exit Conditions ──
    if histogram > 0 and histogram[1] < 0:  # Histogram turns positive
        strategy.close("short")

    if histogram < 0 and histogram[1] > 0:  # Histogram turns negative
        strategy.close("long")
```

### 5.3 Built-in Functions

Inject the following into Python globals:

| Function | Description | Pine Equivalent |
|----------|-------------|----------------|
| `ta.sma(source, length)` | Simple Moving Average | `ta.sma()` |
| `ta.ema(source, length)` | Exponential Moving Average | `ta.ema()` |
| `ta.rsi(source, length)` | Relative Strength Index | `ta.rsi()` |
| `ta.macd(source, fast, slow, signal)` | MACD | `ta.macd()` |
| `ta.bb(source, length, std)` | Bollinger Bands | `ta.bb()` |
| `ta.atr(length)` | Average True Range | `ta.atr()` |
| `ta.stoch(high, low, close, k, d)` | Stochastic | `ta.stoch()` |
| `ta.crossover(a, b)` | Series A crossed above B | `ta.crossover()` |
| `ta.crossunder(a, b)` | Series A crossed below B | `ta.crossunder()` |
| `ta.highest(source, length)` | Highest value over N bars | `ta.highest()` |
| `ta.lowest(source, length)` | Lowest value over N bars | `ta.lowest()` |
| `ta.change(source, length)` | Change from N bars ago | `ta.change()` |
| `ta.alma(source, length, offset, sigma)` | Arnaud Legoux MA | `ta.alma()` |
| `ta.vwap()` | Volume-Weighted Average Price | `ta.vwap()` |
| `nz(value, fallback)` | Replace NaN with fallback | `nz()` |
| `iff(condition, a, b)` | Ternary conditional | `iff()` |
| `security(symbol, timeframe, expression)` | MTF data pull | `security()` |
| `timeframe.period` | Current chart timeframe string | `timeframe.period` |
| `syminfo.tickerid` | Current symbol | `syminfo.tickerid` |
| `bar_index` | Current bar number | `bar_index` |
| `barstate.isrealtime` | Is the bar currently forming? | `barstate.isrealtime` |
| `barstate.isconfirmed` | Is the bar confirmed (closed)? | `barstate.isconfirmed` |

### 5.4 Plot Functions

| Function | Description | Pine Equivalent |
|----------|-------------|----------------|
| `plot(series, title, color, style, width)` | Plot a line | `plot()` |
| `plotshape(series, title, location, style, size)` | Plot shape markers | `plotshape()` |
| `plotarrow(series, title, colorup, colordown)` | Plot arrows | `plotarrow()` |
| `hline(price, title, color, linestyle)` | Horizontal line | `hline()` |
| `bgcolor(color)` | Bar background color | `bgcolor()` |
| `fill(series1, series2, color)` | Fill between two plots | `fill()` |

### 5.5 Strategy Functions

| Function | Description | Pine Equivalent |
|----------|-------------|----------------|
| `strategy.entry(id, direction, qty, limit, stop)` | Enter a trade | `strategy.entry()` |
| `strategy.exit(id, from_entry, qty, limit, stop)` | Exit a trade | `strategy.exit()` |
| `strategy.close(id, qty)` | Close a trade | `strategy.close()` |
| `strategy.order(id, direction, qty, limit, stop)` | Place an order | `strategy.order()` |
| `strategy.position_size` | Current position size | `strategy.position_size` |
| `strategy.position_avg_price` | Average entry price | `strategy.position_avg_price` |
| `strategy.equity` | Current account equity | `strategy.equity` |

### 5.6 JavaScript Edition (Browser-Side)

For users who prefer JS/TS, add an equivalent DSL that runs in a Web Worker:

```typescript
// Tradify Strategy DSL — JavaScript Edition

export default {
    title: "RSI Mean Reversion",
    overlay: false,  // Sub-chart

    setup() {
        return {
            rsi_period: input(14, "RSI Period"),
            oversold: input(30, "Oversold Threshold"),
            overbought: input(70, "Overbought Threshold"),
        };
    },

    calculate(ctx) {
        const { close, high, low } = ctx.candles;
        const rsi = ta.rsi(close, ctx.params.rsi_period);

        plot(rsi, "RSI", "#22c55e");
        hline(ctx.params.oversold, "Oversold", "#ef4444");
        hline(ctx.params.overbought, "Overbought", "#22c55e");

        if (crossover(rsi, ctx.params.oversold)) {
            strategy.entry("long", strategy.long);
        }
        if (crossunder(rsi, ctx.params.overbought)) {
            strategy.entry("short", strategy.short);
        }
    }
};
```

This runs in a **Web Worker** on the frontend, suitable for lightweight
strategies that don't need the Python backend.

---

## Phase 6: Frontend — Strategy & Backtest UI

### 6.1 Strategy Tab Redesign

Replace the simple `CodeEditor.tsx` with a TradingView Strategy Tester:

```
┌──────────────────────────────────────────────────────┐
│  [Editor] [Backtest] [Settings]    [Deploy] [Remove]  │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │                                                  │ │
│ │  Monaco Editor (Python)                          │ │
│ │  - Syntax highlighting for Tradify DSL           │ │
│ │  - Autocomplete for built-in functions           │ │
│ │  - Pane for plot output preview                  │ │
│ │                                                  │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │  [Run Backtest] [1y ▼] [1h ▼] [$10k ▼]  [Go]    │ │
│ ├──────────────────────────────────────────────────┤ │
│ │  Performance Summary (collapsible)               │ │
│ │  Equity Curve (mini chart)                       │ │
│ │  Trade List (sortable table)                     │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 6.2 Backtest Configuration Panel

**New component: `frontend/src/components/backtest/BacktestConfig.tsx`**

```
┌─────────────────────────────────────────────────┐
│  Backtest Settings                               │
│                                                   │
│  Symbol:    [BTC/USDT                        ▼]   │
│  Timeframe: [1h                              ▼]   │
│  Date Range:                                    │
│    From: [2025-01-01]  To: [2026-05-16]       │
│                                                   │
│  Initial Capital: [$10,000       ]                │
│  Commission:  [0.1          ] %                  │
│  Slippage:    [0.01         ] %                  │
│                                                   │
│  Order Type: [Market              ▼]              │
│  Pyramiding: [1                   ] (max entries) │
│                                                   │
│  [Run Backtest]  [Optimize Parameters]            │
└─────────────────────────────────────────────────┘
```

### 6.3 Backtest Results Dashboard

**New component: `frontend/src/components/backtest/BacktestResults.tsx`**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Backtest Results — MACD Crossover on BTC/USDT 1h                    │
│  Jan 1, 2025 – May 16, 2026                                          │
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│ │ Net Profit│ │ Win Rate │ │ Profit   │ │ Sharpe   │ │ Max         │ │
│ │ +$2,450  │ │ 58.3%    │ │ Factor   │ │ Ratio    │ │ Drawdown    │ │
│ │ (+24.5%) │ │          │ │ 1.89     │ │ 1.34     │ │ -$1,200     │ │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │ (-8.5%)     │ │
│                                                     └─────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Equity Curve (interactive chart)                                    │
│  ╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲                │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Trade List (sortable)                                               │
│  ┌─────┬──────┬──────┬──────┬───────┬───────┬────────┬──────────┐  │
│  │  #  │ Side │Entry │Exit  │  PnL  │  %    │Reason  │ Duration │  │
│  ├─────┼──────┼──────┼──────┼───────┼───────┼────────┼──────────┤  │
│  │  1  │ BUY  │65200 │66800 │+1600  │+2.45% │ TP Hit │  3h 12m  │  │
│  │  2  │ SELL │66800 │66100 │ +700  │+1.05% │ SL Hit │  1h 45m  │  │
│  │  3  │ BUY  │66100 │65800 │ -300  │-0.45% │ Manual │  0h 30m  │  │
│  └─────┴──────┴──────┴──────┴───────┴───────┴────────┴──────────┘  │
│                                                                      │
│  [Export CSV]  [Save Result]  [Show on Chart]                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.4 Strategy Optimization

**New component: `frontend/src/components/backtest/OptimizationPanel.tsx`**

```typescript
interface ParameterRange {
    name: string;
    type: 'int' | 'float';
    min: number;
    max: number;
    step: number;
}
```

UI allows users to define ranges for strategy parameters, then the backend
runs a grid search:

```rust
pub fn run_optimization(
    code: String,
    symbol: String,
    timeframe: String,
    ranges: Vec<ParameterRange>,
) -> Vec<OptimizationResult> {
    // Cartesian product of all parameter values
    // Run backtest for each combination
    // Return sorted by Sharpe ratio / net profit
}
```

### 6.5 Frontend Routes & Navigation

Add proper routing for different views:

```
/trade           → Live trading view (current default)
/trade/:symbol   → Live trading with specific symbol selected
/backtest        → Backtest configuration + results
/backtest/:id    → Saved backtest results
/strategies      → Library of saved strategies
/alerts          → Alert management dashboard
/settings        → Webhook, API key, notification settings
```

Use React Router (`react-router-dom`) for navigation.

---

## Phase 7: Data Pipeline Enhancements

### 7.1 Multiple Exchange Support

Current: Binance only. Add exchange abstraction:

```rust
pub trait ExchangeStream {
    fn connect(&self) -> Pin<Box<dyn Stream<Item = Tick> + Send>>;
    fn fetch_history(&self, symbol: &str, interval: &str, limit: u32) -> Vec<HistoricalCandle>;
}

pub struct BinanceStream { ... }
pub struct BybitStream { ... }
pub struct CoinbaseStream { ... }
pub struct PolygonStream { ... }  // For stocks/forex
```

### 7.2 Historical Data Caching

Cache historical candles to avoid re-fetching from Binance:

```sql
CREATE TABLE candle_cache (
    symbol      TEXT NOT NULL,
    timeframe   TEXT NOT NULL,
    open_time   BIGINT NOT NULL,
    open        DOUBLE PRECISION,
    high        DOUBLE PRECISION,
    low         DOUBLE PRECISION,
    close       DOUBLE PRECISION,
    volume      DOUBLE PRECISION,
    PRIMARY KEY (symbol, timeframe, open_time)
);
```

### 7.3 Streaming State Persistence

When the server restarts, open positions and strategy state must be
restored (TradingView doesn't do this — their strategies reset on reload):

```rust
pub fn save_state(&self) {
    // Serialize SimulatorState + active strategies to PostgreSQL
    // Called every N ticks and on shutdown
}

pub fn load_state() -> (SimulatorState, Vec<StrategyInstance>) {
    // Restore from PostgreSQL
}

// In main.rs — graceful shutdown handler:
tokio::signal::ctrl_c().await.unwrap();
tracing::info!("Shutting down, saving state...");
app_state.save_state().await;
```

---

## Phase 8: Backend API Routes

### 8.1 New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/backtest/run` | Run a backtest |
| `GET`  | `/api/backtest/:id` | Get saved backtest results |
| `GET`  | `/api/backtest/list` | List all saved backtests |
| `POST` | `/api/backtest/save` | Save backtest results |
| `POST` | `/api/backtest/optimize` | Run parameter optimization |
| `GET`  | `/api/indicators/list` | List all available built-in indicators |
| `POST` | `/api/indicators/evaluate-batch` | Evaluate multiple indicators at once |
| `POST` | `/api/indicators/custom/evaluate` | Evaluate custom Python indicator |
| `POST` | `/api/indicators/custom/save` | Save a custom indicator definition |
| `GET`  | `/api/indicators/custom/list` | List saved custom indicators |
| `GET`  | `/api/alerts` | List all alert rules |
| `POST` | `/api/alerts` | Create/update alert rule |
| `DELETE` | `/api/alerts/:id` | Delete alert rule |
| `GET`  | `/api/webhooks/logs` | Get webhook delivery history |
| `POST` | `/api/strategy/deploy` | Deploy strategy (existing, enhanced) |
| `POST` | `/api/strategy/save` | Save strategy code to DB |
| `GET`  | `/api/strategy/list` | List saved strategies |

### 8.2 Backtest DB Schema

```sql
CREATE TABLE backtest_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_name   TEXT NOT NULL,
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

CREATE TABLE webhook_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_config_id UUID NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    response_status INTEGER,
    response_body   TEXT,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (webhook_config_id) REFERENCES webhook_configs(id) ON DELETE CASCADE
);

CREATE TABLE alert_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    timeframe       TEXT NOT NULL,
    condition       JSONB NOT NULL,
    frequency       TEXT NOT NULL DEFAULT 'OncePerBarClose',
    actions         JSONB NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE saved_strategies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    symbol          TEXT,
    timeframe       TEXT,
    code            TEXT NOT NULL,
    parameters      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.3 Webhook Config Table

```sql
ALTER TABLE webhook_configs ADD COLUMN IF NOT EXISTS
    template TEXT DEFAULT '{"event_type":"strategy_signal","timestamp":"{{timestamp}}","trade":{{trade}},"security_token":"{{secret}}"}';

ALTER TABLE webhook_configs ADD COLUMN IF NOT EXISTS
    retry_count INTEGER DEFAULT 3;

ALTER TABLE webhook_configs ADD COLUMN IF NOT EXISTS
    timeout_ms INTEGER DEFAULT 5000;
```

---

## Phase 9: Implementation Order

### Sprint 1: Bar-by-Bar Engine Foundation (Week 1)
1. Implement `CandleAggregator` — tick → OHLCV candle
2. Modify strategy engine to execute on candle close (not every tick)
3. Build `TimeSeries` struct with history reference operator
4. Update `PythonRuntime` to inject OHLCV + time series into Python globals
5. Add `process_candle()` to `SimulatorEngine` for OHLC-range-aware TP/SL

### Sprint 2: Backtesting Engine (Week 2)
1. Implement `BacktestEngine` with bar-by-bar historical simulation
2. Compute performance metrics (Sharpe, drawdown, win rate, etc.)
3. Create `POST /api/backtest/run` endpoint
4. Add `POST /api/backtest/save` + `GET /api/backtest/:id` endpoints
5. Build frontend `BacktestConfig` component
6. Build frontend `BacktestResults` dashboard

### Sprint 3: Indicator System (Week 3)
1. Implement Rust-native indicators: SMA, EMA, RSI, MACD, Bollinger, ATR
2. Create `POST /api/indicators/evaluate-batch` endpoint
3. Build `IndicatorPipeline` for composable multi-indicator evaluation
4. Implement multi-timeframe resolution (`request.security()`)
5. Build frontend `IndicatorPanel` (search, categories, configuration)
6. Replace client-side indicator computation with server-side batch evaluate

### Sprint 4: Alert & Webhook Enhancements (Week 4)
1. Implement `AlertEngine` with condition evaluation
2. Build `AlertRule` CRUD API endpoints
3. Add webhook retry logic + payload templates
4. Build `POST /api/webhooks/logs` + webhook history viewer
5. Build frontend `AlertCreator` component
6. Add browser notification support (WebSocket push → Notification API)
7. Enhance webhook payload with customizable template syntax

### Sprint 5: Strategy DSL & Advanced Features (Week 5)
1. Implement Python TA function library (all functions in §5.3)
2. Implement plot/plotshape/hline/bgcolor in strategy runtime
3. Build `@strategy` decorator for Python DSL
4. Add JavaScript strategy runner (Web Worker)
5. Implement `POST /api/backtest/optimize` parameter grid search
6. Build frontend optimization panel
7. Add strategy library (save/load/deploy)

### Sprint 6: Polish & Edge Cases (Week 6)
1. Add stream state persistence (save/restore positions + strategies)
2. Implement historical data caching in PostgreSQL
3. Add exchange abstraction layer (support Bybit, Coinbase)
4. Add backtest trade markers on live chart
5. Performance profiling (like Pine Profiler for Python execution)
6. Edge case handling:
   - Division by zero in indicators
   - Insufficient history for indicator calculation
   - Exchange disconnection & reconnection
   - Webhook timeout & retry exhaustion
   - Strategy deployment with syntax errors
   - Multiple alerts on same tick (deduplication)

---

## Phase 10: Testing Strategy

### Unit Tests (Rust)
```
candle_aggregator_tests.rs
  - test_empty_start
  - test_single_tick_creates_candle
  - test_multiple_ticks_same_candle
  - test_timeframe_boundary_rollover
  - test_realtime_candle_updates_until_closed

indicator_tests.rs
  - test_sma_values
  - test_ema_equivalence_with_sma_at_period
  - test_rsi_known_values
  - test_macd_calculation
  - test_bollinger_bands

backtest_tests.rs
  - test_simple_buy_and_hold
  - test_strategy_that_never_trades
  - test_tp_sl_within_candle_range
  - test_commission_deduction
  - test_multiple_entries_same_bar

alert_tests.rs
  - test_crossover_detection
  - test_crossunder_detection
  - test_threshold_crossing
  - test_frequency_limiting
  - test_multiple_actions
```

### Integration Tests
```
test_backtest_api_flow:
  1. POST /api/backtest/run with known strategy
  2. Assert result contains expected metrics
  3. POST /api/backtest/save with result
  4. GET /api/backtest/:id → assert response matches saved data

test_indicator_batch_api:
  1. POST /api/indicators/evaluate-batch with 3 indicators
  2. Assert response contains 3 outputs
  3. Verify each output has correct number of data points

test_alert_lifecycle:
  1. POST /api/alerts with crossover condition
  2. GET /api/alerts → assert rule exists
  3. Simulate tick that triggers crossover
  4. Assert webhook was dispatched with correct payload
  5. DELETE /api/alerts/:id → assert rule removed
```

### E2E Tests (Cypress or Playwright)
```
test_backtest_flow:
  1. Open chart
  2. Open strategy editor, select MACD Crossover template
  3. Click "Run Backtest"
  4. Assert results panel appears with metrics
  5. Assert trade markers appear on chart

test_alert_creation:
  1. Open alert creator modal
  2. Configure condition, frequency, webhook action
  3. Save alert
  4. Assert alert appears in alert list
  5. Assert webhook fires on next matching candle

test_indicator_management:
  1. Open indicator panel
  2. Add SMA(20), RSI(14), MACD
  3. Assert chart renders 3 indicator overlays/sub-charts
  4. Remove RSI → assert sub-chart pane disappears
  5. Change SMA period from 20 to 50 → assert chart updates
```

---

## Summary

This plan transforms Tradify from a simple paper trading terminal into a
complete TradingView-class platform by:

1. **Bar-by-bar execution** — matching Pine Script's core execution model
2. **Server-side indicator engine** — composable, multi-timeframe, accurate
3. **Full backtesting** — historical simulation with comprehensive metrics
4. **Alert system** — event-driven conditions with webhook/push/email dispatch
5. **TradingView-style DSL** — Python and JavaScript strategy languages
6. **Strategy optimization** — parameter grid search
7. **Persistence** — stateful strategies survive server restarts

The architecture builds on Tradify's existing Rust/PyO3/React foundation,
adding approximately 6-8 new backend modules and 10-15 new frontend
components over 6 sprints.
