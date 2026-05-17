use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

fn ema_values(data: &[f64], period: usize) -> Vec<Option<f64>> {
    let mut result = vec![None; data.len()];
    if data.len() < period { return result; }
    let multiplier = 2.0 / (period as f64 + 1.0);
    let first_sum: f64 = data[..period].iter().sum();
    let mut ema = first_sum / period as f64;
    result[period - 1] = Some(ema);
    for i in period..data.len() {
        ema = (data[i] - ema) * multiplier + ema;
        result[i] = Some(ema);
    }
    result
}

pub struct MACD {
    fast: usize,
    slow: usize,
    signal: usize,
    color: String,
}

impl MACD {
    pub fn new(params: &serde_json::Value, color: &str) -> Self {
        let fast = params.get("fast").and_then(|v| v.as_u64()).unwrap_or(12) as usize;
        let slow = params.get("slow").and_then(|v| v.as_u64()).unwrap_or(26) as usize;
        let signal = params.get("signal").and_then(|v| v.as_u64()).unwrap_or(9) as usize;
        Self { fast: fast.max(1), slow: slow.max(1), signal: signal.max(1), color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "macd",
            "name": "MACD",
            "category": "oscillator",
            "params": [
                { "name": "fast", "label": "Fast Length", "type": "int", "default": 12, "min": 1, "max": 200 },
                { "name": "slow", "label": "Slow Length", "type": "int", "default": 26, "min": 1, "max": 500 },
                { "name": "signal", "label": "Signal Length", "type": "int", "default": 9, "min": 1, "max": 200 }
            ]
        })
    }
}

impl Indicator for MACD {
    fn name(&self) -> &str { "MACD" }
    fn params(&self) -> Vec<ParamDesc> {
        vec![
            ParamDesc { name: "fast".into(), label: "Fast Length".into(), param_type: "int".into(), default: serde_json::json!(self.fast), min: Some(1.0), max: Some(200.0) },
            ParamDesc { name: "slow".into(), label: "Slow Length".into(), param_type: "int".into(), default: serde_json::json!(self.slow), min: Some(1.0), max: Some(500.0) },
            ParamDesc { name: "signal".into(), label: "Signal Length".into(), param_type: "int".into(), default: serde_json::json!(self.signal), min: Some(1.0), max: Some(200.0) },
        ]
    }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
        let len = closes.len();

        let fast_ema = ema_values(&closes, self.fast);
        let slow_ema = ema_values(&closes, self.slow);

        let mut macd_line = vec![None; len];
        for i in 0..len {
            if let (Some(f), Some(s)) = (fast_ema[i], slow_ema[i]) {
                macd_line[i] = Some(f - s);
            }
        }

        let macd_values: Vec<f64> = macd_line.iter().filter_map(|v| *v).collect();
        let macd_offset = len - macd_values.len();
        let signal_ema = ema_values(&macd_values, self.signal);

        let mut signal_line = vec![None; len];
        for i in 0..signal_ema.len() {
            signal_line[macd_offset + i] = signal_ema[i];
        }

        let mut histogram = vec![None; len];
        for i in 0..len {
            if let (Some(m), Some(s)) = (macd_line[i], signal_line[i]) {
                histogram[i] = Some(m - s);
            }
        }

        IndicatorOutput {
            plots: vec![
                Plot::Line { id: "macd".into(), label: "MACD".into(), color: self.color.clone(), values: macd_line },
                Plot::Line { id: "macd_signal".into(), label: "Signal".into(), color: "#f59e0b".into(), values: signal_line },
                Plot::Histogram { id: "macd_hist".into(), color: "#22c55e".into(), values: histogram },
                Plot::Hline { price: 0.0, color: "#6b7280".into(), style: "solid".into() },
            ],
        }
    }
}
