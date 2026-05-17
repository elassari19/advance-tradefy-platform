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

#[cfg(test)]
mod tests {
    use super::*;

    fn candles(values: &[f64]) -> Vec<Candle> {
        values.iter().map(|&c| Candle {
            time: 0, open: c, high: c * 1.01, low: c * 0.99, close: c,
            volume: 1000.0, symbol: "X".into(), is_closed: true,
        }).collect()
    }

    #[test]
    fn test_sma_values() {
        let candles = candles(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]);
        let params = serde_json::json!({ "period": 3 });
        let sma = SMA::new(&params, "#f00");
        let out = sma.calculate(&candles);
        assert_eq!(out.plots.len(), 1);
        if let Plot::Line { values, .. } = &out.plots[0] {
            assert!(values[0].is_none());
            assert!(values[1].is_none());
            assert_eq!(values[2], Some(2.0));
            assert_eq!(values[9], Some(9.0));
        } else {
            panic!("expected line");
        }
    }

    #[test]
    fn test_sma_insufficient_history() {
        let candles = candles(&[1.0, 2.0]);
        let params = serde_json::json!({ "period": 5 });
        let sma = SMA::new(&params, "#f00");
        let out = sma.calculate(&candles);
        if let Plot::Line { values, .. } = &out.plots[0] {
            assert!(values.iter().all(|v| v.is_none()));
        }
    }

    #[test]
    fn test_sma_empty_candles() {
        let params = serde_json::json!({ "period": 5 });
        let sma = SMA::new(&params, "#f00");
        let out = sma.calculate(&[]);
        if let Plot::Line { values, .. } = &out.plots[0] {
            assert!(values.is_empty());
        }
    }

    #[test]
    fn test_sma_period_at_least_one() {
        let params = serde_json::json!({ "period": 0 });
        let sma = SMA::new(&params, "#f00");
        assert_eq!(sma.period, 1);
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
        if !crate::indicators::ensure_minimum(candles, self.period) {
            return IndicatorOutput {
                plots: vec![Plot::Line {
                    id: format!("sma_{}", self.period),
                    label: format!("SMA({})", self.period),
                    color: self.color.clone(),
                    values,
                }],
            };
        }
        for i in (self.period - 1)..closes.len() {
            let sum: f64 = closes[i + 1 - self.period..=i].iter().sum();
            values[i] = Some(crate::indicators::guarded(crate::indicators::safe_div(sum, self.period as f64)));
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
