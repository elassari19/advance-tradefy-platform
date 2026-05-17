pub mod sma;
pub mod ema;
pub mod rsi;
pub mod macd;
pub mod bollinger;
pub mod atr;
pub mod stochastic;
pub mod vwap;

use crate::candle_aggregator::CandleAggregator;
use crate::models::Candle;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Pane {
    Overlay,
    Sub,
    Auto,
}

impl Default for Pane {
    fn default() -> Self { Pane::Auto }
}

pub struct IndicatorPipeline {
    pub entries: Vec<PipelineEntry>,
}

pub struct PipelineEntry {
    pub indicator: Box<dyn Indicator>,
    pub pane: Pane,
    pub color: String,
}

impl IndicatorPipeline {
    pub fn new() -> Self {
        Self { entries: Vec::new() }
    }

    pub fn add(&mut self, indicator: Box<dyn Indicator>, pane: Pane, color: String) {
        self.entries.push(PipelineEntry { indicator, pane, color });
    }

    pub fn evaluate_all(&self, candles: &[Candle]) -> Vec<PipelineOutput> {
        self.entries.iter().map(|entry| {
            let output = entry.indicator.calculate(candles);
            let pane = match entry.pane {
                Pane::Auto => auto_detect_pane(entry.indicator.name()),
                other => other,
            };
            PipelineOutput { output, pane }
        }).collect()
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct PipelineOutput {
    pub output: IndicatorOutput,
    pub pane: Pane,
}

fn auto_detect_pane(name: &str) -> Pane {
    match name {
        "RSI" | "MACD" | "Stochastic" => Pane::Sub,
        _ => Pane::Overlay,
    }
}

fn timeframe_minutes(timeframe: &str) -> Option<u32> {
    match timeframe {
        "1m" => Some(1), "5m" => Some(5), "15m" => Some(15),
        "30m" => Some(30), "1h" => Some(60), "4h" => Some(240),
        "1d" => Some(1440), "1w" => Some(10080),
        _ => timeframe.trim_end_matches('m').parse().ok(),
    }
}

pub fn resolve_mtf(
    symbol: &str,
    timeframe: &str,
    expression: &str,
    aggregators: &HashMap<(String, u32), CandleAggregator>,
) -> Option<f64> {
    let mins = timeframe_minutes(timeframe)?;
    let agg = aggregators.get(&(symbol.to_string(), mins))?;
    let candle = agg.get_current_candle()?;
    match expression {
        "open" => Some(candle.open),
        "high" => Some(candle.high),
        "low" => Some(candle.low),
        "close" => Some(candle.close),
        "volume" => Some(candle.volume),
        "hl2" => Some((candle.high + candle.low) / 2.0),
        "hlc3" | "typical" => Some((candle.high + candle.low + candle.close) / 3.0),
        "ohlc4" => Some((candle.open + candle.high + candle.low + candle.close) / 4.0),
        _ => None,
    }
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
    #[serde(default)]
    pub pane: Pane,
}

#[derive(Debug, Serialize)]
pub struct EvaluateBatchResponse {
    pub results: Vec<PipelineOutput>,
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
