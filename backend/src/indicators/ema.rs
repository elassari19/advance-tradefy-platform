use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

pub struct EMA {
    period: usize,
    color: String,
}

impl EMA {
    pub fn new(params: &serde_json::Value, color: &str) -> Self {
        let period = params.get("period")
            .and_then(|v| v.as_u64())
            .unwrap_or(20) as usize;
        Self { period: period.max(1), color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "ema",
            "name": "Exponential Moving Average",
            "category": "trend",
            "params": [
                { "name": "period", "label": "Period", "type": "int", "default": 20, "min": 1, "max": 500 }
            ]
        })
    }
}

impl Indicator for EMA {
    fn name(&self) -> &str { "EMA" }
    fn params(&self) -> Vec<ParamDesc> {
        vec![ParamDesc {
            name: "period".into(), label: "Period".into(), param_type: "int".into(),
            default: serde_json::json!(self.period), min: Some(1.0), max: Some(500.0),
        }]
    }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
        let mut values = vec![None; closes.len()];
        let multiplier = 2.0 / (self.period as f64 + 1.0);

        if closes.is_empty() || closes.len() < self.period {
            return IndicatorOutput { plots: vec![Plot::Line {
                id: format!("ema_{}", self.period), label: format!("EMA({})", self.period),
                color: self.color.clone(), values,
            }]};
        }

        let first_sum: f64 = closes[..self.period].iter().sum();
        let mut ema = first_sum / self.period as f64;
        values[self.period - 1] = Some(ema);

        for i in self.period..closes.len() {
            ema = (closes[i] - ema) * multiplier + ema;
            values[i] = Some(ema);
        }

        IndicatorOutput {
            plots: vec![Plot::Line {
                id: format!("ema_{}", self.period), label: format!("EMA({})", self.period),
                color: self.color.clone(), values,
            }],
        }
    }
}
