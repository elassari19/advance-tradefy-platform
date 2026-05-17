use crate::models::{OrderRequest, TradeSide, WebhookConfig, WebhookLog};
use chrono::Utc;
use serde::Serialize;
use std::sync::Mutex;

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

pub struct WebhookLogger {
    pub logs: Mutex<Vec<WebhookLog>>,
}

impl WebhookLogger {
    pub fn new() -> Self {
        Self {
            logs: Mutex::new(Vec::new()),
        }
    }

    pub fn log_delivery(&self, log: WebhookLog) {
        if let Ok(mut logs) = self.logs.lock() {
            logs.push(log);
            if logs.len() > 1000 {
                logs.remove(0);
            }
        }
    }

    pub fn get_logs(&self) -> Vec<WebhookLog> {
        self.logs.lock().map(|guard| guard.clone()).unwrap_or_default()
    }
}

fn render_template(template: &str, payload: &WebhookPayload) -> String {
    let mut result = template.to_string();
    result = result.replace("{{event_type}}", &payload.event_type);
    result = result.replace("{{timestamp}}", &payload.timestamp);
    result = result.replace("{{secret}}", &payload.security_token);
    result = result.replace("{{symbol}}", &payload.trade.symbol);
    result = result.replace("{{action}}", &payload.trade.action);
    result = result.replace("{{price}}", &payload.trade.price.to_string());
    result = result.replace("{{quantity}}", &payload.trade.quantity.to_string());

    let trade_json = serde_json::json!({
        "symbol": payload.trade.symbol,
        "action": payload.trade.action,
        "price": payload.trade.price,
        "quantity": payload.trade.quantity,
        "take_profit": payload.trade.take_profit,
        "stop_loss": payload.trade.stop_loss,
    });
    result = result.replace("{{trade}}", &trade_json.to_string());

    result
}

pub async fn dispatch_webhook(
    url: String,
    secret_token: String,
    request: OrderRequest,
    price: f64,
) {
    let config = WebhookConfig {
        id: String::new(),
        name: String::new(),
        url,
        secret_token,
        enabled: true,
        template: String::new(),
        retry_count: 3,
        timeout_ms: 5000,
        exchange: "binance".to_string(),
    };
    dispatch_webhook_with_config(&config, &request, price).await;
}

pub async fn dispatch_webhook_with_config(
    config: &WebhookConfig,
    request: &OrderRequest,
    price: f64,
) -> WebhookDeliveryResult {
    let payload = WebhookPayload {
        event_type: "strategy_signal".to_string(),
        timestamp: Utc::now().to_rfc3339(),
        trade: TradeDetails {
            symbol: request.symbol.clone(),
            action: match request.side {
                TradeSide::Buy => "BUY".to_string(),
                TradeSide::Sell => "SELL".to_string(),
            },
            price,
            quantity: request.quantity,
            take_profit: request.take_profit,
            stop_loss: request.stop_loss,
        },
        security_token: config.secret_token.clone(),
    };

    let body = if config.template.is_empty() {
        serde_json::to_string(&payload).unwrap_or_default()
    } else {
        render_template(&config.template, &payload)
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(config.timeout_ms))
        .build()
        .unwrap_or_default();

    let retries = config.retry_count.max(1);

    for attempt in 0..retries {
        if attempt > 0 {
            let delay = std::time::Duration::from_millis(1000 * 2u64.pow(attempt as u32 - 1));
            tokio::time::sleep(delay).await;
        }

        let json_body: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();

        match client
            .post(&config.url)
            .json(&json_body)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status().as_u16() as i32;
                if status >= 200 && status < 300 {
                    let response_body = response.text().await.unwrap_or_default();
                    return WebhookDeliveryResult::Success(WebhookDeliveryInfo {
                        status,
                        body: response_body,
                        error: None,
                    });
                } else {
                    let response_body = response.text().await.unwrap_or_default();
                    if attempt == retries - 1 {
                        return WebhookDeliveryResult::Failed(WebhookDeliveryInfo {
                            status,
                            body: response_body.clone(),
                            error: Some(format!("HTTP {}", status)),
                        });
                    }
                }
            }
            Err(e) => {
                if attempt == retries - 1 {
                    return WebhookDeliveryResult::Failed(WebhookDeliveryInfo {
                        status: 0,
                        body: String::new(),
                        error: Some(e.to_string()),
                    });
                }
            }
        }
    }

    WebhookDeliveryResult::Failed(WebhookDeliveryInfo {
        status: 0,
        body: String::new(),
        error: Some("Max retries exceeded".to_string()),
    })
}

#[allow(dead_code)]
pub struct WebhookDeliveryInfo {
    pub status: i32,
    pub body: String,
    pub error: Option<String>,
}

pub enum WebhookDeliveryResult {
    Success(WebhookDeliveryInfo),
    Failed(WebhookDeliveryInfo),
}
