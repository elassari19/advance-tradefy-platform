use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct EvaluateRequest {
    pub script: String,
    pub candles: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlotEntry {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub plot_type: String,
    pub color: String,
    pub values: Vec<Option<f64>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HlineEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub price: f64,
    pub color: String,
    pub style: String,
}

#[derive(Debug, Serialize)]
pub struct EvaluateResponse {
    pub values: Vec<IndicatorValue>,
    pub plots: Vec<PlotEntry>,
    pub hlines: Vec<HlineEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndicatorValue {
    pub time: u64,
    pub value: f64,
}

pub fn evaluate_indicator(_script: &str, _candles: &[serde_json::Value]) -> Result<EvaluateResponse, String> {
    Err("Custom indicator evaluation requires a JavaScript runtime. Python support has been removed. Use built-in indicators instead.".to_string())
}
