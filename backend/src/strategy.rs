use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::models::{OrderRequest, TradeSide, WebhookConfig};
use crate::simulator::SimulatorEngine;

#[derive(Clone, Debug)]
pub struct StrategySignal {
    pub action: String,
    pub quantity: f64,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
}

struct StrategyInstance {
    code: String,
    symbol: String,
    language: String,
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

    pub fn normalize_symbol(symbol: &str) -> String {
        symbol.replace("/", "").replace("-", "").to_uppercase()
    }

    pub fn deploy(&self, symbol: String, code: String, language: String) -> Result<(), String> {
        let normalized = Self::normalize_symbol(&symbol);
        let mut strategies = self.strategies.lock().map_err(|_| "Failed to lock strategies")?;
        strategies.insert(normalized.clone(), StrategyInstance {
            code,
            symbol: normalized.clone(),
            language,
        });
        tracing::info!("Strategy deployed for symbol: {}", normalized);
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

    pub fn get_strategies_for_stats(&self) -> HashMap<String, serde_json::Value> {
        let strategies = self.strategies.lock().unwrap();
        let mut stats = HashMap::new();
        for (symbol, inst) in strategies.iter() {
            stats.insert(symbol.clone(), serde_json::json!({
                "symbol": inst.symbol,
                "language": inst.language,
                "code_size": inst.code.len(),
            }));
        }
        stats
    }

    pub fn process_order_signal(&self, signal: &StrategySignal, symbol: &str, price: f64, time: u64, webhook_configs: &[WebhookConfig]) {
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

    pub async fn save_strategy_state(&self) {
        let count = match self.strategies.lock() {
            Ok(s) => s.len(),
            Err(_) => return,
        };
        tracing::info!("Saving {} strategy states", count);
    }

    pub fn get_all_strategies(&self) -> Vec<(String, String)> {
        let strategies = self.strategies.lock().unwrap();
        strategies.iter().map(|(sym, inst)| (sym.clone(), inst.code.clone())).collect()
    }

    pub fn restore_strategies(&self, strategies: Vec<(String, String)>) {
        let mut map = self.strategies.lock().unwrap();
        for (symbol, code) in strategies {
            map.insert(symbol.clone(), StrategyInstance {
                code,
                symbol,
                language: "python".to_string(),
            });
        }
        tracing::info!("Restored {} strategies", map.len());
    }
}