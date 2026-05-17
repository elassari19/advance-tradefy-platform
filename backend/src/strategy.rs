use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::models::{Candle, OrderRequest, Tick, TradeSide, WebhookConfig};
use crate::simulator::SimulatorEngine;
use crate::python_runtime::PythonRuntime;

struct StrategyInstance {
    code: String,
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

    pub fn deploy(&self, symbol: String, code: String) -> Result<(), String> {
        let runtime = PythonRuntime::new();
        if let Err(e) = runtime.execute_strategy(&code, 0.0) {
            tracing::warn!("Python initialization warning: {}", e);
        }

        let mut strategies = self.strategies.lock().map_err(|_| "Failed to lock strategies")?;
        strategies.insert(symbol, StrategyInstance { code, runtime });
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

    pub fn on_tick(&self, tick: Tick, webhook_configs: Vec<WebhookConfig>) {
        let instance = {
            let strategies = self.strategies.lock().unwrap();
            strategies.get(&tick.symbol).map(|s| (s.code.clone(), s.runtime.clone()))
        };

        if let Some((code, runtime)) = instance {
            match runtime.execute_strategy(&code, tick.price) {
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!("Python execution error: {}", e);
                }
            }

            if let Some(signal) = runtime.get_signal() {
                tracing::info!("Strategy signal: {} qty={}", signal.action, signal.quantity);

                let order = OrderRequest {
                    symbol: tick.symbol.clone(),
                    side: if signal.action == "BUY" { TradeSide::Buy } else { TradeSide::Sell },
                    quantity: signal.quantity,
                    take_profit: signal.take_profit,
                    stop_loss: signal.stop_loss,
                };

                if let Err(e) = self.simulator.place_order(order.clone(), tick.price, tick.time) {
                    tracing::error!("Failed to execute strategy order: {}", e);
                } else {
                    for config in webhook_configs.iter().filter(|c| c.enabled) {
                        let config_clone = config.clone();
                        let order_clone = order.clone();
                        let price = tick.price;
                        tokio::spawn(async move {
                            crate::webhooks::dispatch_webhook(config_clone.url, config_clone.secret_token, order_clone, price).await;
                        });
                    }
                }
            }
        }
    }

    pub fn on_candle(&self, candle: &Candle, webhook_configs: Vec<WebhookConfig>) {
        let instance = {
            let strategies = self.strategies.lock().unwrap();
            strategies.get(&candle.symbol).map(|s| (s.code.clone(), s.runtime.clone()))
        };

        if let Some((code, runtime)) = instance {
            match runtime.execute_on_candle(&code, candle) {
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!("Python candle execution error: {}", e);
                }
            }

            if let Some(signal) = runtime.get_signal() {
                tracing::info!("Strategy candle signal: {} qty={}", signal.action, signal.quantity);

                let order = OrderRequest {
                    symbol: candle.symbol.clone(),
                    side: if signal.action == "BUY" { TradeSide::Buy } else { TradeSide::Sell },
                    quantity: signal.quantity,
                    take_profit: signal.take_profit,
                    stop_loss: signal.stop_loss,
                };

                if let Err(e) = self.simulator.place_order(order.clone(), candle.close, candle.time) {
                    tracing::error!("Failed to execute strategy order: {}", e);
                } else {
                    for config in webhook_configs.iter().filter(|c| c.enabled) {
                        let config_clone = config.clone();
                        let order_clone = order.clone();
                        let price = candle.close;
                        tokio::spawn(async move {
                            crate::webhooks::dispatch_webhook(config_clone.url, config_clone.secret_token, order_clone, price).await;
                        });
                    }
                }
            }
        }
    }
}
