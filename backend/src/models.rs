use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum TestingMode {
    EveryTick,
    ControlPoints,
    OpenPricesOnly,
    ClosePricesOnly,
}

impl Default for TestingMode {
    fn default() -> Self {
        Self::EveryTick
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BacktestEvent {
    pub timestamp: u64,
    pub event_type: String,
    pub description: String,
    pub details: Option<serde_json::Value>,
}

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
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct HistoricalCandle {
    pub time: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Candle {
    pub time: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub symbol: String,
    pub is_closed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebhookConfig {
    pub id: String,
    pub name: String,
    pub url: String,
    pub secret_token: String,
    pub enabled: bool,
    #[serde(default = "default_template")]
    pub template: String,
    #[serde(default = "default_retry_count")]
    pub retry_count: u32,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default = "default_exchange")]
    pub exchange: String,
}

fn default_template() -> String {
    r#"{"event_type":"strategy_signal","timestamp":"{{timestamp}}","trade":{{trade}},"security_token":"{{secret}}"}"#.to_string()
}

fn default_retry_count() -> u32 { 3 }

fn default_timeout_ms() -> u64 { 5000 }

fn default_exchange() -> String { "binance".to_string() }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebhookLog {
    pub id: String,
    pub webhook_config_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub response_status: Option<i32>,
    pub response_body: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlertRule {
    pub id: String,
    pub name: String,
    pub symbol: String,
    pub timeframe: String,
    pub condition_type: String,
    pub condition_params: serde_json::Value,
    pub frequency: String,
    pub actions: Vec<AlertActionConfig>,
    pub enabled: bool,
    pub created_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlertActionConfig {
    #[serde(rename = "type")]
    pub action_type: String,
    pub webhook_config_id: Option<String>,
    pub url: Option<String>,
    pub email: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggeredAlert {
    pub rule_id: String,
    pub rule_name: String,
    pub symbol: String,
    pub condition_type: String,
    pub message: String,
    pub timestamp: u64,
    pub candle: Option<Candle>,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BacktestRequest {
    pub strategy_code: String,
    pub symbol: String,
    pub timeframe: String,
    pub start_time: u64,
    pub end_time: u64,
    pub initial_balance: f64,
    pub commission: f64,
    pub slippage: f64,
    #[serde(default = "default_speed")]
    pub speed: u32,
    #[serde(default)]
    pub testing_mode: TestingMode,
    #[serde(default)]
    pub visual: bool,
}

fn default_speed() -> u32 { 1 }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BacktestProgress {
    pub progress: f64,
    pub trades: Vec<BacktestTrade>,
    pub equity_curve: Vec<EquityPoint>,
    pub events: Vec<BacktestEvent>,
    pub current_candle: Option<Candle>,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<BacktestResultSummary>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BacktestTrade {
    pub id: String,
    pub side: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub quantity: f64,
    pub pnl: f64,
    pub pnl_pct: f64,
    pub opened_at: u64,
    pub closed_at: u64,
    pub exit_reason: String,
    pub holding_bars: u64,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EquityPoint {
    pub bar_index: u32,
    pub time: u64,
    pub equity: f64,
    pub balance: f64,
    pub drawdown: f64,
    pub drawdown_pct: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BacktestResultSummary {
    pub initial_balance: f64,
    pub final_balance: f64,
    pub net_profit: f64,
    pub net_profit_pct: f64,
    pub total_trades: u32,
    pub winning_trades: u32,
    pub losing_trades: u32,
    pub win_rate: f64,
    pub max_drawdown: f64,
    pub max_drawdown_pct: f64,
    pub sharpe_ratio: f64,
    pub sortino_ratio: f64,
    pub calmar_ratio: f64,
    pub profit_factor: f64,
    pub recovery_factor: f64,
    pub expected_payoff: f64,
    pub avg_win: f64,
    pub avg_loss: f64,
    pub largest_win: f64,
    pub largest_loss: f64,
    pub avg_holding_bars: f64,
    pub gross_profit: f64,
    pub gross_loss: f64,
    pub max_consecutive_wins: u32,
    pub max_consecutive_losses: u32,
    pub max_drawdown_duration: u64,
    pub avg_trade_duration: f64,
    pub return_on_account: f64,
    pub long_trades: u32,
    pub short_trades: u32,
    pub winning_long_pct: f64,
    pub winning_short_pct: f64,
    pub modeling_quality: f64,
    pub bars_in_test: u32,
    pub ticks_processed: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BacktestResult {
    pub summary: BacktestResultSummary,
    pub trades: Vec<BacktestTrade>,
    pub equity_curve: Vec<EquityPoint>,
    pub events: Vec<BacktestEvent>,
    pub request: BacktestRequest,
}

#[derive(Debug, Deserialize)]
pub struct PrepareDataRequest {
    pub symbol: String,
    pub timeframe: String,
    pub testing_mode: TestingMode,
    pub start_time: u64,
    pub end_time: u64,
}

#[derive(Debug, Serialize)]
pub struct PrepareDataResponse {
    pub status: String,
    pub total_candles: u32,
    pub total_ticks: u64,
    pub start_time: u64,
    pub end_time: u64,
    pub modeling_quality: f64,
}

pub enum PreparedData {
    Candles(Vec<Candle>),
    Ticks(Vec<Tick>),
}

impl PreparedData {
    pub fn count(&self) -> usize {
        match self {
            PreparedData::Candles(c) => c.len(),
            PreparedData::Ticks(t) => t.len(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParameterRange {
    pub name: String,
    pub min: f64,
    pub max: f64,
    pub step: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OptimizeRequest {
    pub strategy_code: String,
    pub symbol: String,
    pub timeframe: String,
    pub start_time: u64,
    pub end_time: u64,
    pub initial_balance: f64,
    pub commission: f64,
    pub slippage: f64,
    pub ranges: Vec<ParameterRange>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OptimizationResult {
    pub params: std::collections::HashMap<String, f64>,
    pub summary: BacktestResultSummary,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedStrategy {
    pub id: String,
    pub name: String,
    pub symbol: String,
    pub timeframe: String,
    pub code: String,
    pub created_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedStrategyState {
    pub id: String,
    pub symbol: String,
    pub code: String,
    pub state_type: String,
    pub updated_at: u64,
}