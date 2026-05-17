use crate::models::{AlertActionConfig, TriggeredAlert};
use std::sync::Mutex;

#[derive(Clone)]
pub struct EmailConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String,
    pub from_address: String,
}

pub struct EmailSender {
    config: Mutex<Option<EmailConfig>>,
}

impl EmailSender {
    pub fn new() -> Self {
        Self { config: Mutex::new(None) }
    }

    pub fn configure(&self, config: EmailConfig) {
        if let Ok(mut c) = self.config.lock() {
            *c = Some(config);
        }
    }

    pub fn is_configured(&self) -> bool {
        self.config.lock().ok().and_then(|c| c.as_ref().cloned()).is_some()
    }

    pub async fn send_alert(&self, alert: &TriggeredAlert, action: &AlertActionConfig) -> Result<String, String> {
        let config = self.config.lock().map_err(|_| "Lock error".to_string())?
            .clone().ok_or_else(|| "Email not configured".to_string())?;

        let email_addr = action.email.as_ref()
            .ok_or_else(|| "No email recipient configured".to_string())?;

        let subject = format!("[Tradefy Alert] {} - {}", alert.symbol, alert.rule_name);
        let body = format!(
            "Alert: {}\nSymbol: {}\nCondition: {}\nTime: {}\nPrice: {}",
            alert.rule_name,
            alert.symbol,
            alert.condition_type,
            alert.timestamp,
            alert.candle.as_ref().map(|c| c.close.to_string()).unwrap_or_else(|| "N/A".to_string()),
        );

        let client = reqwest::Client::new();
        let payload = serde_json::json!({
            "to": email_addr,
            "from": config.from_address,
            "subject": subject,
            "body": body,
        });

        let resp = client
            .post(&format!("{}:{}", config.smtp_host, config.smtp_port))
            .json(&payload)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Failed to send email: {}", e))?;

        let status = resp.status();
        if status.is_success() {
            Ok(format!("Email sent to {}", email_addr))
        } else {
            Err(format!("Email send failed with status {}", status))
        }
    }
}
