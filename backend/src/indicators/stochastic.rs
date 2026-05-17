use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

pub struct Stochastic {
    k_period: usize,
    k_smoothing: usize,
    d_period: usize,
    color: String,
}

impl Stochastic {
    pub fn new(params: &serde_json::Value, color: &str) -> Self {
        let k_period = params.get("k_period").and_then(|v| v.as_u64()).unwrap_or(14) as usize;
        let k_smoothing = params.get("k_smoothing").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
        let d_period = params.get("d_period").and_then(|v| v.as_u64()).unwrap_or(3) as usize;
        Self { k_period: k_period.max(1), k_smoothing: k_smoothing.max(1), d_period: d_period.max(1), color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "stochastic",
            "name": "Stochastic Oscillator",
            "category": "oscillator",
            "params": [
                { "name": "k_period", "label": "%K Period", "type": "int", "default": 14, "min": 1, "max": 200 },
                { "name": "k_smoothing", "label": "%K Smoothing", "type": "int", "default": 1, "min": 1, "max": 50 },
                { "name": "d_period", "label": "%D Period", "type": "int", "default": 3, "min": 1, "max": 50 }
            ]
        })
    }
}

impl Indicator for Stochastic {
    fn name(&self) -> &str { "Stochastic" }
    fn params(&self) -> Vec<ParamDesc> {
        vec![
            ParamDesc { name: "k_period".into(), label: "%K Period".into(), param_type: "int".into(), default: serde_json::json!(self.k_period), min: Some(1.0), max: Some(200.0) },
            ParamDesc { name: "k_smoothing".into(), label: "%K Smoothing".into(), param_type: "int".into(), default: serde_json::json!(self.k_smoothing), min: Some(1.0), max: Some(50.0) },
            ParamDesc { name: "d_period".into(), label: "%D Period".into(), param_type: "int".into(), default: serde_json::json!(self.d_period), min: Some(1.0), max: Some(50.0) },
        ]
    }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let len = candles.len();
        let mut raw_k = vec![None; len];

        if !crate::indicators::ensure_minimum(candles, self.k_period) {
            let empty = vec![None; len];
            return IndicatorOutput {
                plots: vec![
                    Plot::Line { id: "stoch_k".into(), label: format!("%K ({})", self.k_period), color: self.color.clone(), values: empty.clone() },
                    Plot::Line { id: "stoch_d".into(), label: format!("%D ({})", self.d_period), color: "#f59e0b".into(), values: empty },
                    Plot::Hline { price: 80.0, color: "#ef4444".into(), style: "dashed".into() },
                    Plot::Hline { price: 20.0, color: "#22c55e".into(), style: "dashed".into() },
                ],
            };
        }

        for i in (self.k_period - 1)..len {
            let slice = &candles[i + 1 - self.k_period..=i];
            let highest: f64 = slice.iter().map(|c| c.high).fold(f64::NEG_INFINITY, f64::max);
            let lowest: f64 = slice.iter().map(|c| c.low).fold(f64::INFINITY, f64::min);
            let range = highest - lowest;
            if range != 0.0 {
                raw_k[i] = Some(crate::indicators::guarded(crate::indicators::safe_div(candles[i].close - lowest, range) * 100.0));
            } else {
                raw_k[i] = Some(50.0);
            }
        }

        let values_k: Vec<Option<f64>> = if self.k_smoothing > 1 {
            let mut smoothed = vec![None; len];
            for i in 0..len {
                if i < self.k_smoothing - 1 { continue; }
                let count = self.k_smoothing;
                let sum: f64 = raw_k[i + 1 - count..=i].iter().filter_map(|v| *v).sum();
                let valid = raw_k[i + 1 - count..=i].iter().filter(|v| v.is_some()).count();
                if valid == count {
                    smoothed[i] = Some(crate::indicators::guarded(crate::indicators::safe_div(sum, count as f64)));
                }
            }
            smoothed
        } else {
            raw_k
        };

        let values_d: Vec<Option<f64>> = if len >= self.d_period {
            let mut d = vec![None; len];
            for i in (self.d_period - 1)..len {
                let sum: f64 = values_k[i + 1 - self.d_period..=i].iter().filter_map(|v| *v).sum();
                let valid = values_k[i + 1 - self.d_period..=i].iter().filter(|v| v.is_some()).count();
                if valid == self.d_period {
                    d[i] = Some(crate::indicators::guarded(crate::indicators::safe_div(sum, self.d_period as f64)));
                }
            }
            d
        } else {
            vec![None; len]
        };

        IndicatorOutput {
            plots: vec![
                Plot::Line { id: "stoch_k".into(), label: format!("%K ({})", self.k_period), color: self.color.clone(), values: values_k },
                Plot::Line { id: "stoch_d".into(), label: format!("%D ({})", self.d_period), color: "#f59e0b".into(), values: values_d },
                Plot::Hline { price: 80.0, color: "#ef4444".into(), style: "dashed".into() },
                Plot::Hline { price: 20.0, color: "#22c55e".into(), style: "dashed".into() },
            ],
        }
    }
}
