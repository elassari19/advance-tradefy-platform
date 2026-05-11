use std::sync::{Arc, Mutex};
use crate::models::{Tick, WebhookConfig};
use crate::simulator::SimulatorEngine;

pub struct StrategyEngine {
    simulator: Arc<SimulatorEngine>,
    current_script: Arc<Mutex<Option<String>>>,
    current_tick: Arc<Mutex<Option<Tick>>>,
}

impl StrategyEngine {
    pub fn new(simulator: Arc<SimulatorEngine>) -> Self {
        Self {
            simulator,
            current_script: Arc::new(Mutex::new(None)),
            current_tick: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    pub fn deploy(&self, script: String) -> Result<(), String> {
        let mut current = self.current_script.lock().map_err(|_| "Failed to lock script")?;
        *current = Some(script);
        tracing::info!("Strategy deployed (Python execution not available with current Python version)");
        Ok(())
    }

    pub fn on_tick(&self, tick: Tick, _webhook_configs: Vec<WebhookConfig>) {
        let mut t = self.current_tick.lock().unwrap();
        *t = Some(tick.clone());
    }
}