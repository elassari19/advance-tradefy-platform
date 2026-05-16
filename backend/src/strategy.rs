use std::sync::{Arc, Mutex};
use crate::models::{OrderRequest, Tick, TradeSide, WebhookConfig};
use crate::simulator::SimulatorEngine;
use crate::python_runtime::PythonRuntime;

pub struct StrategyEngine {
    #[allow(dead_code)]
    simulator: Arc<SimulatorEngine>,
    current_script: Arc<Mutex<Option<String>>>,
    current_tick: Arc<Mutex<Option<Tick>>>,
    python_runtime: Arc<Mutex<Option<PythonRuntime>>>,
}

impl StrategyEngine {
    pub fn new(simulator: Arc<SimulatorEngine>) -> Self {
        Self {
            simulator,
            current_script: Arc::new(Mutex::new(None)),
            current_tick: Arc::new(std::sync::Mutex::new(None)),
            python_runtime: Arc::new(Mutex::new(None)),
        }
    }

    pub fn deploy(&self, script: String) -> Result<(), String> {
        let mut current = self.current_script.lock().map_err(|_| "Failed to lock script")?;
        *current = Some(script.clone());

        let runtime = PythonRuntime::new();
        
        if let Some(ref code) = *current {
            if let Err(e) = runtime.execute_strategy(code, 0.0) {
                tracing::warn!("Python initialization warning: {}", e);
            }
        }

        let mut py_runtime = self.python_runtime.lock().map_err(|_| "Failed to lock runtime")?;
        *py_runtime = Some(runtime);
        
        tracing::info!("Strategy deployed with Python execution engine");
        Ok(())
    }

    pub fn on_tick(&self, tick: Tick, webhook_configs: Vec<WebhookConfig>) {
        {
            let mut t = self.current_tick.lock().unwrap();
            *t = Some(tick.clone());
        }

        let py_runtime = {
            let r = self.python_runtime.lock().unwrap();
            r.clone()
        };

        if let Some(runtime) = py_runtime {
            let code = {
                let s = self.current_script.lock().unwrap();
                s.clone()
            };

            if let Some(code) = code {
                match runtime.execute_strategy(&code, tick.price) {
                    Ok(_) => {}
                    Err(e) => {
                        tracing::warn!("Python execution error: {}", e);
                    }
                }

                if let Some(signal) = runtime.get_signal() {
                    tracing::info!("Python strategy signal: {} qty={}", signal.action, signal.quantity);
                    
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
    }
}