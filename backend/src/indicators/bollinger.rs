use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

pub struct Bollinger {
    period: usize,
    stddev: f64,
    color: String,
}

impl Bollinger {
    pub fn new(params: &serde_json::Value, color: &str) -> Self {
        let period = params.get("period").and_then(|v| v.as_u64()).unwrap_or(20) as usize;
        let stddev = params.get("stddev").and_then(|v| v.as_f64()).unwrap_or(2.0);
        Self { period: period.max(1), stddev: stddev.max(0.1), color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "bollinger",
            "name": "Bollinger Bands",
            "category": "trend",
            "params": [
                { "name": "period", "label": "Period", "type": "int", "default": 20, "min": 1, "max": 500 },
                { "name": "stddev", "label": "Std Dev", "type": "float", "default": 2.0, "min": 0.5, "max": 5.0 }
            ]
        })
    }
}

impl Indicator for Bollinger {
    fn name(&self) -> &str { "Bollinger" }
    fn params(&self) -> Vec<ParamDesc> {
        vec![
            ParamDesc { name: "period".into(), label: "Period".into(), param_type: "int".into(), default: serde_json::json!(self.period), min: Some(1.0), max: Some(500.0) },
            ParamDesc { name: "stddev".into(), label: "Std Dev".into(), param_type: "float".into(), default: serde_json::json!(self.stddev), min: Some(0.5), max: Some(5.0) },
        ]
    }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
        let len = closes.len();

        let mut middle = vec![None; len];
        let mut upper = vec![None; len];
        let mut lower = vec![None; len];

        for i in (self.period - 1)..len {
            let slice = &closes[i + 1 - self.period..=i];
            let mean: f64 = slice.iter().sum::<f64>() / self.period as f64;
            let variance: f64 = slice.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / self.period as f64;
            let std = variance.sqrt();
            middle[i] = Some(mean);
            upper[i] = Some(mean + self.stddev * std);
            lower[i] = Some(mean - self.stddev * std);
        }

        IndicatorOutput {
            plots: vec![
                Plot::Band {
                    id: "bb".into(), label_upper: format!("Upper ({})", self.period), label_lower: format!("Lower ({})", self.period),
                    color: self.color.clone(), upper, lower, fill_color: format!("{}33", &self.color),
                },
                Plot::Line {
                    id: format!("bb_middle_{}", self.period), label: format!("BB Middle ({})", self.period),
                    color: self.color.clone(), values: middle,
                },
            ],
        }
    }
}
