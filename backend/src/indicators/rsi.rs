use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

pub struct RSI {
    period: usize,
    color: String,
}

impl RSI {
    pub fn new(params: &serde_json::Value, color: &str) -> Self {
        let period = params.get("period")
            .and_then(|v| v.as_u64())
            .unwrap_or(14) as usize;
        Self { period: period.max(1), color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "rsi",
            "name": "Relative Strength Index",
            "category": "oscillator",
            "params": [
                { "name": "period", "label": "Period", "type": "int", "default": 14, "min": 1, "max": 200 }
            ]
        })
    }
}

impl Indicator for RSI {
    fn name(&self) -> &str { "RSI" }
    fn params(&self) -> Vec<ParamDesc> {
        vec![ParamDesc {
            name: "period".into(), label: "Period".into(), param_type: "int".into(),
            default: serde_json::json!(self.period), min: Some(1.0), max: Some(200.0),
        }]
    }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
        let len = closes.len();
        let mut values = vec![None; len];

        if !crate::indicators::ensure_minimum(candles, self.period + 1) {
            return IndicatorOutput {
                plots: vec![Plot::Line {
                    id: format!("rsi_{}", self.period), label: format!("RSI({})", self.period),
                    color: self.color.clone(), values,
                }],
            };
        }

        let mut gains = Vec::with_capacity(len - 1);
        let mut losses = Vec::with_capacity(len - 1);
        for i in 1..len {
            let diff = closes[i] - closes[i - 1];
            gains.push(if diff > 0.0 { diff } else { 0.0 });
            losses.push(if diff < 0.0 { -diff } else { 0.0 });
        }

        let mut avg_gain: f64 = crate::indicators::safe_div(gains[..self.period].iter().sum::<f64>(), self.period as f64);
        let mut avg_loss: f64 = crate::indicators::safe_div(losses[..self.period].iter().sum::<f64>(), self.period as f64);

        if avg_loss == 0.0 {
            values[self.period] = Some(100.0);
        } else {
            let rs = crate::indicators::safe_div(avg_gain, avg_loss);
            values[self.period] = Some(crate::indicators::guarded(100.0 - crate::indicators::safe_div(100.0, 1.0 + rs)));
        }

        for i in (self.period + 1)..len {
            avg_gain = crate::indicators::safe_div(avg_gain * (self.period as f64 - 1.0) + gains[i - 1], self.period as f64);
            avg_loss = crate::indicators::safe_div(avg_loss * (self.period as f64 - 1.0) + losses[i - 1], self.period as f64);
            if avg_loss == 0.0 {
                values[i] = Some(100.0);
            } else {
                let rs = crate::indicators::safe_div(avg_gain, avg_loss);
                values[i] = Some(crate::indicators::guarded(100.0 - crate::indicators::safe_div(100.0, 1.0 + rs)));
            }
        }

        IndicatorOutput {
            plots: vec![
                Plot::Line {
                    id: format!("rsi_{}", self.period), label: format!("RSI({})", self.period),
                    color: self.color.clone(), values,
                },
                Plot::Hline { price: 70.0, color: "#ef4444".into(), style: "dashed".into() },
                Plot::Hline { price: 30.0, color: "#22c55e".into(), style: "dashed".into() },
                Plot::Hline { price: 50.0, color: "#6b7280".into(), style: "dotted".into() },
            ],
        }
    }
}
