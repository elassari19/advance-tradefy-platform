use crate::models::{AIChatRequest, AIMessage, AIResult, ChatMessageRecord};
use reqwest::Client;
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::error;

const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const GOOGLE_API_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

pub struct AIClient {
    http: Client,
    openrouter_key: String,
    google_key: String,
}

impl Clone for AIClient {
    fn clone(&self) -> Self {
        Self {
            http: self.http.clone(),
            openrouter_key: self.openrouter_key.clone(),
            google_key: self.google_key.clone(),
        }
    }
}

impl AIClient {
    pub fn new(openrouter_key: String, google_key: String) -> Self {
        Self {
            http: Client::new(),
            openrouter_key,
            google_key,
        }
    }

    pub async fn chat(
        &self,
        request: AIChatRequest,
        _session_id: String,
        sender: mpsc::Sender<String>,
    ) -> Result<Vec<AIResult>, String> {
        let system_prompt = build_system_prompt(
            request.symbol.as_deref().unwrap_or("BTC/USDT"),
            request.timeframe.as_deref().unwrap_or("5m"),
        );

        let mut messages_with_system = vec![AIMessage {
            role: "system".to_string(),
            content: system_prompt,
        }];
        messages_with_system.extend(request.messages.clone());

        let mut results: Vec<AIResult> = Vec::new();
        let models: Vec<String> = request.models.clone();

        for model in models.iter() {
            let result = AIResult::new(model.clone());
            results.push(result);
        }

        let mut handles = Vec::new();

for (idx, model) in models.iter().enumerate() {
            let tab_idx = idx;
            let model_str = model.clone();
            let messages = messages_with_system.clone();
            let sender_clone = sender.clone();

            let openrouter_key = self.openrouter_key.clone();
            let google_key = self.google_key.clone();

            let handle = tokio::spawn(async move {
                let call_result = if model_str.starts_with("google/") || model_str.starts_with("gemini") {
                    let model_id = model_str
                        .trim_start_matches("google/")
                        .trim_start_matches("gemini/");
                    call_google_gemini(
                        &google_key,
                        &format!("models/{}", model_id),
                        tab_idx,
                        &sender_clone,
                    )
                    .await
                } else {
                    call_openrouter(&openrouter_key, &model_str, tab_idx, &sender_clone, &messages)
                        .await
                };

                if let Err(e) = call_result {
                    error!("Model {} call failed: {}", model_str, e);
                    let _ = sender_clone.send(format!(
                        "{{\"tab_index\": {}, \"error\": \"{}\"}}\n",
                        tab_idx, e
                    ))
                    .await;
                }
            });

            handles.push(handle);
        }

        for handle in handles {
            let _ = handle.await;
        }

        for result in &mut results {
            result.finish();
        }

        Ok(results)
    }
}

fn build_system_prompt(symbol: &str, timeframe: &str) -> String {
    format!(
        r#"You are a Python Trading Strategy Expert for Tradefy terminal.

CONTEXT:
- Current Chart: {} on {} timeframe
- Trading Pair: {}
- Available Functions: buy(qty, tp=None, sl=None), sell(qty, tp=None, sl=None)
- Price Data: def on_tick(price, candles) where candles is a list of float prices (oldest first, newest last)

RULES:
1. Return ONLY executable Python code in a markdown block (```python ... ```).
2. Strategy signature: def on_tick(price, candles) -> None
3. Use buy(qty, tp, sl) / sell(qty, tp, sl) to signal entries with optional take profit and stop loss.
4. Add inline comments explaining logic.
5. No prose outside code blocks unless explicitly asked.
6. Include proper error handling.
7. Implement indicators from scratch (no TA-Lib).

Breakout / Zone Detection Strategy Pattern:
- Prices are in the `candles` list (oldest first). The current tick is `price`.
- To detect a consolidation zone, check the last N candles (e.g., last 5-10).
- A zone exists when candle bodies (|open - close|) are small — approximate using the range.
- Compute zone_high = max(recent_candles), zone_low = min(recent_candles).
- If zone_high - zone_low is small (e.g., < 0.5% of price), it's a tight range.
- When price breaks above zone_high → buy with stop loss below zone_low.
- When price breaks below zone_low → sell with stop loss above zone_high.
- Once in a position, avoid re-entering until exit.

Example Breakout Strategy:
```python
def on_tick(price, candles):
    zone_period = 8
    if len(candles) < zone_period + 1:
        return

    recent = candles[-(zone_period + 1):-1]
    zone_high = max(recent)
    zone_low = min(recent)
    zone_range = zone_high - zone_low
    avg_price = sum(recent) / len(recent)

    # Zone must be tight (less than 0.3% of price)
    if zone_range > avg_price * 0.003:
        return

    if price > zone_high:
        buy(0.1, sl=zone_low)
    elif price < zone_low:
        sell(0.1, sl=zone_high)
```
"#,
        symbol.replace("/", ""),
        timeframe,
        symbol.replace("/", "")
    )
}

async fn call_openrouter(
    api_key: &str,
    model: &str,
    tab_index: usize,
    sender: &mpsc::Sender<String>,
    messages: &[AIMessage],
) -> Result<(), String> {
    let client = Client::new();
    
    let request = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true
    });

    let response = client
        .post(OPENROUTER_API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://tradefy.local")
        .header("X-OpenRouter-Title", "Tradefy Terminal")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error: {} - {}", status, error_text));
    }

    let bytes = response.bytes().await.map_err(|e| format!("Read error: {}", e))?;
    let text = String::from_utf8_lossy(&bytes);

    let mut accumulated = String::new();
    
    for line in text.lines() {
        if line.starts_with("data: ") {
            let data_str = &line[6..];
            if data_str == "[DONE]" {
                continue;
            }

            if let Ok(data) = serde_json::from_str::<Value>(data_str) {
                if let Some(choices) = data.get("choices").and_then(|c| c.as_array()) {
                    for choice in choices {
                        if let Some(delta) = choice.get("delta").and_then(|d| d.get("content")) {
                            if let Some(text) = delta.as_str() {
                                accumulated.push_str(text);
                                let response_json = serde_json::json!({
                                    "tab_index": tab_index,
                                    "delta": text
                                });
                                let _ = sender.send(format!(
                                    "{}\n",
                                    serde_json::to_string(&response_json).unwrap_or_default()
                                ))
                                .await;
                            }
                        }
                    }
                }
            }
        }
    }

    let (has_code, extracted_code) = extract_code_blocks(&accumulated);
    let final_event = serde_json::json!({
        "tab_index": tab_index,
        "model": model,
        "content": accumulated,
        "has_code": has_code,
        "extracted_code": extracted_code,
        "is_done": true,
    });
    let _ = sender.send(format!("{}\n", serde_json::to_string(&final_event).unwrap_or_default())).await;

    Ok(())
}

async fn call_google_gemini(
    api_key: &str,
    model: &str,
    tab_index: usize,
    sender: &mpsc::Sender<String>,
) -> Result<(), String> {
    let url = format!(
        "{}/{}{}",
        GOOGLE_API_URL,
        model,
        format!("?key={}", api_key)
    );

    let payload = serde_json::json!({
        "contents": [
            {"role": "user", "parts": [{"text": "Hello"}]}
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192,
        }
    });

    let response = Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {} - {}", status, error_text));
    }

    let json: Value = response.json().await.map_err(|e| format!("Parse error: {}", e))?;

    if let Some(text) = json.get("candidates")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .and_then(|parts| parts.first())
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
    {
        let (has_code, extracted_code) = extract_code_blocks(text);
        
        let response_json = serde_json::json!({
            "tab_index": tab_index,
            "model": model.trim_start_matches("models/"),
            "content": text,
            "has_code": has_code,
            "extracted_code": extracted_code,
            "is_done": true
        });

        let _ = sender.send(format!("{}\n", serde_json::to_string(&response_json).unwrap_or_default())).await;
    }

    Ok(())
}

fn extract_code_blocks(content: &str) -> (bool, Option<String>) {
    let code_re = regex::Regex::new(r"```python\n(.*?)```").unwrap();
    
    let has_code = code_re.is_match(content);
    let extracted = code_re
        .captures(content)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().trim().to_string());

    (has_code, extracted)
}

#[allow(dead_code)]
pub async fn save_message(
    record: &ChatMessageRecord,
    pool: &sqlx::PgPool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO chat_messages (session_id, role, model, content, has_code, extracted_code)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(&record.session_id)
    .bind(&record.role)
    .bind(&record.model)
    .bind(&record.content)
    .bind(record.has_code)
    .bind(&record.extracted_code)
    .execute(pool)
    .await?;
    Ok(())
}

#[allow(dead_code)]
pub fn extract_all_code_blocks(content: &str) -> Vec<String> {
    let code_re = regex::Regex::new(r"```python\n(.*?)```").unwrap();
    code_re
        .captures_iter(content)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().trim().to_string()))
        .collect()
}