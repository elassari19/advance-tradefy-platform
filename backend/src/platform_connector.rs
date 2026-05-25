use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlatformConnection {
    pub id: String,
    pub platform_id: String,
    pub connection_name: String,
    pub api_key: String,
    pub secret_key: String,
    pub is_testnet: bool,
    pub status: String,
    pub last_tested_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestConnectionRequest {
    pub platform_id: String,
    pub api_key: String,
    pub secret_key: String,
    pub is_testnet: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestConnectionResponse {
    pub success: bool,
    pub balance: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub fn test_exchange_connection(req: &TestConnectionRequest) -> TestConnectionResponse {
    match req.platform_id.as_str() {
        "binance" => test_binance_connection(req),
        _ => TestConnectionResponse {
            success: false,
            balance: None,
            error: Some(format!("Exchange '{}' is not supported yet. Only Binance is supported via direct API.", req.platform_id)),
        },
    }
}

fn test_binance_connection(req: &TestConnectionRequest) -> TestConnectionResponse {
    let base_url = if req.is_testnet {
        "https://testnet.binance.vision"
    } else {
        "https://api.binance.com"
    };

    let url = format!("{}/api/v3/account", base_url);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let query = format!("timestamp={}", timestamp);
    let signature = hmac_sha256(&req.secret_key, &query);
    let full_url = format!("{}?{}&signature={}", url, query, signature);

    let client = reqwest::blocking::Client::new();
    match client
        .get(&full_url)
        .header("X-MBX-APIKEY", &req.api_key)
        .header("Content-Type", "application/json")
        .send()
    {
        Ok(resp) => {
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return TestConnectionResponse {
                    success: false,
                    balance: None,
                    error: Some(format!("Binance API error ({}): {}", status, body)),
                };
            }
            match resp.json::<serde_json::Value>() {
                Ok(account) => {
                    let balances = account.get("balances").cloned().unwrap_or(serde_json::Value::Null);
                    TestConnectionResponse {
                        success: true,
                        balance: Some(serde_json::json!({ "total": balances })),
                        error: None,
                    }
                }
                Err(e) => TestConnectionResponse {
                    success: false,
                    balance: None,
                    error: Some(format!("Failed to parse Binance response: {}", e)),
                },
            }
        }
        Err(e) => TestConnectionResponse {
            success: false,
            balance: None,
            error: Some(format!("Failed to connect to Binance: {}", e)),
        },
    }
}

fn hmac_sha256(secret: &str, data: &str) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .expect("HMAC key");
    mac.update(data.as_bytes());
    let result = mac.finalize();
    let code_bytes = result.into_bytes();
    hex::encode(code_bytes)
}
