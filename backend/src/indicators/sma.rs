use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

pub struct SMA {
    period: usize,
    color: String,
}

impl SMA {
    pub fn new(params: &serde_json::Value, color: &str) -> Self {
        let period = params.get("period")
            .and_then(|v| v.as_u64())
            .unwrap_or(20) as usize;
        Self { period: period.max(1), color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "sma",
            "name": "Simple Moving Average",
            "category": "trend",
            "params": [
                { "name": "period", "label": "Period", "type": "int", "default": 20, "min": 1, "max": 500 }
            ]
        })
    }
}

impl Indicator for SMA {
    fn name(&self) -> &str { "SMA" }
    fn params(&self) -> Vec<ParamDesc> {
        vec![ParamDesc {
            name: "period".into(), label: "Period".into(), param_type: "int".into(),
            default: serde_json::json!(self.period), min: Some(1.0), max: Some(500.0),
        }]
    }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
        let mut values = vec![None; closes.len()];
        for i in (self.period - 1)..closes.len() {
            let sum: f64 = closes[i + 1 - self.period..=i].iter().sum();
            values[i] = Some(sum / self.period as f64);
        }
        IndicatorOutput {
            plots: vec![Plot::Line {
                id: format!("sma_{}", self.period),
                label: format!("SMA({})", self.period),
                color: self.color.clone(),
                values,
            }],
        }
    }
}
