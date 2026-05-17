use pyo3::{prelude::*, types::PyDict, types::PyList};
use serde::{Deserialize, Serialize};

const TA_LIBRARY: &str = r#"
def ta_sma(source, period):
    result = [None] * len(source)
    for i in range(period - 1, len(source)):
        s = 0.0
        for j in range(i - period + 1, i + 1):
            v = source[j]
            if v is None: v = 0.0
            s += v
        result[i] = s / period
    return result

def ta_ema(source, period):
    result = [None] * len(source)
    if len(source) < period: return result
    multiplier = 2.0 / (period + 1)
    s = 0.0
    for j in range(period):
        v = source[j]
        if v is None: v = 0.0
        s += v
    ema = s / period
    result[period - 1] = ema
    for i in range(period, len(source)):
        v = source[i] if source[i] is not None else 0.0
        ema = (v - ema) * multiplier + ema
        result[i] = ema
    return result

def ta_rsi(source, period):
    result = [None] * len(source)
    if len(source) < period + 1: return result
    gains = []
    losses = []
    for i in range(1, len(source)):
        a = source[i] if source[i] is not None else 0.0
        b = source[i-1] if source[i-1] is not None else 0.0
        diff = a - b
        gains.append(diff if diff > 0 else 0.0)
        losses.append(-diff if diff < 0 else 0.0)
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    if avg_loss == 0:
        result[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        result[period] = 100.0 - 100.0 / (1.0 + rs)
    for i in range(period + 1, len(source)):
        avg_gain = (avg_gain * (period - 1) + gains[i-1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i-1]) / period
        if avg_loss == 0:
            result[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i] = 100.0 - 100.0 / (1.0 + rs)
    return result

def ta_macd(source, fast, slow, signal):
    fast_ema = ta_ema(source, fast)
    slow_ema = ta_ema(source, slow)
    macd_line = [None] * len(source)
    for i in range(len(source)):
        if fast_ema[i] is not None and slow_ema[i] is not None:
            macd_line[i] = fast_ema[i] - slow_ema[i]
    macd_values = [v for v in macd_line if v is not None]
    offset = len(source) - len(macd_values)
    signal_ema = ta_ema(macd_values, signal)
    signal_line = [None] * len(source)
    for i in range(len(signal_ema)):
        if signal_ema[i] is not None:
            signal_line[offset + i] = signal_ema[i]
    histogram = [None] * len(source)
    for i in range(len(source)):
        if macd_line[i] is not None and signal_line[i] is not None:
            histogram[i] = macd_line[i] - signal_line[i]
    return macd_line, signal_line, histogram

def ta_bb(source, period, stddev):
    result = [None] * len(source)
    upper = [None] * len(source)
    lower = [None] * len(source)
    for i in range(period - 1, len(source)):
        slice_vals = source[i-period+1:i+1]
        clean = [v if v is not None else 0.0 for v in slice_vals]
        mean = sum(clean) / period
        variance = sum((v - mean) ** 2 for v in clean) / period
        std = variance ** 0.5
        result[i] = mean
        upper[i] = mean + stddev * std
        lower[i] = mean - stddev * std
    return result, upper, lower

def ta_atr(candles, period):
    result = [None] * len(candles)
    if len(candles) < period + 1: return result
    tr_values = []
    for i in range(1, len(candles)):
        hl = candles[i]["high"] - candles[i]["low"]
        hc = abs(candles[i]["high"] - candles[i-1]["close"])
        lc = abs(candles[i]["low"] - candles[i-1]["close"])
        tr_values.append(max(hl, hc, lc))
    atr = sum(tr_values[:period]) / period
    result[period] = atr
    for i in range(period + 1, len(candles)):
        atr = (atr * (period - 1) + tr_values[i-1]) / period
        result[i] = atr
    return result

def ta_stoch(candles, k_period, k_smoothing, d_period):
    close = [c["close"] for c in candles]
    raw_k = [None] * len(candles)
    for i in range(k_period - 1, len(candles)):
        highs = [candles[j]["high"] for j in range(i-k_period+1, i+1)]
        lows = [candles[j]["low"] for j in range(i-k_period+1, i+1)]
        highest = max(highs)
        lowest = min(lows)
        if highest - lowest != 0:
            raw_k[i] = (close[i] - lowest) / (highest - lowest) * 100
        else:
            raw_k[i] = 50.0
    k_line = ta_sma(raw_k, k_smoothing) if k_smoothing > 1 else raw_k
    d_line = ta_sma(k_line, d_period)
    return k_line, d_line

def ta_crossover(a, b):
    if len(a) < 2 or len(b) < 2: return False
    a_prev = a[-2] if a[-2] is not None else 0.0
    a_curr = a[-1] if a[-1] is not None else 0.0
    b_prev = b[-2] if b[-2] is not None else 0.0
    b_curr = b[-1] if b[-1] is not None else 0.0
    return a_prev < b_prev and a_curr > b_curr

def ta_crossunder(a, b):
    if len(a) < 2 or len(b) < 2: return False
    a_prev = a[-2] if a[-2] is not None else 0.0
    a_curr = a[-1] if a[-1] is not None else 0.0
    b_prev = b[-2] if b[-2] is not None else 0.0
    b_curr = b[-1] if b[-1] is not None else 0.0
    return a_prev > b_prev and a_curr < b_curr

def ta_highest(source, length):
    if len(source) < length: return max(source) if source else 0
    return max(source[-length:])

def ta_lowest(source, length):
    if len(source) < length: return min(source) if source else 0
    return min(source[-length:])

def ta_change(source, length):
    if len(source) < length + 1: return 0
    a = source[-1] if source[-1] is not None else 0.0
    b = source[-1-length] if source[-1-length] is not None else 0.0
    return a - b

def nz(value, fallback=0.0):
    return value if value is not None else fallback

def iff(condition, a, b):
    return a if condition else b
"#;

#[derive(Debug, Deserialize)]
pub struct EvaluateRequest {
    pub script: String,
    pub candles: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlotEntry {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub plot_type: String,
    pub color: String,
    pub values: Vec<Option<f64>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HlineEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub price: f64,
    pub color: String,
    pub style: String,
}

#[derive(Debug, Serialize)]
pub struct EvaluateResponse {
    pub values: Vec<IndicatorValue>,
    pub plots: Vec<PlotEntry>,
    pub hlines: Vec<HlineEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndicatorValue {
    pub time: u64,
    pub value: f64,
}

pub fn evaluate_indicator(script: &str, candles: &[serde_json::Value]) -> Result<EvaluateResponse, String> {
    Python::with_gil(|py| -> Result<EvaluateResponse, String> {
        let globals = PyDict::new(py);

        let candle_list = PyList::empty(py);
        for c in candles {
            let time = c.get("time").and_then(|v| v.as_u64()).unwrap_or(0);
            let open = c.get("open").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let high = c.get("high").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let low = c.get("low").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let close = c.get("close").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let volume = c.get("volume").and_then(|v| v.as_f64()).unwrap_or(0.0);

            let d = PyDict::new(py);
            d.set_item("time", time).map_err(|e| e.to_string())?;
            d.set_item("open", open).map_err(|e| e.to_string())?;
            d.set_item("high", high).map_err(|e| e.to_string())?;
            d.set_item("low", low).map_err(|e| e.to_string())?;
            d.set_item("close", close).map_err(|e| e.to_string())?;
            d.set_item("volume", volume).map_err(|e| e.to_string())?;
            candle_list.append(d).map_err(|e| e.to_string())?;
        }
        globals.set_item("candles", candle_list).map_err(|e| e.to_string())?;

        let close_prices: Vec<f64> = candles.iter()
            .filter_map(|c| c.get("close").and_then(|v| v.as_f64()))
            .collect();
        globals.set_item("_close_data", PyList::new(py, &close_prices)).map_err(|e| e.to_string())?;

        let wrapped = format!(
            r#"
{ta_lib}

_result_plots = []
_result_hlines = []

def plot(id, label, color="", type="line", values=None):
    _result_plots.append({{"id": id, "label": label, "color": color, "type": type, "values": values if values is not None else []}})

def hline(price, color='#6b7280', style='solid'):
    _result_hlines.append({{"type": "hline", "price": price, "color": color, "style": style}})

def plotshape(series, title="", location="abovebar", style="arrowup", size="normal"):
    pass

def plotarrow(series, title='', colorup='#22c55e', colordown='#ef4444'):
    pass

def bgcolor(color):
    pass

def fill(series1, series2, color):
    pass

{script}
__result_enhanced = run(candles)
"#,
            ta_lib = TA_LIBRARY,
            script = script
        );

        py.run(&wrapped, Some(&globals), None)
            .map_err(|e| format!("Python error: {}", e))?;

        let mut plots: Vec<PlotEntry> = Vec::new();
        let mut hlines: Vec<HlineEntry> = Vec::new();

        let serialize_list = |name: &str| -> Option<Vec<serde_json::Value>> {
            let _obj = globals.get_item(name).ok()??;
            let json_str = py.eval(
                &format!("__import__('json').dumps({})", name),
                Some(&globals),
                None,
            ).ok()?.extract::<String>().ok()?;
            serde_json::from_str(&json_str).ok()
        };

        if let Some(plot_items) = serialize_list("_result_plots") {
            for item in plot_items {
                let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let label = item.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let color = item.get("color").and_then(|v| v.as_str()).unwrap_or("#3b82f6").to_string();
                let plot_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("line").to_string();
                let values = item.get("values").and_then(|v| v.as_array()).map(|arr| {
                    arr.iter().map(|val| val.as_f64()).collect::<Vec<Option<f64>>>()
                }).unwrap_or_default();
                plots.push(PlotEntry { id, label, plot_type, color, values });
            }
        }

        if let Some(h_items) = serialize_list("_result_hlines") {
            for item in h_items {
                hlines.push(HlineEntry {
                    entry_type: "hline".into(),
                    price: item.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    color: item.get("color").and_then(|v| v.as_str()).unwrap_or("#6b7280").to_string(),
                    style: item.get("style").and_then(|v| v.as_str()).unwrap_or("solid").to_string(),
                });
            }
        }

        if plots.is_empty() && hlines.is_empty() {
            if let Some(enhanced) = serialize_list("__result_enhanced") {
                let val = serde_json::Value::Array(enhanced);
                if let Some(val_obj) = val.as_array().and_then(|a| a.first()) {
                    if let Some(enhanced_plots) = val_obj.get("plots").and_then(|v| v.as_array()) {
                        for item in enhanced_plots {
                            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let label = item.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let color = item.get("color").and_then(|v| v.as_str()).unwrap_or("#3b82f6").to_string();
                            let plot_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("line").to_string();
                            let values = item.get("values").and_then(|v| v.as_array()).map(|arr| {
                                arr.iter().map(|val| val.as_f64()).collect::<Vec<Option<f64>>>()
                            }).unwrap_or_default();
                            plots.push(PlotEntry { id, label, plot_type, color, values });
                        }
                    }
                    if let Some(enhanced_hlines) = val_obj.get("hlines").and_then(|v| v.as_array()) {
                        for item in enhanced_hlines {
                            hlines.push(HlineEntry {
                                entry_type: "hline".into(),
                                price: item.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0),
                                color: item.get("color").and_then(|v| v.as_str()).unwrap_or("#6b7280").to_string(),
                                style: item.get("style").and_then(|v| v.as_str()).unwrap_or("solid").to_string(),
                            });
                        }
                    }
                    if plots.is_empty() {
                        if let Some(flat_values) = val.as_array().and_then(|a| {
                            serde_json::from_value::<Vec<IndicatorValue>>(serde_json::Value::Array(a.clone())).ok()
                        }) {
                            return Ok(EvaluateResponse { values: flat_values, plots: vec![], hlines: vec![] });
                        }
                    }
                }
            }
        }

        let values: Vec<IndicatorValue> = Vec::new();
        Ok(EvaluateResponse { values, plots, hlines })
    })
    .map_err(|e: String| e)
}
