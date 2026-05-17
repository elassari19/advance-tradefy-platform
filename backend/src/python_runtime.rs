use pyo3::{prelude::*, types::PyDict, types::PyList};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use serde::Serialize;
use crate::models::Candle;
use crate::time_series::TimeSeries;
use crate::indicator::TA_LIBRARY;

const MAX_CANDLES: usize = 1000;

pub const DSL_PREAMBLE: &str = r#"
# ── Plot Function Library (PineScript compatible) ──
_result_plots = []
_result_hlines = []

def plot(series, title="", color="", style="line", width=1):
    if isinstance(series, list):
        vals = series
    else:
        try:
            vals = series._data
        except:
            vals = []
    _result_plots.append({"id": title, "label": title, "color": color, "type": style, "values": vals})

def plotshape(series, title="", location="abovebar", style="arrowup", size="normal"):
    pass

def plotarrow(series, title="", colorup="", colordown=""):
    pass

def hline(price, title="", color="", linestyle="solid"):
    _result_hlines.append({"type": "hline", "price": price, "color": color, "style": linestyle})

def bgcolor(color):
    pass

def fill(series1, series2, color):
    pass

# ── Strategy DSL (@strategy decorator + strategy namespace) ──
long = "long"
short = "short"

class _StrategyConfig:
    def __init__(self):
        self.fn = None
        self.title = ""
        self.overlay = True
        self.initial_capital = 10000.0
        self.commission = 0.001
        self.slippage = 0.0001
        self.default_qty_type = "percent_of_equity"
        self.default_qty_value = 100

_strategy_config = _StrategyConfig()

def strategy(**kwargs):
    def decorator(fn):
        _strategy_config.fn = fn
        for k, v in kwargs.items():
            setattr(_strategy_config, k, v)
        return fn
    return decorator

_input_values = {}
def input(default, title="", options=None, tooltip=""):
    key = title.replace(" ", "_").lower() if title else str(default)
    if key not in _input_values:
        _input_values[key] = default
    return _input_values[key]

class _Strategy:
    long = "long"
    short = "short"

    def entry(self, id, direction, qty=None, limit=None, stop=None):
        global tradefy_signal
        side = "BUY" if direction == self.long else "SELL"
        q = qty if qty is not None else 0.0
        tradefy_signal = {"action": side, "qty": q, "tp": limit, "sl": stop}

    def exit(self, id, from_entry="", qty=None, limit=None, stop=None):
        global tradefy_signal
        tradefy_signal = {"action": "EXIT", "from_entry": from_entry, "qty": qty, "tp": limit, "sl": stop}

    def close(self, id, qty=None):
        global tradefy_signal
        tradefy_signal = {"action": "CLOSE", "id": id, "qty": qty}

    def order(self, id, direction, qty=None, limit=None, stop=None):
        side = "BUY" if direction == self.long else "SELL"
        q = qty if qty is not None else 0.0
        global tradefy_signal
        tradefy_signal = {"action": side, "qty": q, "tp": limit, "sl": stop}

    @property
    def position_size(self):
        return 0.0

    @property
    def position_avg_price(self):
        return 0.0

    @property
    def equity(self):
        return 0.0

strategy_api = _Strategy()

# ── Update position properties from injected globals ──
try:
    strategy_api.__class__.position_size = property(lambda self: _position_size)
    strategy_api.__class__.position_avg_price = property(lambda self: _position_avg_price)
    strategy_api.__class__.equity = property(lambda self: _equity)
except:
    pass
"#;

#[derive(Clone, Debug)]
pub struct PythonSignal {
    pub action: String,
    pub quantity: f64,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
}

#[derive(Clone, Debug)]
pub struct PlotOutput {
    pub plots: Vec<crate::indicator::PlotEntry>,
    pub hlines: Vec<crate::indicator::HlineEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExecutionStats {
    pub avg_ms: f64,
    pub max_ms: f64,
    pub min_ms: f64,
    pub count: usize,
    pub threshold_exceeded: bool,
}

#[derive(Clone)]
pub struct PythonRuntime {
    pending_signal: Arc<Mutex<Option<PythonSignal>>>,
    price_history: Arc<Mutex<Vec<f64>>>,
    time_series: Arc<Mutex<TimeSeries>>,
    pending_plots: Arc<Mutex<PlotOutput>>,
    position_size: Arc<Mutex<f64>>,
    position_avg_price: Arc<Mutex<f64>>,
    equity: Arc<Mutex<f64>>,
    execution_times: Arc<Mutex<Vec<f64>>>,
}

impl PythonRuntime {
    pub fn new() -> Self {
        Self {
            pending_signal: Arc::new(Mutex::new(None)),
            price_history: Arc::new(Mutex::new(Vec::with_capacity(MAX_CANDLES))),
            time_series: Arc::new(Mutex::new(TimeSeries::with_max_len(MAX_CANDLES))),
            pending_plots: Arc::new(Mutex::new(PlotOutput { plots: vec![], hlines: vec![] })),
            position_size: Arc::new(Mutex::new(0.0)),
            position_avg_price: Arc::new(Mutex::new(0.0)),
            equity: Arc::new(Mutex::new(0.0)),
            execution_times: Arc::new(Mutex::new(Vec::with_capacity(100))),
        }
    }

    pub fn get_signal(&self) -> Option<PythonSignal> {
        let mut sig = self.pending_signal.lock().unwrap();
        sig.take()
    }

    pub fn get_plots(&self) -> PlotOutput {
        self.pending_plots.lock().unwrap().clone()
    }

    pub fn set_position_state(&self, size: f64, avg_price: f64, equity_val: f64) {
        *self.position_size.lock().unwrap() = size;
        *self.position_avg_price.lock().unwrap() = avg_price;
        *self.equity.lock().unwrap() = equity_val;
    }

    pub fn get_execution_stats(&self) -> ExecutionStats {
        let times = self.execution_times.lock().unwrap();
        let len = times.len();
        if len == 0 {
            return ExecutionStats { avg_ms: 0.0, max_ms: 0.0, min_ms: 0.0, count: 0, threshold_exceeded: false };
        }
        let avg = times.iter().sum::<f64>() / len as f64;
        let max = times.iter().fold(0.0f64, |a, b| a.max(*b));
        let min = times.iter().fold(f64::MAX, |a, b| a.min(*b));
        ExecutionStats { avg_ms: avg, max_ms: max, min_ms: min, count: len, threshold_exceeded: max > 100.0 }
    }

    fn extract_signal(&self, globals: &PyDict) -> Result<(), String> {
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
    }

    fn extract_plots(&self, globals: &PyDict, py: Python<'_>) {
        let serialize_list = |name: &str| -> Option<Vec<serde_json::Value>> {
            let _obj = globals.get_item(name).ok()??;
            let json_str = py.eval(
                &format!("__import__('json').dumps({})", name),
                Some(globals),
                None,
            ).ok()?.extract::<String>().ok()?;
            serde_json::from_str(&json_str).ok()
        };

        let mut plots: Vec<crate::indicator::PlotEntry> = Vec::new();
        let mut hlines: Vec<crate::indicator::HlineEntry> = Vec::new();

        if let Some(plot_items) = serialize_list("_result_plots") {
            for item in plot_items {
                let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let label = item.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let color = item.get("color").and_then(|v| v.as_str()).unwrap_or("#3b82f6").to_string();
                let plot_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("line").to_string();
                let values = item.get("values").and_then(|v| v.as_array()).map(|arr| {
                    arr.iter().map(|val| val.as_f64()).collect::<Vec<Option<f64>>>()
                }).unwrap_or_default();
                plots.push(crate::indicator::PlotEntry { id, label, plot_type, color, values });
            }
        }

        if let Some(h_items) = serialize_list("_result_hlines") {
            for item in h_items {
                hlines.push(crate::indicator::HlineEntry {
                    entry_type: "hline".into(),
                    price: item.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    color: item.get("color").and_then(|v| v.as_str()).unwrap_or("#6b7280").to_string(),
                    style: item.get("style").and_then(|v| v.as_str()).unwrap_or("solid").to_string(),
                });
            }
        }

        let mut output = self.pending_plots.lock().unwrap();
        output.plots = plots;
        output.hlines = hlines;
    }

    pub fn execute_strategy(&self, code: &str, price: f64) -> Result<(), String> {
        {
            let mut history = self.price_history.lock().map_err(|_| "Lock error")?;
            history.push(price);
            if history.len() > MAX_CANDLES {
                history.remove(0);
            }
        }

        let pos_size = *self.position_size.lock().unwrap();
        let pos_avg = *self.position_avg_price.lock().unwrap();
        let eq = *self.equity.lock().unwrap();

        Python::with_gil(|py| {
            let globals = PyDict::new(py);

            globals.set_item("price", price).map_err(|e| e.to_string())?;
            globals.set_item("_position_size", pos_size).map_err(|e| e.to_string())?;
            globals.set_item("_position_avg_price", pos_avg).map_err(|e| e.to_string())?;
            globals.set_item("_equity", eq).map_err(|e| e.to_string())?;

            let candles = {
                let history = self.price_history.lock().map_err(|_| "Lock error")?;
                let arr: Vec<f64> = history.iter().copied().collect();
                PyList::new(py, &arr)
            };
            globals.set_item("candles", candles).map_err(|e| e.to_string())?;

            let code_with_globals = format!(
                r#"
{ta_lib}
{dsl}

try:
    syminfo.tickerid = _ta_symbol
except:
    pass

tradefy_signal = None

def buy(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "BUY", "qty": qty, "tp": tp, "sl": sl}}

def sell(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "SELL", "qty": qty, "tp": tp, "sl": sl}}

{code}
try:
    if _strategy_config.fn is not None:
        _strategy_config.fn()
    else:
        on_tick(price, candles)
except Exception as e:
    print(f"Error in strategy: {{e}}")

if tradefy_signal:
    _action = tradefy_signal["action"]
    _qty = tradefy_signal.get("qty", 0.0)
    _tp = tradefy_signal.get("tp")
    _sl = tradefy_signal.get("sl")
"#,
                ta_lib = TA_LIBRARY,
                dsl = DSL_PREAMBLE,
                code = code
            );

            globals.set_item("_ta_symbol", "UNKNOWN").map_err(|e| e.to_string())?;

            let start = Instant::now();
            py.run(&code_with_globals, Some(&globals), None)
                .map_err(|e| format!("Python error: {}", e))?;
            let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

            self.extract_signal(&globals)?;
            self.extract_plots(&globals, py);

            {
                let mut times = self.execution_times.lock().unwrap();
                times.push(elapsed_ms);
                if times.len() > 1000 {
                    times.remove(0);
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

        let pos_size = *self.position_size.lock().unwrap();
        let pos_avg = *self.position_avg_price.lock().unwrap();
        let eq = *self.equity.lock().unwrap();

        Python::with_gil(|py| {
            let globals = PyDict::new(py);

            globals.set_item("price", candle.close).map_err(|e| e.to_string())?;
            globals.set_item("open_val", candle.open).map_err(|e| e.to_string())?;
            globals.set_item("high_val", candle.high).map_err(|e| e.to_string())?;
            globals.set_item("low_val", candle.low).map_err(|e| e.to_string())?;
            globals.set_item("close_val", candle.close).map_err(|e| e.to_string())?;
            globals.set_item("volume_val", candle.volume).map_err(|e| e.to_string())?;
            globals.set_item("_position_size", pos_size).map_err(|e| e.to_string())?;
            globals.set_item("_position_avg_price", pos_avg).map_err(|e| e.to_string())?;
            globals.set_item("_equity", eq).map_err(|e| e.to_string())?;

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
            globals.set_item("_ta_symbol", &candle.symbol).map_err(|e| e.to_string())?;

            let code_with_globals = format!(
                r#"
{ta_lib}
{dsl}

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

try:
    syminfo.tickerid = _ta_symbol
except:
    pass

tradefy_signal = None

def buy(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "BUY", "qty": qty, "tp": tp, "sl": sl}}

def sell(qty, tp=None, sl=None):
    global tradefy_signal
    tradefy_signal = {{"action": "SELL", "qty": qty, "tp": tp, "sl": sl}}

{code}
try:
    if _strategy_config.fn is not None:
        _strategy_config.fn()
    else:
        on_tick(close_val, open_val, high_val, low_val, close_val, volume_val)
except Exception as e:
    print(f"Error in strategy: {{e}}")

if tradefy_signal:
    _action = tradefy_signal["action"]
    _qty = tradefy_signal.get("qty", 0.0)
    _tp = tradefy_signal.get("tp")
    _sl = tradefy_signal.get("sl")
"#,
                ta_lib = TA_LIBRARY,
                dsl = DSL_PREAMBLE,
                code = code
            );

            let start = Instant::now();
            py.run(&code_with_globals, Some(&globals), None)
                .map_err(|e| format!("Python error: {}", e))?;
            let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

            self.extract_signal(&globals)?;
            self.extract_plots(&globals, py);

            {
                let mut times = self.execution_times.lock().unwrap();
                times.push(elapsed_ms);
                if times.len() > 1000 {
                    times.remove(0);
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
