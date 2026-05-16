mod ai;
mod models;
mod python_runtime;
mod simulator;
mod strategy;
mod webhooks;

use ai::AIClient;
use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use models::{AIChatRequest, BinanceTicker, HistoryParams, OrderRequest, SimulatorState, Tick, UpdatePositionRequest, WebhookConfig, HistoricalCandle};
use simulator::SimulatorEngine;
use strategy::StrategyEngine;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, mpsc};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};



struct AppState {
    tx: broadcast::Sender<Tick>,
    simulator: Arc<SimulatorEngine>,
    strategy: StrategyEngine,
    last_tick: Mutex<Option<Tick>>,
    webhook_configs: Mutex<Vec<WebhookConfig>>,
    ai_client: AIClient,
}

#[tokio::main]
async fn main() {
    // Load .env file from current directory
    let env_path = std::env::current_dir()
        .map(|p| p.join(".env"))
        .unwrap_or_default();
    
    if env_path.exists() {
        dotenvy::from_path(&env_path).ok();
        tracing::info!("Loaded .env from {:?}", env_path);
    } else {
        dotenvy::dotenv().ok();
    }

    // Initialize tracing with filtering
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            tracing_subscriber::EnvFilter::new("info")
        })
        .add_directive("tokio_tungstenite=warn".parse().unwrap())
        .add_directive("tungstenite=warn".parse().unwrap());

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    // Set up broadcast channel
    let (tx, _rx) = broadcast::channel(100);
    let simulator = Arc::new(SimulatorEngine::new(10000.0)); // Initial $10k balance
    let strategy = StrategyEngine::new(simulator.clone());
    
    // Initialize AI client
    let openrouter_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| "NOT_FOUND".to_string());
    let google_key = std::env::var("AI_API_KEY").unwrap_or_else(|_| "NOT_FOUND".to_string());
    
    tracing::info!("OpenRouter key: {}", if openrouter_key.len() > 20 { "SET ({} chars)".to_string() } else { openrouter_key.clone() });
    tracing::info!("Google key: {}", if google_key.len() > 20 { "SET ({} chars)".to_string() } else { google_key.clone() });
    let ai_client = AIClient::new(openrouter_key, google_key);
    
    let app_state = Arc::new(AppState { 
        tx: tx.clone(),
        simulator,
        strategy,
        last_tick: Mutex::new(None),
        webhook_configs: Mutex::new(Vec::new()),
        ai_client,
    });

    // Spawn Binance stream task
    let state_clone = app_state.clone();
    tokio::spawn(async move {
        start_binance_stream(state_clone).await;
    });

    // CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build our application
    let app = Router::new()
        .route("/", get(|| async { "Tradefy Backend is Live" }))
        .route("/health", get(|| async { "OK" }))
        .route("/ws/live", get(ws_handler))
        .route("/api/order", post(place_order))
        .route("/api/position/update", post(update_position))
        .route("/api/position/close", post(close_position))
        .route("/api/state", get(get_simulator_state))
        .route("/api/strategy/deploy", post(deploy_strategy))
        .route("/api/webhooks", get(get_webhooks).post(update_webhooks))
        .route("/api/history", get(get_history))
        .route("/api/ai/chat", post(ai_chat))
        .layer(cors)
        .with_state(app_state);

    // Run it
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn start_binance_stream(state: Arc<AppState>) {
    let url = "wss://stream.binance.com:9443/ws/btcusdt@ticker";
    loop {
        tracing::info!("Connecting to Binance stream: {}", url);
        match tokio_tungstenite::connect_async(url).await {
            Ok((mut ws_stream, _)) => {
                tracing::info!("Connected to Binance");
                while let Some(msg) = ws_stream.next().await {
                    match msg {
                        Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                            if let Ok(binance_tick) = serde_json::from_str::<BinanceTicker>(&text) {
                                let tick = Tick {
                                    symbol: binance_tick.symbol,
                                    price: binance_tick.price.parse().unwrap_or(0.0),
                                    time: binance_tick.time,
                                };
                                
                                // Update last tick
                                if let Ok(mut last) = state.last_tick.lock() {
                                    *last = Some(tick.clone());
                                }

                                // Process tick in simulator
                                state.simulator.process_tick(&tick);

                                // Process tick in strategy engine
                                let webhook_configs = {
                                    let c = state.webhook_configs.lock().unwrap();
                                    c.clone()
                                };
                                state.strategy.on_tick(tick.clone(), webhook_configs);
                                
                                // Broadcast to frontend
                                let _ = state.tx.send(tick);
                            }
                        }
                        Ok(tokio_tungstenite::tungstenite::Message::Ping(p)) => {
                             let _ = ws_stream.send(tokio_tungstenite::tungstenite::Message::Pong(p)).await;
                        }
                        Err(e) => {
                            tracing::error!("WebSocket stream error: {}", e);
                            break;
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                tracing::error!("Binance connection error: {}. Retrying in 5s...", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            }
        }
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    tracing::info!("New frontend WebSocket connection");
    let mut rx = state.tx.subscribe();

    while let Ok(tick) = rx.recv().await {
        let msg = serde_json::to_string(&tick).unwrap();
        if socket.send(Message::Text(msg)).await.is_err() {
            break;
        }
    }
    tracing::info!("Frontend WebSocket connection closed");
}

async fn place_order(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OrderRequest>,
) -> impl IntoResponse {
    let tick = {
        let last = state.last_tick.lock().unwrap();
        last.clone()
    };

    if let Some(tick) = tick {
        let res = state.simulator.place_order(payload.clone(), tick.price, tick.time);
        
        if let Ok(id) = res {
            let webhook_configs = {
                let c = state.webhook_configs.lock().unwrap();
                c.clone()
            };
            
            for config in webhook_configs.iter().filter(|c| c.enabled) {
                let config_clone = config.clone();
                let payload_clone = payload.clone();
                let price = tick.price;
                tokio::spawn(async move {
                    webhooks::dispatch_webhook(config_clone.url, config_clone.secret_token, payload_clone, price).await;
                });
            }
            
            (axum::http::StatusCode::OK, Json(serde_json::json!({ "id": id })))
        } else {
            (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": res.err().unwrap() })))
        }
    } else {
        (axum::http::StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({ "error": "No price data available" })))
    }
}

async fn get_simulator_state(
    State(state): State<Arc<AppState>>,
) -> Json<SimulatorState> {
    Json(state.simulator.get_state())
}

async fn update_position(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdatePositionRequest>,
) -> impl IntoResponse {
    match state.simulator.update_position(&payload.id, payload.take_profit, payload.stop_loss) {
        Ok(_) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success" }))),
        Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
    }
}

async fn close_position(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let timestamp = {
        let last = state.last_tick.lock().unwrap();
        last.as_ref().map(|t| t.time).unwrap_or(0)
    };

    match state.simulator.close_position(id, timestamp) {
        Ok(_) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success" }))),
        Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
    }
}

async fn deploy_strategy(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("");
    match state.strategy.deploy(code.to_string()) {
        Ok(_) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success" }))),
        Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
    }
}

async fn get_webhooks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let configs = state.webhook_configs.lock().unwrap();
    Json(configs.clone())
}

async fn update_webhooks(
    State(state): State<Arc<AppState>>,
    Json(configs): Json<Vec<WebhookConfig>>,
) -> impl IntoResponse {
    let mut current = state.webhook_configs.lock().unwrap();
    *current = configs;
    axum::http::StatusCode::OK
}

async fn get_history(
    Query(params): Query<HistoryParams>,
) -> Result<Json<Vec<HistoricalCandle>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let limit = params.limit.unwrap_or(200).min(200);
    let url = format!(
        "https://api.binance.com/api/v3/klines?symbol={}&interval={}&limit={}",
        params.symbol, params.interval, limit
    );

    let resp = reqwest::get(&url).await
        .map_err(|e| {
            tracing::error!("Failed to fetch from Binance: {}", e);
            (axum::http::StatusCode::BAD_GATEWAY, Json(serde_json::json!({ "error": "Failed to fetch klines" })))
        })?;

    let klines: Vec<Vec<serde_json::Value>> = resp.json().await
        .map_err(|e| {
            tracing::error!("Failed to parse Binance klines: {}", e);
            (axum::http::StatusCode::BAD_GATEWAY, Json(serde_json::json!({ "error": "Failed to parse klines" })))
        })?;

    let candles: Vec<HistoricalCandle> = klines
        .iter()
        .filter_map(|k| {
            let open_time = k.get(0)?.as_i64()?;
            let open = k.get(1)?.as_str()?.parse().ok()?;
            let high = k.get(2)?.as_str()?.parse().ok()?;
            let low = k.get(3)?.as_str()?.parse().ok()?;
            let close = k.get(4)?.as_str()?.parse().ok()?;
            Some(HistoricalCandle {
                time: (open_time / 1000) as u64,
                open,
                high,
                low,
                close,
            })
        })
        .collect();

    Ok(Json(candles))
}

async fn ai_chat(
    State(state): State<Arc<AppState>>,
    Json(request): Json<AIChatRequest>,
) -> impl IntoResponse {
    let session_id = uuid::Uuid::new_v4().to_string();
    
    let (tx, mut rx) = mpsc::channel::<String>(100);
    
    let request_clone = AIChatRequest {
        messages: request.messages.clone(),
        models: request.models.clone(),
        symbol: request.symbol.clone(),
        timeframe: request.timeframe.clone(),
    };
    
    let ai_client = state.ai_client.clone();
    
    tokio::spawn(async move {
        let _ = ai_client.chat(request_clone, session_id.clone(), tx).await;
    });
    
    use axum::body::Body;
    use bytes::Bytes;
    
    let stream = async_stream::stream! {
        while let Some(data) = rx.recv().await {
            yield Ok::<Bytes, std::convert::Infallible>(Bytes::from(data));
        }
    };
    
    (
        [("Content-Type", "text/event-stream; charset=utf-8")],
        Body::from_stream(stream),
    )
}
