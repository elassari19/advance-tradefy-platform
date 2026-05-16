use pyo3::{prelude::*, types::PyDict, types::PyList};
use std::sync::{Arc, Mutex};

const MAX_CANDLES: usize = 200;

#[derive(Clone, Debug)]
pub struct PythonSignal {
    pub action: String,
    pub quantity: f64,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
}

#[derive(Clone)]
pub struct PythonRuntime {
    pending_signal: Arc<Mutex<Option<PythonSignal>>>,
    price_history: Arc<Mutex<Vec<f64>>>,
}

impl PythonRuntime {
    pub fn new() -> Self {
        Self {
            pending_signal: Arc::new(Mutex::new(None)),
            price_history: Arc::new(Mutex::new(Vec::with_capacity(MAX_CANDLES))),
        }
    }

    pub fn get_signal(&self) -> Option<PythonSignal> {
        let mut sig = self.pending_signal.lock().unwrap();
        sig.take()
    }

    pub fn execute_strategy(&self, code: &str, price: f64) -> Result<(), String> {
        {
            let mut history = self.price_history.lock().map_err(|_| "Lock error")?;
            history.push(price);
            if history.len() > MAX_CANDLES {
                history.remove(0);
            }
        }

        Python::with_gil(|py| {
            let globals = PyDict::new(py);

            globals.set_item("price", price).map_err(|e| e.to_string())?;

            let candles = {
                let history = self.price_history.lock().map_err(|_| "Lock error")?;
                let arr: Vec<f64> = history.iter().copied().collect();
                PyList::new(py, &arr)
            };
            globals.set_item("candles", candles).map_err(|e| e.to_string())?;

            let code_with_globals = format!(
                r#"
tradefy_signal = None

def buy(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "BUY", "qty": qty, "tp": tp, "sl": sl}}

def sell(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "SELL", "qty": qty, "tp": tp, "sl": sl}}

{}
try:
    on_tick(price, candles)
except Exception as e:
    print(f"Error in on_tick: {{e}}")

if tradefy_signal:
    _action = tradefy_signal["action"]
    _qty = tradefy_signal["qty"]
    _tp = tradefy_signal.get("tp")
    _sl = tradefy_signal.get("sl")
"#,
                code
            );

            py.run(&code_with_globals, Some(&globals), None)
                .map_err(|e| format!("Python error: {}", e))?;

            if let Ok(signal) = globals.get_item("tradefy_signal") {
                if let Some(signal) = signal {
                    if !signal.is_none() {
                        if let Ok(action) = signal.get_item("action") {
                            let action: String = action.extract().unwrap_or_default();
                            
                            let qty: f64 = signal.get_item("qty")
                                .ok()
                                .and_then(|v| v.extract::<f64>().ok())
                                .unwrap_or(0.0);
                            let tp: Option<f64> = signal.get_item("tp")
                                .ok()
                                .and_then(|v| v.extract::<f64>().ok());
                            let sl: Option<f64> = signal.get_item("sl")
                                .ok()
                                .and_then(|v| v.extract::<f64>().ok());

                            if !action.is_empty() {
                                let mut pending = self.pending_signal.lock().unwrap();
                                *pending = Some(PythonSignal {
                                    action,
                                    quantity: qty,
                                    take_profit: tp,
                                    stop_loss: sl,
                                });
                            }
                        }
                    }
                }
            }

            Ok(())
        })
    }
}

impl Default for PythonRuntime {
    fn default() -> Self {
        Self::new()
    }
}