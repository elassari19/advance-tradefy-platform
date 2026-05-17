use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

pub struct ATR {
    period: usize,
    color: String,
}

impl ATR {
    pub fn new(params: &serde_json::Value, color: &str) -> Self {
        let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(14) as usize;
        Self { period: period.max(1), color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "atr",
            "name": "Average True Range",
            "category": "volatility",
            "params": [
                { "name": "period", "label": "Period", "type": "int", "default": 14, "min": 1, "max": 200 }
            ]
        })
    }
}

fn true_range(candle: &Candle, prev_close: f64) -> f64 {
    let hl = candle.high - candle.low;
    let hc = (candle.high - prev_close).abs();
    let lc = (candle.low - prev_close).abs();
    hl.max(hc).max(lc)
}

impl Indicator for ATR {
    fn name(&self) -> &str { "ATR" }
    fn params(&self) -> Vec<ParamDesc> {
        vec![ParamDesc {
            name: "period".into(), label: "Period".into(), param_type: "int".into(),
            default: serde_json::json!(self.period), min: Some(1.0), max: Some(200.0),
        }]
    }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let len = candles.len();
        let mut values = vec![None; len];

        if len < self.period + 1 {
            return IndicatorOutput { plots: vec![Plot::Line {
                id: format!("atr_{}", self.period), label: format!("ATR({})", self.period),
                color: self.color.clone(), values,
            }]};
        }

        let mut tr_values = Vec::with_capacity(len - 1);
        for i in 1..len {
            tr_values.push(true_range(&candles[i], candles[i - 1].close));
        }

        let first_atr: f64 = tr_values[..self.period].iter().sum::<f64>() / self.period as f64;
        values[self.period] = Some(first_atr);

        for i in (self.period + 1)..len {
            let tr = tr_values[i - 1];
            let prev = values[i - 1].unwrap();
            values[i] = Some((prev * (self.period as f64 - 1.0) + tr) / self.period as f64);
        }

        IndicatorOutput {
            plots: vec![Plot::Line {
                id: format!("atr_{}", self.period), label: format!("ATR({})", self.period),
                color: self.color.clone(), values,
            }],
        }
    }
}
