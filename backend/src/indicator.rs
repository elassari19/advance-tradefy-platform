use pyo3::{prelude::*, types::PyDict, types::PyList};
use serde::{Deserialize, Serialize};

pub const TA_LIBRARY: &str = r#"
def _to_list(src):
    return src._data if hasattr(src, '_data') else list(src)

class ta:
    @staticmethod
    def sma(source, period):
        data = _to_list(source)
        n = len(data)
        result = [None] * n
        for i in range(period - 1, n):
            s = 0.0
            for j in range(i - period + 1, i + 1):
                v = data[j]
                s += v if v is not None else 0.0
            result[i] = s / period
        return result

    @staticmethod
    def ema(source, period):
        data = _to_list(source)
        n = len(data)
        result = [None] * n
        if n < period: return result
        multiplier = 2.0 / (period + 1)
        s = 0.0
        for j in range(period):
            v = data[j]
            s += v if v is not None else 0.0
        ema = s / period
        result[period - 1] = ema
        for i in range(period, n):
            v = data[i] if data[i] is not None else 0.0
            ema = (v - ema) * multiplier + ema
            result[i] = ema
        return result

    @staticmethod
    def rsi(source, period):
        data = _to_list(source)
        n = len(data)
        result = [None] * n
        if n < period + 1: return result
        gains = []
        losses = []
        for i in range(1, n):
            a = data[i] if data[i] is not None else 0.0
            b = data[i-1] if data[i-1] is not None else 0.0
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
        for i in range(period + 1, n):
            avg_gain = (avg_gain * (period - 1) + gains[i-1]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i-1]) / period
            if avg_loss == 0:
                result[i] = 100.0
            else:
                rs = avg_gain / avg_loss
                result[i] = 100.0 - 100.0 / (1.0 + rs)
        return result

    @staticmethod
    def macd(source, fast, slow, signal):
        data = _to_list(source)
        n = len(data)
        fast_ema = ta.ema(data, fast)
        slow_ema = ta.ema(data, slow)
        macd_line = [None] * n
        for i in range(n):
            if fast_ema[i] is not None and slow_ema[i] is not None:
                macd_line[i] = fast_ema[i] - slow_ema[i]
        macd_values = [v for v in macd_line if v is not None]
        offset = n - len(macd_values)
        signal_ema = ta.ema(macd_values, signal)
        signal_line = [None] * n
        for i in range(len(signal_ema)):
            if signal_ema[i] is not None:
                signal_line[offset + i] = signal_ema[i]
        histogram = [None] * n
        for i in range(n):
            if macd_line[i] is not None and signal_line[i] is not None:
                histogram[i] = macd_line[i] - signal_line[i]
        return macd_line, signal_line, histogram

    @staticmethod
    def bb(source, period, stddev):
        data = _to_list(source)
        n = len(data)
        middle = [None] * n
        upper = [None] * n
        lower = [None] * n
        for i in range(period - 1, n):
            slice_vals = data[i-period+1:i+1]
            clean = [v if v is not None else 0.0 for v in slice_vals]
            mean = sum(clean) / period
            variance = sum((v - mean) ** 2 for v in clean) / period
            std = variance ** 0.5
            middle[i] = mean
            upper[i] = mean + stddev * std
            lower[i] = mean - stddev * std
        return middle, upper, lower

    @staticmethod
    def atr(length):
        h = _to_list(high)
        l = _to_list(low)
        c = _to_list(close)
        n = len(h)
        result = [None] * n
        if n < length + 1: return result
        tr_values = []
        for i in range(1, n):
            hl = h[i] - l[i]
            hc = abs(h[i] - c[i-1])
            lc = abs(l[i] - c[i-1])
            tr_values.append(max(hl, hc, lc))
        atr_val = sum(tr_values[:length]) / length
        result[length] = atr_val
        for i in range(length + 1, n):
            atr_val = (atr_val * (length - 1) + tr_values[i-1]) / length
            result[i] = atr_val
        return result

    @staticmethod
    def stoch(high_src, low_src, close_src, k_period, k_smoothing=3, d_period=3):
        h = _to_list(high_src)
        l = _to_list(low_src)
        c = _to_list(close_src)
        n = len(c)
        raw_k = [None] * n
        for i in range(k_period - 1, n):
            chunk_high = h[i-k_period+1:i+1]
            chunk_low = l[i-k_period+1:i+1]
            highest = max(chunk_high)
            lowest = min(chunk_low)
            if highest - lowest != 0:
                raw_k[i] = (c[i] - lowest) / (highest - lowest) * 100
            else:
                raw_k[i] = 50.0
        k_line = ta.sma(raw_k, k_smoothing) if k_smoothing > 1 else raw_k[:]
        d_line = ta.sma(k_line, d_period)
        return k_line, d_line

    @staticmethod
    def crossover(a, b):
        a = _to_list(a)
        b = _to_list(b)
        if len(a) < 2 or len(b) < 2: return False
        a_prev = a[-2] if a[-2] is not None else 0.0
        a_curr = a[-1] if a[-1] is not None else 0.0
        b_prev = b[-2] if b[-2] is not None else 0.0
        b_curr = b[-1] if b[-1] is not None else 0.0
        return a_prev < b_prev and a_curr > b_curr

    @staticmethod
    def crossunder(a, b):
        a = _to_list(a)
        b = _to_list(b)
        if len(a) < 2 or len(b) < 2: return False
        a_prev = a[-2] if a[-2] is not None else 0.0
        a_curr = a[-1] if a[-1] is not None else 0.0
        b_prev = b[-2] if b[-2] is not None else 0.0
        b_curr = b[-1] if b[-1] is not None else 0.0
        return a_prev > b_prev and a_curr < b_curr

    @staticmethod
    def highest(source, length):
        data = _to_list(source)
        if len(data) < length: return max(data) if data else 0
        return max(data[-length:])

    @staticmethod
    def lowest(source, length):
        data = _to_list(source)
        if len(data) < length: return min(data) if data else 0
        return min(data[-length:])

    @staticmethod
    def change(source, length):
        data = _to_list(source)
        if len(data) < length + 1: return 0
        a = data[-1] if data[-1] is not None else 0.0
        b = data[-1-length] if data[-1-length] is not None else 0.0
        return a - b

    @staticmethod
    def alma(source, length, offset=0.85, sigma=6):
        data = _to_list(source)
        n = len(data)
        result = [None] * n
        if n < length: return result
        m = offset * (length - 1)
        s = length / sigma
        for i in range(length - 1, n):
            wsum = 0.0
            norm = 0.0
            for j in range(length):
                w = (j - m) / s
                w = 2.71828 ** (-w * w / 2.0)
                v = data[i - length + 1 + j]
                wsum += w * (v if v is not None else 0.0)
                norm += w
            result[i] = wsum / norm if norm != 0 else 0.0
        return result

    @staticmethod
    def vwap():
        h = _to_list(high)
        l = _to_list(low)
        c = _to_list(close)
        v = _to_list(volume)
        n = len(h)
        result = [None] * n
        cum_pv = 0.0
        cum_v = 0.0
        for i in range(n):
            if h[i] is not None and l[i] is not None and c[i] is not None and v[i] is not None:
                tp = (h[i] + l[i] + c[i]) / 3.0
                cum_pv += tp * v[i]
                cum_v += v[i]
            result[i] = cum_pv / cum_v if cum_v > 0 else None
        return result

# ===== State Variables =====
try:
    bar_index = len(_close_data) - 1
except:
    bar_index = 0

class barstate:
    isrealtime = False
    isconfirmed = True

class syminfo:
    tickerid = ""

class timeframe:
    period = ""

# ===== Standalone Helpers =====
def nz(value, fallback=0.0):
    return value if value is not None else fallback

def iff(condition, a, b):
    return a if condition else b

def security(symbol, tf, expression):
    return expression

# ===== Backward Compat Standalone Functions (kept for indicator sandbox) =====
def ta_sma(source, period):
    return ta.sma(source, period)

def ta_ema(source, period):
    return ta.ema(source, period)

def ta_rsi(source, period):
    return ta.rsi(source, period)

def ta_macd(source, fast, slow, signal):
    return ta.macd(source, fast, slow, signal)

def ta_bb(source, period, stddev):
    return ta.bb(source, period, stddev)

def ta_atr(candles, period):
    try:
        h = _to_list(high)
        l = _to_list(low)
        c = _to_list(close)
    except:
        try:
            h = [d["high"] for d in candles]
            l = [d["low"] for d in candles]
            c = [d["close"] for d in candles]
        except:
            return [None] * len(candles)
    n = len(h)
    result = [None] * n
    if n < period + 1: return result
    tr_values = []
    for i in range(1, n):
        hl = h[i] - l[i]
        hc = abs(h[i] - c[i-1])
        lc = abs(l[i] - c[i-1])
        tr_values.append(max(hl, hc, lc))
    atr_val = sum(tr_values[:period]) / period
    result[period] = atr_val
    for i in range(period + 1, n):
        atr_val = (atr_val * (period - 1) + tr_values[i-1]) / period
        result[i] = atr_val
    return result

def ta_stoch(candles, k_period, k_smoothing, d_period):
    try:
        h = _to_list(high)
        l = _to_list(low)
        c = _to_list(close)
    except:
        h = [d["high"] for d in candles]
        l = [d["low"] for d in candles]
        c = [d["close"] for d in candles]
    return ta.stoch(h, l, c, k_period, k_smoothing, d_period)

def ta_crossover(a, b):
    return ta.crossover(a, b)

def ta_crossunder(a, b):
    return ta.crossunder(a, b)

def ta_highest(source, length):
    return ta.highest(source, length)

def ta_lowest(source, length):
    return ta.lowest(source, length)

def ta_change(source, length):
    return ta.change(source, length)
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

        let open_prices: Vec<f64> = candles.iter()
            .filter_map(|c| c.get("open").and_then(|v| v.as_f64()))
            .collect();
        globals.set_item("_open_data", PyList::new(py, &open_prices)).map_err(|e| e.to_string())?;

        let high_prices: Vec<f64> = candles.iter()
            .filter_map(|c| c.get("high").and_then(|v| v.as_f64()))
            .collect();
        globals.set_item("_high_data", PyList::new(py, &high_prices)).map_err(|e| e.to_string())?;

        let low_prices: Vec<f64> = candles.iter()
            .filter_map(|c| c.get("low").and_then(|v| v.as_f64()))
            .collect();
        globals.set_item("_low_data", PyList::new(py, &low_prices)).map_err(|e| e.to_string())?;

        let volume_data: Vec<f64> = candles.iter()
            .filter_map(|c| c.get("volume").and_then(|v| v.as_f64()))
            .collect();
        globals.set_item("_volume_data", PyList::new(py, &volume_data)).map_err(|e| e.to_string())?;

        let first = candles.first();
        let symbol = first.and_then(|c| c.get("symbol")).and_then(|v| v.as_str()).unwrap_or("UNKNOWN");
        globals.set_item("_ta_symbol", symbol).map_err(|e| e.to_string())?;

        let wrapped = format!(
            r#"
{ta_lib}

class Series:
    def __init__(self, data):
        self._data = data
    def __getitem__(self, offset):
        if isinstance(offset, int) and offset < len(self._data):
            return self._data[len(self._data) - 1 - offset]
        return None
    def __float__(self):
        return self._data[-1] if self._data else 0.0

try:
    open = Series(_open_data)
    high = Series(_high_data)
    low = Series(_low_data)
    close = Series(_close_data)
    volume = Series(_volume_data)
except:
    pass

syminfo.tickerid = _ta_symbol

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
