use serde::Serialize;
use crate::models::{OrderRequest, TradeSide};
use chrono::Utc;

#[derive(Serialize)]
pub struct WebhookPayload {
    pub event_type: String,
    pub timestamp: String,
    pub trade: TradeDetails,
    pub security_token: String,
}

#[derive(Serialize)]
pub struct TradeDetails {
    pub symbol: String,
    pub action: String,
    pub price: f64,
    pub quantity: f64,
    pub take_profit: Option<f64>,
    pub stop_loss: Option<f64>,
}

pub async fn dispatch_webhook(
    url: String,
    secret_token: String,
    request: OrderRequest,
    price: f64,
) {
    let payload = WebhookPayload {
        event_type: "strategy_signal".to_string(),
        timestamp: Utc::now().to_rfc3339(),
        trade: TradeDetails {
            symbol: request.symbol,
            action: match request.side {
                TradeSide::Buy => "BUY".to_string(),
                TradeSide::Sell => "SELL".to_string(),
            },
            price,
            quantity: request.quantity,
            take_profit: request.take_profit,
            stop_loss: request.stop_loss,
        },
        security_token: secret_token,
    };

    let client = reqwest::Client::new();
    match client.post(&url).json(&payload).send().await {
        Ok(_) => tracing::info!("Webhook dispatched successfully to {}", url),
        Err(e) => tracing::error!("Failed to dispatch webhook to {}: {}", url, e),
    }
}
