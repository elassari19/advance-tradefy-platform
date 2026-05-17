use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::models::{Candle, OrderRequest, Tick, TradeSide, WebhookConfig};
use crate::simulator::SimulatorEngine;
use crate::python_runtime::PythonRuntime;

struct StrategyInstance {
    code: String,
    symbol: String,
    runtime: PythonRuntime,
}

pub struct StrategyEngine {
    simulator: Arc<SimulatorEngine>,
    strategies: Arc<Mutex<HashMap<String, StrategyInstance>>>,
}

impl StrategyEngine {
    pub fn new(simulator: Arc<SimulatorEngine>) -> Self {
        Self {
            simulator,
            strategies: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Normalize symbol format: "BTC/USDT" -> "BTCUSDT" for Binance compatibility
    pub fn normalize_symbol(symbol: &str) -> String {
        symbol.replace("/", "").replace("-", "").to_uppercase()
    }

    pub fn deploy(&self, symbol: String, code: String) -> Result<(), String> {
        let normalized = Self::normalize_symbol(&symbol);
        let runtime = PythonRuntime::new();
        if let Err(e) = runtime.execute_strategy(&code, 0.0) {
            let err_msg = format!("Python syntax error in strategy: {}", e);
            tracing::warn!("{}", err_msg);
            return Err(err_msg);
        }

        let mut strategies = self.strategies.lock().map_err(|_| "Failed to lock strategies")?;
        strategies.insert(normalized.clone(), StrategyInstance { code, symbol: normalized, runtime });
        tracing::info!("Strategy deployed for symbol");
        Ok(())
    }

    pub fn remove(&self, symbol: &str) -> Result<(), String> {
        let mut strategies = self.strategies.lock().map_err(|_| "Failed to lock strategies")?;
        strategies.remove(symbol);
        tracing::info!("Strategy removed for symbol: {}", symbol);
        Ok(())
    }

    pub fn get_active_symbols(&self) -> Vec<String> {
        let strategies = self.strategies.lock().unwrap();
        strategies.keys().cloned().collect()
    }

    pub fn get_strategies_for_stats(&self) -> HashMap<String, crate::python_runtime::ExecutionStats> {
        let strategies = self.strategies.lock().unwrap();
        let mut stats = HashMap::new();
        for (symbol, inst) in strategies.iter() {
            let exec_stats = inst.runtime.get_execution_stats();
            stats.insert(symbol.clone(), exec_stats);
        }
        stats
    }

    fn process_signal(&self, signal: &crate::python_runtime::PythonSignal, symbol: &str, price: f64, time: u64, webhook_configs: &[WebhookConfig]) {
        match signal.action.as_str() {
            "CLOSE" => {
                let state = self.simulator.get_state();
                for pos in &state.open_positions {
                    if pos.symbol == symbol {
                        let _ = self.simulator.close_position(&pos.id, time);
                    }
                }
            }
            "EXIT" => {
                // Exit with optional TP/SL — close all positions for the symbol
                let state = self.simulator.get_state();
                for pos in &state.open_positions {
                    if pos.symbol == symbol {
                        let _ = self.simulator.close_position(&pos.id, time);
                    }
                }
            }
            action if action == "BUY" || action == "SELL" => {
                let order = OrderRequest {
                    symbol: symbol.to_string(),
                    side: if action == "BUY" { TradeSide::Buy } else { TradeSide::Sell },
                    quantity: signal.quantity,
                    take_profit: signal.take_profit,
                    stop_loss: signal.stop_loss,
                };

                if let Err(e) = self.simulator.place_order(order.clone(), price, time) {
                    tracing::error!("Failed to execute strategy order: {}", e);
                    return;
                }

                for config in webhook_configs.iter().filter(|c| c.enabled) {
                    let config_clone = config.clone();
                    let order_clone = order.clone();
                    let p = price;
                    tokio::spawn(async move {
                        crate::webhooks::dispatch_webhook(config_clone.url, config_clone.secret_token, order_clone, p).await;
                    });
                }
            }
            _ => {
                tracing::warn!("Unknown signal action: {}", signal.action);
            }
        }
    }

    pub fn on_tick(&self, tick: Tick, webhook_configs: Vec<WebhookConfig>) {
        let instance = {
            let strategies = self.strategies.lock().unwrap();
            strategies.get(&tick.symbol).map(|s| (s.code.clone(), s.runtime.clone()))
        };

        if let Some((code, runtime)) = instance {
            let state = self.simulator.get_state();
            let pos = state.open_positions.iter().find(|p| p.symbol == tick.symbol);
            let (pos_size, pos_avg, equity) = match pos {
                Some(p) => (p.quantity, p.entry_price, state.balance + state.open_positions.iter().map(|pos| pos.pnl).sum::<f64>()),
                None => (0.0, 0.0, state.balance),
            };
            runtime.set_position_state(pos_size, pos_avg, equity);

            match runtime.execute_strategy(&code, tick.price) {
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!("Python execution error: {}", e);
                }
            }

            if let Some(signal) = runtime.get_signal() {
                tracing::info!("Strategy signal: {} qty={}", signal.action, signal.quantity);
                self.process_signal(&signal, &tick.symbol, tick.price, tick.time, &webhook_configs);
            }
        }
    }

    pub async fn save_strategy_state(&self) {
        let count = match self.strategies.lock() {
            Ok(s) => s.len(),
            Err(_) => return,
        };
        tracing::info!("Saving {} strategy states (state persistence placeholder)", count);
    }

    pub fn get_all_strategies(&self) -> Vec<(String, String)> {
        let strategies = self.strategies.lock().unwrap();
        strategies.iter().map(|(sym, inst)| (sym.clone(), inst.code.clone())).collect()
    }

    pub fn restore_strategies(&self, strategies: Vec<(String, String)>) {
        let mut map = self.strategies.lock().unwrap();
        for (symbol, code) in strategies {
            let runtime = PythonRuntime::new();
            let _ = runtime.execute_strategy(&code, 0.0);
            map.insert(symbol.clone(), StrategyInstance { code, symbol, runtime });
        }
        tracing::info!("Restored {} strategies", map.len());
    }

    pub fn on_candle(&self, candle: &Candle, webhook_configs: Vec<WebhookConfig>) {
        let instance = {
            let strategies = self.strategies.lock().unwrap();
            strategies.get(&candle.symbol).map(|s| (s.code.clone(), s.runtime.clone()))
        };

        if let Some((code, runtime)) = instance {
            let state = self.simulator.get_state();
            let pos = state.open_positions.iter().find(|p| p.symbol == candle.symbol);
            let (pos_size, pos_avg, equity) = match pos {
                Some(p) => (p.quantity, p.entry_price, state.balance + state.open_positions.iter().map(|pos| pos.pnl).sum::<f64>()),
                None => (0.0, 0.0, state.balance),
            };
            runtime.set_position_state(pos_size, pos_avg, equity);

            match runtime.execute_on_candle(&code, candle) {
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!("Python candle execution error: {}", e);
                }
            }

            if let Some(signal) = runtime.get_signal() {
                tracing::info!("Strategy candle signal: {} qty={}", signal.action, signal.quantity);
                self.process_signal(&signal, &candle.symbol, candle.close, candle.time, &webhook_configs);
            }
        }
    }
}
