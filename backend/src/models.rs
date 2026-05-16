use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tick {
    pub symbol: String,
    pub price: f64,
    pub time: u64,
}

#[derive(Debug, Deserialize)]
pub struct BinanceTicker {
    #[serde(rename = "s")]
    pub symbol: String,
    #[serde(rename = "c")]
    pub price: String,
    #[serde(rename = "E")]
    pub time: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum TradeSide {
    Buy,
    Sell,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OrderRequest {
    pub symbol: String,
    pub side: TradeSide,
    pub quantity: f64,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Position {
    pub id: String,
    pub symbol: String,
    pub side: TradeSide,
    pub entry_price: f64,
    pub quantity: f64,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
    pub current_price: f64,
    pub pnl: f64,
    pub opened_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TradeHistory {
    pub id: String,
    pub symbol: String,
    pub side: TradeSide,
    pub entry_price: f64,
    pub exit_price: f64,
    pub quantity: f64,
    pub pnl: f64,
    pub opened_at: u64,
    pub closed_at: u64,
    pub exit_reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SimulatorState {
    pub balance: f64,
    pub equity: f64,
    pub open_positions: Vec<Position>,
    pub history: Vec<TradeHistory>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePositionRequest {
    pub id: String,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
}
#[derive(Debug, Deserialize)]
pub struct HistoryParams {
    pub symbol: String,
    pub interval: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct HistoricalCandle {
    pub time: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebhookConfig {
    pub id: String,
    pub name: String,
    pub url: String,
    pub secret_token: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct AIChatRequest {
    pub messages: Vec<AIMessage>,
    pub models: Vec<String>,
    pub symbol: Option<String>,
    pub timeframe: Option<String>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct AIStreamResponse {
    pub tab_index: usize,
    pub model: String,
    pub delta: String,
    pub is_done: bool,
    pub has_code: bool,
    pub extracted_code: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AIResult {
    pub model: String,
    pub content: String,
    pub has_code: bool,
    pub extracted_code: Option<String>,
    pub done: Arc<AtomicBool>,
}

impl AIResult {
    pub fn new(model: String) -> Self {
        Self {
            model,
            content: String::new(),
            has_code: false,
            extracted_code: None,
            done: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn finish(&self) {
        self.done.store(true, Ordering::Relaxed);
    }

    #[allow(dead_code)]
    pub fn is_done(&self) -> bool {
        self.done.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ChatMessageRecord {
    pub session_id: String,
    pub role: String,
    pub model: Option<String>,
    pub content: String,
    pub has_code: bool,
    pub extracted_code: Option<String>,
}