use pyo3::{prelude::*, types::PyDict, types::PyList};
use std::sync::{Arc, Mutex};
use crate::models::Candle;
use crate::time_series::TimeSeries;

const MAX_CANDLES: usize = 1000;

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
    time_series: Arc<Mutex<TimeSeries>>,
}

impl PythonRuntime {
    pub fn new() -> Self {
        Self {
            pending_signal: Arc::new(Mutex::new(None)),
            price_history: Arc::new(Mutex::new(Vec::with_capacity(MAX_CANDLES))),
            time_series: Arc::new(Mutex::new(TimeSeries::with_max_len(MAX_CANDLES))),
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

    pub fn execute_on_candle(&self, code: &str, candle: &Candle) -> Result<(), String> {
        {
            let mut ts = self.time_series.lock().map_err(|_| "Lock error")?;
            ts.push("open", candle.open);
            ts.push("high", candle.high);
            ts.push("low", candle.low);
            ts.push("close", candle.close);
            ts.push("volume", candle.volume);
        }

        Python::with_gil(|py| {
            let globals = PyDict::new(py);

            globals.set_item("price", candle.close).map_err(|e| e.to_string())?;
            globals.set_item("open_val", candle.open).map_err(|e| e.to_string())?;
            globals.set_item("high_val", candle.high).map_err(|e| e.to_string())?;
            globals.set_item("low_val", candle.low).map_err(|e| e.to_string())?;
            globals.set_item("close_val", candle.close).map_err(|e| e.to_string())?;
            globals.set_item("volume_val", candle.volume).map_err(|e| e.to_string())?;

            let ts = self.time_series.lock().map_err(|_| "Lock error")?;
            let open_data: Vec<f64> = ts.get_all("open");
            let high_data: Vec<f64> = ts.get_all("high");
            let low_data: Vec<f64> = ts.get_all("low");
            let close_data: Vec<f64> = ts.get_all("close");
            let volume_data: Vec<f64> = ts.get_all("volume");
            drop(ts);

            globals.set_item("_open_data", PyList::new(py, &open_data)).map_err(|e| e.to_string())?;
            globals.set_item("_high_data", PyList::new(py, &high_data)).map_err(|e| e.to_string())?;
            globals.set_item("_low_data", PyList::new(py, &low_data)).map_err(|e| e.to_string())?;
            globals.set_item("_close_data", PyList::new(py, &close_data)).map_err(|e| e.to_string())?;
            globals.set_item("_volume_data", PyList::new(py, &volume_data)).map_err(|e| e.to_string())?;

            let code_with_globals = format!(
                r#"
class Series:
    def __init__(self, data):
        self._data = data
    def __getitem__(self, offset):
        if isinstance(offset, int) and offset < len(self._data):
            return self._data[len(self._data) - 1 - offset]
        return None
    def __float__(self):
        return self._data[-1] if self._data else 0.0
    def __repr__(self):
        return str(float(self))

open = Series(_open_data)
high = Series(_high_data)
low = Series(_low_data)
close = Series(_close_data)
volume = Series(_volume_data)

tradefy_signal = None

def buy(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "BUY", "qty": qty, "tp": tp, "sl": sl}}

def sell(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "SELL", "qty": qty, "tp": tp, "sl": sl}}

{}
try:
    on_tick(close_val, open_val, high_val, low_val, close_val, volume_val)
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
