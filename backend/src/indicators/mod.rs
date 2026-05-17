pub mod sma;
pub mod ema;
pub mod rsi;
pub mod macd;
pub mod bollinger;
pub mod atr;
pub mod stochastic;
pub mod vwap;

use crate::models::Candle;
use serde::{Deserialize, Serialize};

pub trait Indicator {
    fn name(&self) -> &str;
    fn calculate(&self, candles: &[Candle]) -> IndicatorOutput;
    fn params(&self) -> Vec<ParamDesc>;
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParamDesc {
    pub name: String,
    pub label: String,
    pub param_type: String,
    pub default: serde_json::Value,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndicatorOutput {
    pub plots: Vec<Plot>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum Plot {
    #[serde(rename = "line")]
    Line { id: String, label: String, color: String, values: Vec<Option<f64>> },
    #[serde(rename = "histogram")]
    Histogram { id: String, color: String, values: Vec<Option<f64>> },
    #[serde(rename = "hline")]
    Hline { price: f64, color: String, style: String },
    #[serde(rename = "band")]
    Band { id: String, label_upper: String, label_lower: String, color: String, upper: Vec<Option<f64>>, lower: Vec<Option<f64>>, fill_color: String },
}

#[derive(Debug, Deserialize)]
pub struct EvaluateBatchRequest {
    pub candles: Vec<Candle>,
    pub indicators: Vec<IndicatorRequest>,
}

#[derive(Debug, Deserialize)]
pub struct IndicatorRequest {
    #[serde(rename = "type")]
    pub indicator_type: String,
    pub params: serde_json::Value,
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EvaluateBatchResponse {
    pub results: Vec<IndicatorOutput>,
}

pub fn get_indicator(indicator_type: &str, params: &serde_json::Value, color: Option<&str>) -> Option<Box<dyn Indicator>> {
    let default_color = color.unwrap_or("#3b82f6").to_string();
    match indicator_type {
        "sma" => Some(Box::new(sma::SMA::new(params, &default_color))),
        "ema" => Some(Box::new(ema::EMA::new(params, &default_color))),
        "rsi" => Some(Box::new(rsi::RSI::new(params, &default_color))),
        "macd" => Some(Box::new(macd::MACD::new(params, &default_color))),
        "bollinger" => Some(Box::new(bollinger::Bollinger::new(params, &default_color))),
        "atr" => Some(Box::new(atr::ATR::new(params, &default_color))),
        "stochastic" => Some(Box::new(stochastic::Stochastic::new(params, &default_color))),
        "vwap" => Some(Box::new(vwap::VWAP::new(params, &default_color))),
        _ => None,
    }
}

pub fn list_available_indicators() -> Vec<serde_json::Value> {
    vec![
        sma::SMA::describe(),
        ema::EMA::describe(),
        rsi::RSI::describe(),
        macd::MACD::describe(),
        bollinger::Bollinger::describe(),
        atr::ATR::describe(),
        stochastic::Stochastic::describe(),
        vwap::VWAP::describe(),
    ]
}
