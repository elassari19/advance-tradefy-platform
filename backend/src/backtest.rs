use crate::exchange::ExchangeStream;
use crate::models::{
    BacktestEvent, BacktestProgress, BacktestRequest, BacktestResult, BacktestResultSummary,
    BacktestTrade, Candle, EquityPoint, OptimizeRequest, OptimizationResult, OrderRequest,
    PreparedData, TestingMode, Tick, TradeSide,
};
use crate::python_runtime::PythonRuntime;
use crate::simulator::SimulatorEngine;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

pub struct BacktestEngine {
    pub request: BacktestRequest,
}

impl BacktestEngine {
    pub fn new(request: BacktestRequest) -> Self {
        Self { request }
    }

    pub async fn fetch_historical_candles(&self) -> Result<Vec<Candle>, String> {
        let interval = &self.request.timeframe;
        let start_ms = self.request.start_time * 1000;
        let end_ms = self.request.end_time * 1000;

        let mut all_candles = Vec::new();
        let mut current_start = start_ms;

        loop {
            let url = format!(
                "https://api.binance.com/api/v3/klines?symbol={}&interval={}&startTime={}&endTime={}&limit=1000",
                self.request.symbol, interval, current_start, end_ms
            );

            let resp = reqwest::get(&url).await
                .map_err(|e| format!("Failed to fetch from Binance: {}", e))?;

            let klines: Vec<Vec<serde_json::Value>> = resp.json().await
                .map_err(|e| format!("Failed to parse Binance klines: {}", e))?;

            if klines.is_empty() {
                break;
            }

            for k in &klines {
                let open_time = k.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
                let open = k.get(1).and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let high = k.get(2).and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let low = k.get(3).and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let close = k.get(4).and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let volume = k.get(5).and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);

                all_candles.push(Candle {
                    time: (open_time / 1000) as u64,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    symbol: self.request.symbol.clone(),
                    is_closed: true,
                });

                current_start = (open_time + 1) as u64;
            }

            if klines.len() < 1000 {
                break;
            }
        }

        if all_candles.is_empty() {
            return Err("No historical data returned from Binance".to_string());
        }

        Ok(all_candles)
    }

    pub async fn prepare_data(&self) -> Result<PreparedData, String> {
        match self.request.testing_mode {
            TestingMode::EveryTick => {
                let ticks = self.fetch_historical_ticks().await?;
                Ok(PreparedData::Ticks(ticks))
            }
            TestingMode::ControlPoints => {
                let mut req = self.request.clone();
                req.timeframe = "1m".to_string();
                let engine = BacktestEngine::new(req);
                let candles = engine.fetch_historical_candles().await?;
                Ok(PreparedData::Candles(candles))
            }
            TestingMode::OpenPricesOnly | TestingMode::ClosePricesOnly => {
                let candles = self.fetch_historical_candles().await?;
                Ok(PreparedData::Candles(candles))
            }
        }
    }

    pub async fn run_with_candles(&self, candles: Vec<Candle>) -> Result<BacktestResult, String> {
        self.execute_with_candles(candles)
    }

    pub async fn run(&self) -> Result<BacktestResult, String> {
        match self.request.testing_mode {
            TestingMode::EveryTick => {
                let ticks = self.fetch_historical_ticks().await?;
                self.execute_with_ticks(ticks)
            }
            _ => {
                let candles = if self.request.testing_mode == TestingMode::ControlPoints {
                    let mut req = self.request.clone();
                    req.timeframe = "1m".to_string();
                    let engine = BacktestEngine::new(req);
                    engine.fetch_historical_candles().await?
                } else {
                    self.fetch_historical_candles().await?
                };
                self.execute_with_candles(candles)
            }
        }
    }

    pub fn execute_with_candles(&self, candles: Vec<Candle>) -> Result<BacktestResult, String> {
        let speed = Arc::new(AtomicU32::new(1));
        let paused = Arc::new(AtomicBool::new(false));
        let cancelled = Arc::new(AtomicBool::new(false));
        self.execute_with_candles_impl(candles, None, speed, Some(paused), Some(cancelled))
    }

    pub fn execute_with_candles_streaming(
        &self,
        candles: Vec<Candle>,
        progress_tx: UnboundedSender<BacktestProgress>,
        speed: Arc<AtomicU32>,
        paused: Arc<AtomicBool>,
        cancelled: Arc<AtomicBool>,
    ) -> Result<BacktestResult, String> {
        self.execute_with_candles_impl(candles, Some(progress_tx), speed, Some(paused), Some(cancelled))
    }

    pub async fn fetch_historical_ticks(&self) -> Result<Vec<Tick>, String> {
        use crate::exchange::BinanceStream;
        let stream = BinanceStream::new();
        stream.fetch_tick_history(
            &self.request.symbol,
            self.request.start_time,
            self.request.end_time,
        )
    }

    pub fn execute_with_ticks(&self, ticks: Vec<Tick>) -> Result<BacktestResult, String> {
        if ticks.is_empty() {
            return Err("No tick data provided for backtest execution".to_string());
        }

        let engine = SimulatorEngine::new(self.request.initial_balance);
        let runtime = PythonRuntime::new();

        let mut all_events: Vec<BacktestEvent> = Vec::new();
        let mut equity_curve = Vec::with_capacity(ticks.len() / 100);
        let mut all_trades: Vec<BacktestTrade> = Vec::new();
        let mut bar_index = 0u32;
        let total = ticks.len();

        // Aggregate ticks into micro-candles (group by second)
        let mut micro_candle: Option<Candle> = None;
        let mut next_micro_time = 0u64;

        for (idx, tick) in ticks.iter().enumerate() {
            // Build micro-candle context
            if micro_candle.is_none() || tick.time >= next_micro_time {
                if let Some(c) = micro_candle.take() {
                    let state = engine.get_state();
                    let pos = state.open_positions.iter().find(|p| p.symbol == self.request.symbol);
                    let (pos_size, pos_avg, equity) = match pos {
                        Some(p) => (p.quantity, p.entry_price, state.balance + state.open_positions.iter().map(|pos| pos.pnl).sum::<f64>()),
                        None => (0.0, 0.0, state.balance),
                    };
                    runtime.set_position_state(pos_size, pos_avg, equity);

                    if let Err(e) = runtime.execute_on_candle(&self.request.strategy_code, &c) {
                        tracing::warn!("Backtest Python error at tick {}: {}", idx, e);
                    }
                }
                next_micro_time = tick.time + 1;
            }

            let current_micro = micro_candle.get_or_insert(Candle {
                time: tick.time,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price,
                volume: 0.0,
                symbol: self.request.symbol.clone(),
                is_closed: false,
            });
            current_micro.high = current_micro.high.max(tick.price);
            current_micro.low = current_micro.low.min(tick.price);
            current_micro.close = tick.price;
            current_micro.volume += 1.0;

            if let Some(signal) = runtime.get_signal() {
                match signal.action.as_str() {
                    "CLOSE" | "EXIT" => {
                        let st = engine.get_state();
                        for p in &st.open_positions {
                            if p.symbol == self.request.symbol {
                                if let Ok(event) = engine.close_position(&p.id, tick.time) {
                                    all_events.push(event);
                                }
                            }
                        }
                    }
                    action if action == "BUY" || action == "SELL" => {
                        let order = OrderRequest {
                            symbol: self.request.symbol.clone(),
                            side: if action == "BUY" { TradeSide::Buy } else { TradeSide::Sell },
                            quantity: signal.quantity,
                            take_profit: signal.take_profit,
                            stop_loss: signal.stop_loss,
                        };
                        let slip = tick.price * self.request.slippage;
                        let fill_price = match order.side {
                            TradeSide::Buy => tick.price + slip,
                            TradeSide::Sell => tick.price - slip,
                        };
                        if let Ok((_, event)) = engine.place_order(order, fill_price, tick.time) {
                            all_events.push(event);
                        }
                    }
                    _ => {
                        tracing::warn!("Unknown backtest signal action: {}", signal.action);
                    }
                }
            }

            let tick_events = engine.process_tick(tick);
            all_events.extend(tick_events);

            let state = engine.get_state();
            let mut total_pnl = 0.0;
            for pos in &state.open_positions {
                let pnl = match pos.side {
                    TradeSide::Buy => (tick.price - pos.entry_price) * pos.quantity,
                    TradeSide::Sell => (pos.entry_price - tick.price) * pos.quantity,
                };
                total_pnl += pnl;
            }
            let equity = state.balance + total_pnl;

            // Sample equity curve every ~100 ticks
            if idx % 100 == 0 || idx == total - 1 {
                equity_curve.push(EquityPoint {
                    bar_index,
                    time: tick.time,
                    equity,
                    balance: state.balance,
                    drawdown: 0.0,
                    drawdown_pct: 0.0,
                });
                bar_index += 1;
            }

            all_trades = state.history.iter().map(|t| {
                BacktestTrade {
                    id: t.id.clone(),
                    side: format!("{:?}", t.side),
                    entry_price: t.entry_price,
                    exit_price: t.exit_price,
                    quantity: t.quantity,
                    pnl: t.pnl,
                    pnl_pct: if t.entry_price > 0.0 { (t.pnl / (t.entry_price * t.quantity)) * 100.0 } else { 0.0 },
                    opened_at: t.opened_at,
                    closed_at: t.closed_at,
                    exit_reason: t.exit_reason.clone(),
                    holding_bars: 0,
                    take_profit: t.take_profit,
                    stop_loss: t.stop_loss,
                }
            }).collect();
        }

        let state = engine.get_state();
        let summary = self.compute_enhanced_summary(&state, &all_trades, &equity_curve, total as u64);
        let trades = rebuild_trades(&state);
        let equity = rebuild_equity(&equity_curve);

        Ok(BacktestResult {
            summary,
            trades,
            equity_curve: equity,
            events: all_events,
            request: self.request.clone(),
        })
    }

    fn execute_with_candles_impl(
        &self,
        candles: Vec<Candle>,
        progress_tx: Option<UnboundedSender<BacktestProgress>>,
        speed: Arc<AtomicU32>,
        paused: Option<Arc<AtomicBool>>,
        cancelled: Option<Arc<AtomicBool>>,
    ) -> Result<BacktestResult, String> {
        if candles.is_empty() {
            return Err("No candles provided for backtest execution".to_string());
        }

        let engine = SimulatorEngine::new(self.request.initial_balance);
        let runtime = PythonRuntime::new();

        let mut all_events: Vec<BacktestEvent> = Vec::new();
        let mut equity_curve = Vec::with_capacity(candles.len());
        let mut bar_index = 0u32;
        let total = candles.len();
        let mut all_trades: Vec<BacktestTrade> = Vec::new();

        for (idx, candle) in candles.iter().enumerate() {
            if let Some(ref paused) = paused {
                while paused.load(Ordering::Relaxed) {
                    if let Some(ref cancelled) = cancelled {
                        if cancelled.load(Ordering::Relaxed) {
                            return Err("Backtest cancelled by user".to_string());
                        }
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            if let Some(ref cancelled) = cancelled {
                if cancelled.load(Ordering::Relaxed) {
                    return Err("Backtest cancelled by user".to_string());
                }
            }

            // ControlPoints: simulate O→H→L→C path
            let execution_price = if self.request.testing_mode == TestingMode::OpenPricesOnly {
                candle.open
            } else if self.request.testing_mode == TestingMode::ClosePricesOnly {
                candle.close
            } else {
                candle.close
            };

            let state = engine.get_state();
            let pos = state.open_positions.iter().find(|p| p.symbol == self.request.symbol);
            let (pos_size, pos_avg, equity) = match pos {
                Some(p) => (p.quantity, p.entry_price, state.balance + state.open_positions.iter().map(|pos| pos.pnl).sum::<f64>()),
                None => (0.0, 0.0, state.balance),
            };
            runtime.set_position_state(pos_size, pos_avg, equity);

            if let Err(e) = runtime.execute_on_candle(&self.request.strategy_code, candle) {
                tracing::warn!("Backtest Python error at candle {}: {}", idx, e);
            }

            if let Some(signal) = runtime.get_signal() {
                match signal.action.as_str() {
                    "CLOSE" | "EXIT" => {
                        let st = engine.get_state();
                        for p in &st.open_positions {
                            if p.symbol == self.request.symbol {
                                if let Ok(event) = engine.close_position(&p.id, candle.time) {
                                    all_events.push(event);
                                }
                            }
                        }
                    }
                    action if action == "BUY" || action == "SELL" => {
                        let order = OrderRequest {
                            symbol: self.request.symbol.clone(),
                            side: if action == "BUY" { TradeSide::Buy } else { TradeSide::Sell },
                            quantity: signal.quantity,
                            take_profit: signal.take_profit,
                            stop_loss: signal.stop_loss,
                        };
                        let slip = execution_price * self.request.slippage;
                        let fill_price = match order.side {
                            TradeSide::Buy => execution_price + slip,
                            TradeSide::Sell => execution_price - slip,
                        };
                        if let Ok((_, event)) = engine.place_order(order, fill_price, candle.time) {
                            all_events.push(event);
                        }
                    }
                    _ => {
                        tracing::warn!("Unknown backtest signal action: {}", signal.action);
                    }
                }
            }

            if self.request.testing_mode == TestingMode::ControlPoints {
                // Intra-bar simulation: check TP/SL at O→H→L→C
                let state = engine.get_state();
                let mut need_recheck = true;
                while need_recheck {
                    need_recheck = false;
                    for p in state.open_positions.iter() {
                        if p.symbol != self.request.symbol { continue; }
                        if let Some(tp) = p.take_profit {
                            if (p.side == TradeSide::Buy && candle.high >= tp) ||
                               (p.side == TradeSide::Sell && candle.low <= tp) {
                                if let Ok(event) = engine.close_position(&p.id, candle.time) {
                                    all_events.push(event);
                                    need_recheck = true;
                                    break;
                                }
                            }
                        }
                        if let Some(sl) = p.stop_loss {
                            if (p.side == TradeSide::Buy && candle.low <= sl) ||
                               (p.side == TradeSide::Sell && candle.high >= sl) {
                                if let Ok(event) = engine.close_position(&p.id, candle.time) {
                                    all_events.push(event);
                                    need_recheck = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            } else if self.request.testing_mode != TestingMode::OpenPricesOnly && self.request.testing_mode != TestingMode::ClosePricesOnly {
                // Normal candle processing with TP/SL checking
                let candle_events = engine.process_candle(candle);
                all_events.extend(candle_events);
            }

            let state = engine.get_state();
            let mut total_pnl = 0.0;
            for pos in &state.open_positions {
                let pnl = match pos.side {
                    TradeSide::Buy => (candle.close - pos.entry_price) * pos.quantity,
                    TradeSide::Sell => (pos.entry_price - candle.close) * pos.quantity,
                };
                total_pnl += pnl;
            }
            let equity = state.balance + total_pnl;
            let max_peak = equity_curve.iter().map(|e: &EquityPoint| e.equity).fold(equity, f64::max);
            let drawdown = (max_peak - equity).max(0.0);
            let drawdown_pct = if max_peak > 0.0 {
                (drawdown / max_peak) * 100.0
            } else {
                0.0
            };

            equity_curve.push(EquityPoint {
                bar_index,
                time: candle.time,
                equity,
                balance: state.balance,
                drawdown,
                drawdown_pct,
            });

            bar_index += 1;

            all_trades = state.history.iter().map(|t| {
                BacktestTrade {
                    id: t.id.clone(),
                    side: format!("{:?}", t.side),
                    entry_price: t.entry_price,
                    exit_price: t.exit_price,
                    quantity: t.quantity,
                    pnl: t.pnl,
                    pnl_pct: if t.entry_price > 0.0 { (t.pnl / (t.entry_price * t.quantity)) * 100.0 } else { 0.0 },
                    opened_at: t.opened_at,
                    closed_at: t.closed_at,
                    exit_reason: t.exit_reason.clone(),
                    holding_bars: 0,
                    take_profit: t.take_profit,
                    stop_loss: t.stop_loss,
                }
            }).collect();

            if let Some(ref tx) = progress_tx {
                let current_speed = speed.load(Ordering::Relaxed).max(1) as usize;
                if idx % current_speed == 0 || idx == total - 1 {
                    let p = idx as f64 / total as f64;
                    let _ = tx.send(BacktestProgress {
                        progress: p,
                        trades: all_trades.clone(),
                        equity_curve: equity_curve.clone(),
                        events: all_events.clone(),
                        current_candle: Some(candle.clone()),
                        done: false,
                        summary: None,
                    });
                }
            }
        }

        let state = engine.get_state();
        let summary = self.compute_enhanced_summary(&state, &all_trades, &equity_curve, 0);
        let trades = rebuild_trades(&state);
        let equity = rebuild_equity(&equity_curve);

        if let Some(ref tx) = progress_tx {
            let _ = tx.send(BacktestProgress {
                progress: 1.0,
                trades: trades.clone(),
                equity_curve: equity.clone(),
                events: all_events.clone(),
                current_candle: None,
                done: true,
                summary: Some(summary.clone()),
            });
        }

        Ok(BacktestResult {
            summary,
            trades,
            equity_curve: equity,
            events: all_events,
            request: self.request.clone(),
        })
    }

    fn compute_enhanced_summary(
        &self,
        state: &crate::models::SimulatorState,
        trades: &[BacktestTrade],
        equity_curve: &[EquityPoint],
        ticks_processed: u64,
    ) -> BacktestResultSummary {
        let total_trades = trades.len() as u32;
        let winning_trades = trades.iter().filter(|t| t.pnl > 0.0).count() as u32;
        let losing_trades = trades.iter().filter(|t| t.pnl <= 0.0).count() as u32;
        let win_rate = if total_trades > 0 { (winning_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };

        let wins: Vec<&BacktestTrade> = trades.iter().filter(|t| t.pnl > 0.0).collect();
        let losses: Vec<&BacktestTrade> = trades.iter().filter(|t| t.pnl <= 0.0).collect();

        let net_profit = state.balance - self.request.initial_balance;
        let net_profit_pct = if self.request.initial_balance > 0.0 { (net_profit / self.request.initial_balance) * 100.0 } else { 0.0 };

        let gross_profit: f64 = wins.iter().map(|t| t.pnl).sum();
        let gross_loss: f64 = losses.iter().map(|t| t.pnl).sum();

        let avg_win = if !wins.is_empty() { gross_profit / wins.len() as f64 } else { 0.0 };
        let avg_loss = if !losses.is_empty() { gross_loss.abs() / losses.len() as f64 } else { 0.0 };
        let largest_win = wins.iter().map(|t| t.pnl).fold(f64::NEG_INFINITY, f64::max);
        let largest_loss = losses.iter().map(|t| t.pnl).fold(f64::INFINITY, f64::min);
        let largest_win = if wins.is_empty() { 0.0 } else { largest_win };
        let largest_loss = if losses.is_empty() { 0.0 } else { largest_loss };

        let profit_factor = if gross_loss != 0.0 { gross_profit / gross_loss.abs() } else if !wins.is_empty() { gross_profit } else { 0.0 };

        let max_drawdown = equity_curve.iter().map(|e| e.drawdown).fold(0.0f64, f64::max);
        let max_drawdown_pct = equity_curve.iter().map(|e| e.drawdown_pct).fold(0.0f64, f64::max);

        let equity_values: Vec<f64> = equity_curve.iter().map(|e| e.equity).collect();
        let sharpe_ratio = compute_sharpe_ratio(&equity_values, self.request.initial_balance);

        let sortino_ratio = compute_sortino_ratio(&equity_values, self.request.initial_balance);
        let recovery_factor = if max_drawdown > 0.0 { net_profit / max_drawdown } else { 0.0 };
        let calmar_ratio = if max_drawdown_pct > 0.0 { (net_profit_pct / 100.0) / (max_drawdown_pct / 100.0) } else { 0.0 };

        let expected_payoff = if total_trades > 0 {
            (gross_profit + gross_loss) / total_trades as f64
        } else {
            0.0
        };

        let total_holding: u64 = 0;
        let avg_holding_bars = if total_trades > 0 { total_holding as f64 / total_trades as f64 } else { 0.0 };

        // Consecutive wins/losses
        let mut max_consecutive_wins = 0u32;
        let mut max_consecutive_losses = 0u32;
        let mut cur_wins = 0u32;
        let mut cur_losses = 0u32;
        for t in trades {
            if t.pnl > 0.0 {
                cur_wins += 1;
                cur_losses = 0;
                max_consecutive_wins = max_consecutive_wins.max(cur_wins);
            } else {
                cur_losses += 1;
                cur_wins = 0;
                max_consecutive_losses = max_consecutive_losses.max(cur_losses);
            }
        }

        // Max drawdown duration
        let max_drawdown_duration = compute_max_drawdown_duration(equity_curve);

        // Average trade duration in hours
        let avg_trade_duration = if total_trades > 0 {
            let total_duration: u64 = trades.iter().map(|t| t.closed_at.saturating_sub(t.opened_at)).sum();
            total_duration as f64 / total_trades as f64 / 3600.0
        } else {
            0.0
        };

        let return_on_account = net_profit_pct;

        let long_trades = trades.iter().filter(|t| t.side == "Buy").count() as u32;
        let short_trades = trades.iter().filter(|t| t.side == "Sell").count() as u32;
        let winning_long = trades.iter().filter(|t| t.side == "Buy" && t.pnl > 0.0).count() as f64;
        let winning_short = trades.iter().filter(|t| t.side == "Sell" && t.pnl > 0.0).count() as f64;
        let winning_long_pct = if long_trades > 0 { (winning_long / long_trades as f64) * 100.0 } else { 0.0 };
        let winning_short_pct = if short_trades > 0 { (winning_short / short_trades as f64) * 100.0 } else { 0.0 };

        let modeling_quality = compute_modeling_quality(&self.request);
        let bars_in_test = equity_curve.len() as u32;

        BacktestResultSummary {
            initial_balance: self.request.initial_balance,
            final_balance: state.balance,
            net_profit,
            net_profit_pct,
            total_trades,
            winning_trades,
            losing_trades,
            win_rate,
            max_drawdown,
            max_drawdown_pct,
            sharpe_ratio,
            sortino_ratio,
            calmar_ratio,
            profit_factor,
            recovery_factor,
            expected_payoff,
            avg_win,
            avg_loss,
            largest_win,
            largest_loss,
            avg_holding_bars,
            gross_profit,
            gross_loss,
            max_consecutive_wins,
            max_consecutive_losses,
            max_drawdown_duration,
            avg_trade_duration,
            return_on_account,
            long_trades,
            short_trades,
            winning_long_pct,
            winning_short_pct,
            modeling_quality,
            bars_in_test,
            ticks_processed,
        }
    }
}

fn rebuild_trades(state: &crate::models::SimulatorState) -> Vec<BacktestTrade> {
    state.history.iter().map(|t| {
        BacktestTrade {
            id: t.id.clone(),
            side: format!("{:?}", t.side),
            entry_price: t.entry_price,
            exit_price: t.exit_price,
            quantity: t.quantity,
            pnl: t.pnl,
            pnl_pct: if t.entry_price > 0.0 { (t.pnl / (t.entry_price * t.quantity)) * 100.0 } else { 0.0 },
            opened_at: t.opened_at,
            closed_at: t.closed_at,
            exit_reason: t.exit_reason.clone(),
            holding_bars: 0,
            take_profit: t.take_profit,
            stop_loss: t.stop_loss,
        }
    }).collect()
}

fn rebuild_equity(equity_curve: &[EquityPoint]) -> Vec<EquityPoint> {
    equity_curve.to_vec()
}

fn compute_sortino_ratio(equity_values: &[f64], initial_balance: f64) -> f64 {
    if equity_values.len() < 2 {
        return 0.0;
    }
    let returns: Vec<f64> = equity_values.windows(2)
        .map(|w| {
            let prev = w[0];
            let curr = w[1];
            if prev > 0.0 { (curr - prev) / prev } else if curr > 0.0 && initial_balance > 0.0 { (curr - initial_balance) / initial_balance } else { 0.0 }
        })
        .collect();

    if returns.is_empty() { return 0.0; }

    let mean_return = returns.iter().sum::<f64>() / returns.len() as f64;
    let downside_variance = returns.iter()
        .filter(|r| **r < 0.0)
        .map(|r| (r - mean_return).powi(2))
        .sum::<f64>() / returns.len() as f64;

    let downside_dev = downside_variance.sqrt();
    if downside_dev == 0.0 { return 0.0; }

    let risk_free_rate = 0.05 / 365.0;
    (mean_return - risk_free_rate) / downside_dev * (returns.len() as f64).sqrt()
}

fn compute_max_drawdown_duration(equity_curve: &[EquityPoint]) -> u64 {
    if equity_curve.is_empty() { return 0; }

    let mut max_duration = 0u64;
    let mut peak_equity = equity_curve[0].equity;
    let mut peak_time = equity_curve[0].time;
    let mut drawdown_start: Option<u64> = None;

    for point in equity_curve {
        if point.equity > peak_equity {
            peak_equity = point.equity;
            peak_time = point.time;
            drawdown_start = None;
        } else if point.equity < peak_equity {
            if drawdown_start.is_none() {
                drawdown_start = Some(peak_time);
            }
            if let Some(start) = drawdown_start {
                let duration = point.time.saturating_sub(start);
                max_duration = max_duration.max(duration);
            }
        }
    }

    max_duration
}

fn compute_modeling_quality(request: &BacktestRequest) -> f64 {
    let total_range = request.end_time.saturating_sub(request.start_time);
    if total_range == 0 { return 0.0; }
    // Modeling quality: simple heuristic based on mode
    match request.testing_mode {
        TestingMode::EveryTick => 90.0,
        TestingMode::ControlPoints => 75.0,
        TestingMode::OpenPricesOnly => 40.0,
        TestingMode::ClosePricesOnly => 40.0,
    }
}

fn compute_sharpe_ratio(equity_values: &[f64], initial_balance: f64) -> f64 {
    if equity_values.len() < 2 {
        return 0.0;
    }

    let returns: Vec<f64> = equity_values.windows(2)
        .map(|w| {
            let prev = w[0];
            let curr = w[1];
            if prev > 0.0 {
                (curr - prev) / prev
            } else if curr > 0.0 && initial_balance > 0.0 {
                (curr - initial_balance) / initial_balance
            } else {
                0.0
            }
        })
        .collect();

    if returns.is_empty() {
        return 0.0;
    }

    let mean_return = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns.iter()
        .map(|r| (r - mean_return).powi(2))
        .sum::<f64>() / returns.len() as f64;

    let std_dev = variance.sqrt();
    if std_dev == 0.0 {
        return 0.0;
    }

    let risk_free_rate = 0.05 / 365.0;
    (mean_return - risk_free_rate) / std_dev * (returns.len() as f64).sqrt()
}

pub async fn run_optimization(request: &OptimizeRequest) -> Result<Vec<OptimizationResult>, String> {
    let mut param_values: Vec<(String, Vec<f64>)> = Vec::new();
    for range in &request.ranges {
        let mut values = Vec::new();
        let mut v = range.min;
        while v <= range.max {
            values.push(v);
            v = (v * 1000.0).round() / 1000.0;
            v += range.step;
        }
        if values.is_empty() {
            values.push(range.min);
        }
        param_values.push((range.name.clone(), values));
    }

    let base_code = request.strategy_code.clone();
    let mut results: Vec<OptimizationResult> = Vec::new();

    let product = cartesian_product(&param_values);
    for combo in product {
        let mut code = base_code.clone();
        let mut params = HashMap::new();
        for (name, val) in &combo {
            code = code.replace(&format!("{{{{{}}}}}", name), &val.to_string());
            params.insert(name.clone(), *val);
        }

        let bt_req = BacktestRequest {
            strategy_code: code,
            symbol: request.symbol.clone(),
            timeframe: request.timeframe.clone(),
            start_time: request.start_time,
            end_time: request.end_time,
            initial_balance: request.initial_balance,
            commission: request.commission,
            slippage: request.slippage,
            speed: 1,
            testing_mode: TestingMode::ControlPoints,
            visual: false,
        };

        let engine = BacktestEngine::new(bt_req);
        match engine.run().await {
            Ok(result) => {
                results.push(OptimizationResult {
                    params,
                    summary: result.summary,
                });
            }
            Err(e) => {
                tracing::warn!("Optimization run failed for params {:?}: {}", params, e);
            }
        }
    }

    results.sort_by(|a, b| {
        b.summary.sharpe_ratio.partial_cmp(&a.summary.sharpe_ratio).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_candles() -> Vec<Candle> {
        (0..50).map(|i| {
            let base = 100.0 + i as f64;
            Candle {
                time: i as u64 * 60, open: base, high: base + 1.0, low: base - 1.0, close: base,
                volume: 1000.0, symbol: "BTCUSDT".into(), is_closed: true,
            }
        }).collect()
    }

    fn never_trade() -> String {
        "def on_tick(price, candles): pass".into()
    }

    fn default_req(code: String) -> BacktestRequest {
        BacktestRequest {
            strategy_code: code, symbol: "BTCUSDT".into(), timeframe: "1m".into(),
            start_time: 0, end_time: 0, initial_balance: 10000.0, commission: 0.001, slippage: 0.0001,
            speed: 1, testing_mode: TestingMode::ControlPoints, visual: false,
        }
    }

    #[test]
    fn test_empty_candles_returns_error() {
        let req = default_req(never_trade());
        let engine = BacktestEngine::new(req);
        let result = engine.execute_with_candles(vec![]);
        assert!(result.is_err());
    }

    #[test]
    fn test_never_trade_strategy() {
        let candles = make_test_candles();
        let req = BacktestRequest {
            strategy_code: never_trade(), symbol: "BTCUSDT".into(), timeframe: "1m".into(),
            start_time: 0, end_time: 2999, initial_balance: 10000.0, commission: 0.001, slippage: 0.0001,
            speed: 1, testing_mode: TestingMode::ControlPoints, visual: false,
        };
        let engine = BacktestEngine::new(req);
        let result = engine.execute_with_candles(candles);
        assert!(result.is_ok());
        let bt = result.unwrap();
        assert_eq!(bt.summary.total_trades, 0);
        assert_eq!(bt.summary.initial_balance, bt.summary.final_balance);
    }

    #[test]
    fn test_sharpe_ratio_zero_for_single_value() {
        assert_eq!(compute_sharpe_ratio(&[100.0], 100.0), 0.0);
        assert_eq!(compute_sharpe_ratio(&[], 100.0), 0.0);
    }

    #[test]
    fn test_sharpe_ratio_positive() {
        let eq = vec![100.0, 101.0, 102.0, 103.0, 104.0, 105.0];
        let sr = compute_sharpe_ratio(&eq, 100.0);
        assert!(sr > 0.0);
    }

    #[test]
    fn test_sortino_ratio() {
        // Mix of positive and negative returns to get downside deviation
        let eq = vec![100.0, 102.0, 101.0, 104.0, 103.0, 106.0];
        let sr = compute_sortino_ratio(&eq, 100.0);
        assert!(sr > 0.0);
    }

    #[test]
    fn test_sortino_ratio_zero_for_single() {
        assert_eq!(compute_sortino_ratio(&[100.0], 100.0), 0.0);
    }

    #[test]
    fn test_cartesian_product_single_param() {
        let result = cartesian_product(&[("period".into(), vec![5.0, 10.0, 20.0])]);
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn test_cartesian_product_two_params() {
        let result = cartesian_product(&[
            ("fast".into(), vec![5.0, 10.0]),
            ("slow".into(), vec![20.0, 30.0]),
        ]);
        assert_eq!(result.len(), 4);
    }

    #[test]
    fn test_cartesian_product_empty() {
        let result = cartesian_product(&[]);
        assert_eq!(result.len(), 1);
        assert!(result[0].is_empty());
    }

    #[test]
    fn test_equity_curve_length() {
        let candles = make_test_candles();
        let req = BacktestRequest {
            strategy_code: never_trade(), symbol: "BTCUSDT".into(), timeframe: "1m".into(),
            start_time: 0, end_time: 2999, initial_balance: 10000.0, commission: 0.001, slippage: 0.0001,
            speed: 1, testing_mode: TestingMode::ControlPoints, visual: false,
        };
        let engine = BacktestEngine::new(req);
        let result = engine.execute_with_candles(candles).unwrap();
        assert_eq!(result.equity_curve.len(), 50);
    }

    #[test]
    fn test_sortino_ratio_handles_empty() {
        assert_eq!(compute_sortino_ratio(&[], 100.0), 0.0);
    }

    #[test]
    fn test_max_drawdown_duration_empty() {
        assert_eq!(compute_max_drawdown_duration(&[]), 0);
    }

    #[test]
    fn test_modeling_quality_defaults() {
        let mut req = default_req(never_trade());
        req.start_time = 1000;
        req.end_time = 2000;
        assert_eq!(compute_modeling_quality(&req), 75.0); // ControlPoints
    }

    #[test]
    fn test_enhanced_summary_no_trades() {
        let candles = make_test_candles();
        let req = BacktestRequest {
            strategy_code: never_trade(), symbol: "BTCUSDT".into(), timeframe: "1m".into(),
            start_time: 0, end_time: 2999, initial_balance: 10000.0, commission: 0.001, slippage: 0.0001,
            speed: 1, testing_mode: TestingMode::ControlPoints, visual: false,
        };
        let engine = BacktestEngine::new(req);
        let result = engine.execute_with_candles(candles).unwrap();
        let s = &result.summary;
        assert_eq!(s.sortino_ratio, 0.0);
        assert_eq!(s.calmar_ratio, 0.0);
        assert_eq!(s.recovery_factor, 0.0);
        assert_eq!(s.expected_payoff, 0.0);
        assert_eq!(s.gross_profit, 0.0);
        assert_eq!(s.gross_loss, 0.0);
        assert!(s.modeling_quality > 0.0);
    }

    #[test]
    fn test_events_included_in_result() {
        let candles = make_test_candles();
        let req = BacktestRequest {
            strategy_code: never_trade(), symbol: "BTCUSDT".into(), timeframe: "1m".into(),
            start_time: 0, end_time: 2999, initial_balance: 10000.0, commission: 0.001, slippage: 0.0001,
            speed: 1, testing_mode: TestingMode::ControlPoints, visual: false,
        };
        let engine = BacktestEngine::new(req);
        let result = engine.execute_with_candles(candles).unwrap();
        assert!(result.events.is_empty()); // No trades = no events
    }
}

fn cartesian_product(param_values: &[(String, Vec<f64>)]) -> Vec<Vec<(String, f64)>> {
    if param_values.is_empty() {
        return vec![vec![]];
    }
    let mut result = vec![vec![]];
    for (name, values) in param_values {
        let mut new_result = Vec::new();
        for combo in &result {
            for val in values {
                let mut new_combo = combo.clone();
                new_combo.push((name.clone(), *val));
                new_result.push(new_combo);
            }
        }
        result = new_result;
    }
    result
}
