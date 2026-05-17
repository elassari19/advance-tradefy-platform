use crate::models::Candle;
use crate::indicators::{Indicator, IndicatorOutput, Plot, ParamDesc};

pub struct VWAP {
    color: String,
}

impl VWAP {
    pub fn new(_params: &serde_json::Value, color: &str) -> Self {
        Self { color: color.to_string() }
    }

    pub fn describe() -> serde_json::Value {
        serde_json::json!({
            "type": "vwap",
            "name": "Volume-Weighted Average Price",
            "category": "volume",
            "params": []
        })
    }
}

impl Indicator for VWAP {
    fn name(&self) -> &str { "VWAP" }
    fn params(&self) -> Vec<ParamDesc> { vec![] }
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput {
        let mut values = vec![None; candles.len()];
        let mut cum_pv = 0.0;
        let mut cum_vol = 0.0;

        for (i, candle) in candles.iter().enumerate() {
            let typical_price = (candle.high + candle.low + candle.close) / 3.0;
            cum_pv += typical_price * candle.volume;
            cum_vol += candle.volume;
            if cum_vol > 0.0 {
                values[i] = Some(cum_pv / cum_vol);
            }
        }

        IndicatorOutput {
            plots: vec![Plot::Line {
                id: "vwap".into(), label: "VWAP".into(),
                color: self.color.clone(), values,
            }],
        }
    }
}
