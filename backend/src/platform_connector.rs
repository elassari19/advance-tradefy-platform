use pyo3::{prelude::*, types::PyDict};
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
    Python::with_gil(|py| {
        let result = test_connection_inner(py, req);
        match result {
            Ok(balance) => TestConnectionResponse {
                success: true,
                balance: Some(balance),
                error: None,
            },
            Err(e) => TestConnectionResponse {
                success: false,
                balance: None,
                error: Some(e),
            },
        }
    })
}

fn test_connection_inner(py: Python<'_>, req: &TestConnectionRequest) -> Result<serde_json::Value, String> {
    let ccxt = py.import("ccxt").map_err(|e| format!("Failed to import ccxt: {}", e))?;
    let exchange_class = ccxt
        .getattr(req.platform_id.as_str())
        .map_err(|_| format!("Unknown exchange platform: {}", req.platform_id))?;

    let kwargs = PyDict::new(py);
    kwargs
        .set_item("apiKey", req.api_key.as_str())
        .map_err(|e| format!("Failed to set apiKey: {}", e))?;
    kwargs
        .set_item("secret", req.secret_key.as_str())
        .map_err(|e| format!("Failed to set secret: {}", e))?;

    if req.is_testnet {
        kwargs
            .set_item("sandbox", true)
            .map_err(|e| format!("Failed to set sandbox: {}", e))?;
    }

    let exchange = exchange_class
        .call((), Some(kwargs))
        .map_err(|e| format!("Failed to create exchange instance: {}", e))?;

    let balance = exchange
        .call_method0("fetch_balance")
        .map_err(|e| format!("Failed to fetch balance: {}", e))?;

    let total = balance
        .get_item("total")
        .map_err(|e| format!("Failed to extract total balance: {}", e))?;

    let json_str = format!("{}", total);
    serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse balance: {}", e))
}
