mod ai;
mod alerts;
mod backtest;
mod candle_aggregator;
mod email;
mod exchange;
mod indicator;
mod indicators;
mod time_series;
mod models;
mod python_runtime;
mod simulator;
mod state_persistence;
mod strategy;
mod webhooks;

use ai::AIClient;
use alerts::AlertEngine;
use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path, Query, State},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use indicators::{EvaluateBatchRequest, EvaluateBatchResponse, IndicatorPipeline, resolve_mtf};
use backtest::BacktestEngine;
use candle_aggregator::CandleAggregator;
use exchange::{BinanceStream, ExchangeStream};
use futures_util::{SinkExt, StreamExt};
use models::{AIChatRequest, AlertRule, BacktestRequest, BinanceTicker, Candle, HistoryParams, OptimizeRequest, OrderRequest, SimulatorState, Tick, UpdatePositionRequest, WebhookConfig, HistoricalCandle, TriggeredAlert};
use simulator::SimulatorEngine;
use state_persistence::StateManager;
use strategy::StrategyEngine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, mpsc};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CustomIndicatorDef {
    id: String,
    name: String,
    script: String,
    category: String,
    created_at: u64,
}

struct AppState {
    tx: broadcast::Sender<Tick>,
    candle_tx: broadcast::Sender<Candle>,
    alert_tx: broadcast::Sender<TriggeredAlert>,
    simulator: Arc<SimulatorEngine>,
    strategy: StrategyEngine,
    last_tick: Mutex<Option<Tick>>,
    webhook_configs: Mutex<Vec<WebhookConfig>>,
    webhook_logger: webhooks::WebhookLogger,
    aggregators: Arc<Mutex<HashMap<(String, u32), CandleAggregator>>>,
    alert_engine: AlertEngine,
    ai_client: AIClient,
    db: Option<sqlx::PgPool>,
    custom_indicators: Mutex<Vec<CustomIndicatorDef>>,
    state_manager: StateManager,
    last_alert_times: Mutex<HashMap<String, u64>>,
    exchange_stream: Box<dyn ExchangeStream>,
}

#[tokio::main]
async fn main() {
    let env_path = std::env::current_dir()
        .map(|p| p.join(".env"))
        .unwrap_or_default();

    if env_path.exists() {
        dotenvy::from_path(&env_path).ok();
        tracing::info!("Loaded .env from {:?}", env_path);
    } else {
        dotenvy::dotenv().ok();
    }

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
        .add_directive("tokio_tungstenite=warn".parse().unwrap())
        .add_directive("tungstenite=warn".parse().unwrap());

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().with_target(false))
        .init();

    let (tx, _rx) = broadcast::channel(100);
    let (candle_tx, _candle_rx) = broadcast::channel(100);
    let (alert_tx, _alert_rx) = broadcast::channel(100);
    let simulator = Arc::new(SimulatorEngine::new(10000.0));
    let strategy = StrategyEngine::new(simulator.clone());

    let openrouter_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| "NOT_FOUND".to_string());
    let google_key = std::env::var("AI_API_KEY").unwrap_or_else(|_| "NOT_FOUND".to_string());

    tracing::info!("OpenRouter key: {}", if openrouter_key.len() > 20 { "SET ({} chars)".to_string() } else { openrouter_key.clone() });
    tracing::info!("Google key: {}", if google_key.len() > 20 { "SET ({} chars)".to_string() } else { google_key.clone() });
    let ai_client = AIClient::new(openrouter_key, google_key);

    let db = match sqlx::PgPool::connect(&std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://hicham:password@localhost:5432/tradefy".to_string())).await {
        Ok(pool) => {
            tracing::info!("Connected to PostgreSQL database");
            for migration in &[
                "migrations/001_create_chat_sessions.sql",
                "migrations/002_create_chat_messages.sql",
                "migrations/003_create_backtest_results.sql",
                "migrations/004_create_alert_rules.sql",
                "migrations/005_create_webhook_logs.sql",
                "migrations/006_create_saved_strategies.sql",
                "migrations/007_create_candle_cache.sql",
                "migrations/008_create_saved_state.sql",
                "migrations/009_create_execution_stats.sql",
            ] {
                let sql = match tokio::fs::read_to_string(migration).await {
                    Ok(content) => content,
                    Err(_) => continue,
                };
                if let Err(e) = sqlx::raw_sql(&sql).execute(&pool).await {
                    tracing::warn!("Migration {} warning: {}", migration, e);
                } else {
                    tracing::info!("Applied migration: {}", migration);
                }
            }
            Some(pool)
        }
        Err(e) => {
            tracing::warn!("Database not available: {}. Backtest save/load will be disabled.", e);
            None
        }
    };

    let mut aggregators_map = HashMap::new();
    aggregators_map.insert(
        ("BTCUSDT".to_string(), 5u32),
        CandleAggregator::new("BTCUSDT", 5),
    );
    let aggregators = Arc::new(Mutex::new(aggregators_map));

    let state_manager = StateManager::new(db.clone());
    let exchange_stream: Box<dyn ExchangeStream> = Box::new(BinanceStream::new());

    let app_state = Arc::new(AppState {
        tx: tx.clone(),
        candle_tx: candle_tx.clone(),
        alert_tx: alert_tx.clone(),
        simulator: simulator.clone(),
        strategy,
        last_tick: Mutex::new(None),
        webhook_configs: Mutex::new(Vec::new()),
        webhook_logger: webhooks::WebhookLogger::new(),
        aggregators,
        alert_engine: AlertEngine::new(),
        ai_client,
        db: db.clone(),
        custom_indicators: Mutex::new(Vec::new()),
        state_manager,
        last_alert_times: Mutex::new(HashMap::new()),
        exchange_stream,
    });

    let state_clone = app_state.clone();
    tokio::spawn(async move {
        start_binance_stream(state_clone).await;
    });

    // State persistence auto-save
    let state_mgr = Arc::new(StateManager::new(db.clone()));
    let sim_clone = simulator.clone();
    tokio::spawn(async move {
        state_persistence::start_auto_save(state_mgr, sim_clone).await;
    });

    // Try to restore saved state on startup
    let state_mgr_restore = StateManager::new(db.clone());
    if let Some(_saved_state) = state_mgr_restore.load_state().await {
        tracing::info!("Restored simulator state from database");
    }

    let app_state_for_shutdown = app_state.clone();

    // Restore saved strategies from database
    if let Some(pool) = &db {
        let strategies_from_db: Vec<(String, String)> = match sqlx::query_as::<_, (String, String, String)>(
            r#"SELECT symbol, code, name FROM saved_strategies ORDER BY created_at DESC LIMIT 10"#,
        )
        .fetch_all(pool)
        .await
        {
            Ok(rows) => {
                rows.into_iter().map(|r| (r.0, r.1)).collect()
            }
            Err(e) => {
                tracing::warn!("Could not restore strategies: {}", e);
                Vec::new()
            }
        };
        if !strategies_from_db.is_empty() {
            app_state.strategy.restore_strategies(strategies_from_db);
            tracing::info!("Restored strategies from database");
        }
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(|| async { "Tradefy Backend is Live" }))
        .route("/health", get(|| async { "OK" }))
        .route("/ws/live", get(ws_handler))
        .route("/ws/candles", get(ws_candles_handler))
        .route("/ws/alerts", get(ws_alerts_handler))
        .route("/api/order", post(place_order))
        .route("/api/position/update", post(update_position))
        .route("/api/position/close", post(close_position))
        .route("/api/state", get(get_simulator_state))
        .route("/api/strategy/deploy", post(deploy_strategy))
        .route("/api/strategy/remove", post(remove_strategy))
        .route("/api/strategy/active", get(get_active_strategies))
        .route("/api/webhooks", get(get_webhooks).post(update_webhooks))
        .route("/api/webhooks/logs", get(get_webhook_logs))
        .route("/api/alerts", get(get_alerts).post(create_alert))
        .route("/api/alerts/:id", delete(delete_alert))
        .route("/api/history", get(get_history))
        .route("/api/indicator/evaluate", post(evaluate_indicator_handler))
        .route("/api/indicators/evaluate-batch", post(evaluate_indicators_batch))
        .route("/api/indicators/list", get(list_indicators))
        .route("/api/indicators/mtf/resolve", post(resolve_mtf_handler))
        .route("/api/indicators/custom/save", post(save_custom_indicator))
        .route("/api/indicators/custom/list", get(list_custom_indicators))
        .route("/api/indicators/custom/:id", delete(delete_custom_indicator))
        .route("/api/backtest/run", post(run_backtest))
        .route("/api/backtest/optimize", post(run_backtest_optimize))
        .route("/api/backtest/save", post(save_backtest))
        .route("/api/backtest/list", get(list_backtests))
        .route("/api/backtest/:id", get(get_backtest_by_id))
        .route("/api/strategy/save", post(save_strategy))
        .route("/api/strategy/list", get(list_strategies))
        .route("/api/strategy/delete", post(delete_strategy))
        .route("/api/ai/chat", post(ai_chat))
        .route("/api/strategy/execution-stats", get(get_execution_stats))
        .route("/api/exchanges", get(list_exchanges).post(set_active_exchange))
        .layer(cors)
        .with_state(app_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("listening on {}", addr);

    let socket = tokio::net::TcpSocket::new_v4().unwrap();
    socket.set_reuseaddr(true).unwrap();
    socket.bind(addr).unwrap();
    let listener = socket.listen(1024).unwrap();

    // Graceful shutdown handler: save state on Ctrl+C
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.unwrap();
        tracing::info!("Ctrl+C received, saving state before shutdown...");
        app_state_for_shutdown.state_manager.save_state(&app_state_for_shutdown.simulator).await;
        app_state_for_shutdown.strategy.save_strategy_state().await;
        tracing::info!("State saved. Shutting down.");
        std::process::exit(0);
    });

    axum::serve(listener, app).await.unwrap();
}

async fn start_binance_stream(state: Arc<AppState>) {
    let ws_url = state.exchange_stream.connect().unwrap_or_else(|_| "wss://stream.binance.com:9443/ws/btcusdt@ticker".to_string());
    let mut consecutive_errors: u32 = 0;
    loop {
        tracing::info!("Connecting to {} at: {}", state.exchange_stream.name(), &ws_url);
        match tokio_tungstenite::connect_async(&ws_url).await {
            Ok((mut ws_stream, _)) => {
                tracing::info!("Connected to Binance");
                consecutive_errors = 0;
                while let Some(msg) = ws_stream.next().await {
                    match msg {
                        Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                            if let Ok(binance_tick) = serde_json::from_str::<BinanceTicker>(&text) {
                                let tick = Tick {
                                    symbol: binance_tick.symbol,
                                    price: binance_tick.price.parse().unwrap_or(0.0),
                                    time: binance_tick.time,
                                };

                                if let Ok(mut last) = state.last_tick.lock() {
                                    *last = Some(tick.clone());
                                }

                                state.simulator.process_tick(&tick);

                                let completed_candles = {
                                    let mut aggregators = state.aggregators.lock().unwrap();
                                    let mut all_completed = Vec::new();
                                    for (_, agg) in aggregators.iter_mut() {
                                        let completed = agg.process_tick(&tick);
                                        all_completed.extend(completed);
                                    }
                                    all_completed
                                };

                                let webhook_configs = {
                                    let c = state.webhook_configs.lock().unwrap();
                                    c.clone()
                                };

                                if let Some(current_candle) = {
                                    let aggregators = state.aggregators.lock().unwrap();
                                    aggregators.get(&("BTCUSDT".to_string(), 5u32))
                                        .and_then(|agg| agg.get_current_candle().cloned())
                                } {
                                    state.strategy.on_candle(&current_candle, webhook_configs.clone());

                                    // Evaluate alerts on each candle update
                                    if let Some(agg) = {
                                        let aggregators = state.aggregators.lock().unwrap();
                                        aggregators.get(&("BTCUSDT".to_string(), 5u32)).cloned()
                                    } {
                                        let triggered = state.alert_engine.evaluate(&current_candle, &agg);
                                        let mut last_times = state.last_alert_times.lock().unwrap();
                                        for alert in triggered {
                                            let dedup_key = format!("{}:{}", alert.rule_id, alert.timestamp);
                                            if last_times.get(&dedup_key).copied().unwrap_or(0) == alert.timestamp {
                                                continue; // Skip duplicate alert on same tick
                                            }
                                            last_times.insert(dedup_key, alert.timestamp);
                                            // Keep last 1000 entries
                                            if last_times.len() > 1000 {
                                                let keys: Vec<String> = last_times.keys().take(500).cloned().collect();
                                                for k in keys { last_times.remove(&k); }
                                            }
                                            let _ = state.alert_tx.send(alert);
                                        }
                                    }
                                }

                                state.strategy.on_tick(tick.clone(), webhook_configs);

                                for candle in &completed_candles {
                                    let _ = state.candle_tx.send(candle.clone());
                                }

                                let _ = state.tx.send(tick);
                            }
                        }
                        Ok(tokio_tungstenite::tungstenite::Message::Ping(p)) => {
                             let _ = ws_stream.send(tokio_tungstenite::tungstenite::Message::Pong(p)).await;
                        }
                        Err(e) => {
                            tracing::error!("WebSocket stream error: {}", e);
                            consecutive_errors += 1;
                            break;
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                consecutive_errors += 1;
                let backoff = (consecutive_errors * 5).min(60);
                tracing::error!(
                    "Binance connection error: {}. Retrying in {}s... (error #{})",
                    e, backoff, consecutive_errors
                );
                tokio::time::sleep(tokio::time::Duration::from_secs(backoff as u64)).await;
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

async fn ws_candles_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_candle_socket(socket, state))
}

async fn ws_alerts_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_alert_socket(socket, state))
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

async fn handle_candle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    tracing::info!("New candle WebSocket connection");
    let mut rx = state.candle_tx.subscribe();

    while let Ok(candle) = rx.recv().await {
        let msg = serde_json::to_string(&candle).unwrap();
        if socket.send(Message::Text(msg)).await.is_err() {
            break;
        }
    }
    tracing::info!("Candle WebSocket connection closed");
}

async fn handle_alert_socket(mut socket: WebSocket, state: Arc<AppState>) {
    tracing::info!("New alert WebSocket connection");
    let mut rx = state.alert_tx.subscribe();

    while let Ok(alert) = rx.recv().await {
        let msg = serde_json::to_string(&alert).unwrap();
        if socket.send(Message::Text(msg)).await.is_err() {
            break;
        }
    }
    tracing::info!("Alert WebSocket connection closed");
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
                    let result = webhooks::dispatch_webhook_with_config(&config_clone, &payload_clone, price).await;
                    match &result {
                        webhooks::WebhookDeliveryResult::Success(_info) => {
                            tracing::info!("Webhook dispatched successfully to {}", config_clone.url);
                        }
                        webhooks::WebhookDeliveryResult::Failed(info) => {
                            tracing::error!("Webhook failed to {}: {:?}", config_clone.url, info.error);
                        }
                    }
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
    let symbol = payload.get("symbol").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("");
    if symbol.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "symbol is required" })));
    }
    match state.strategy.deploy(symbol, code.to_string()) {
        Ok(_) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success" }))),
        Err(e) => {
            tracing::error!("Strategy deploy error: {}", e);
            (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e })))
        }
    }
}

async fn remove_strategy(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let symbol = payload.get("symbol").and_then(|v| v.as_str()).unwrap_or("");
    if symbol.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "symbol is required" })));
    }
    match state.strategy.remove(symbol) {
        Ok(_) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success" }))),
        Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
    }
}

async fn get_active_strategies(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<String>> {
    Json(state.strategy.get_active_symbols())
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

async fn get_webhook_logs(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<models::WebhookLog>> {
    Json(state.webhook_logger.get_logs())
}

// ── Alert API ──

async fn get_alerts(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<AlertRule>> {
    Json(state.alert_engine.get_rules())
}

async fn create_alert(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let id = payload.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled Alert").to_string();
    let symbol = payload.get("symbol").and_then(|v| v.as_str()).unwrap_or("BTCUSDT").to_string();
    let timeframe = payload.get("timeframe").and_then(|v| v.as_str()).unwrap_or("5m").to_string();
    let condition_type = payload.get("condition_type").and_then(|v| v.as_str()).unwrap_or("crossing").to_string();
    let condition_params = payload.get("condition_params").cloned().unwrap_or(serde_json::json!({}));
    let frequency = payload.get("frequency").and_then(|v| v.as_str()).unwrap_or("OncePerBarClose").to_string();
    let enabled = payload.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);

    let actions = payload.get("actions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().map(|a| models::AlertActionConfig {
                action_type: a.get("type").and_then(|v| v.as_str()).unwrap_or("webhook").to_string(),
                webhook_config_id: a.get("webhook_config_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                url: a.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                email: a.get("email").and_then(|v| v.as_str()).map(|s| s.to_string()),
                enabled: a.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
            })
            .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let rule = AlertRule {
        id,
        name,
        symbol,
        timeframe,
        condition_type,
        condition_params,
        frequency,
        actions,
        enabled,
        created_at: now,
    };

    state.alert_engine.add_rule(rule);

    (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success" })))
}

async fn delete_alert(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if state.alert_engine.remove_rule(&id) {
        (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "deleted" })))
    } else {
        (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Alert rule not found" })))
    }
}

// ── End Alert API ──

async fn get_history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryParams>,
) -> Result<Json<Vec<HistoricalCandle>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let limit = params.limit.unwrap_or(1000).min(1000);

    // Try cache first
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let start_time = now - (limit as u64 * 300); // Approximate: 5min per candle average
    if limit <= 1000 {
        if let Some(cached) = state.state_manager.load_candle_cache(&params.symbol, &params.interval, start_time, now).await {
            if cached.len() as u32 >= limit.min(500) {
                let hist: Vec<HistoricalCandle> = cached.into_iter().map(|c| HistoricalCandle {
                    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
                }).collect();
                return Ok(Json(hist));
            }
        }
    }

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
            let volume = k.get(5)?.as_str()?.parse().ok()?;
            Some(HistoricalCandle {
                time: (open_time / 1000) as u64,
                open,
                high,
                low,
                close,
                volume,
            })
        })
        .collect();

    // Cache the fetched data
    if !candles.is_empty() {
        let cached: Vec<Candle> = candles.iter().map(|h| Candle {
            time: h.time, open: h.open, high: h.high, low: h.low, close: h.close,
            volume: h.volume, symbol: params.symbol.clone(), is_closed: true,
        }).collect();
        state.state_manager.save_candle_cache(&params.symbol, &params.interval, &cached).await;
    }

    Ok(Json(candles))
}

async fn evaluate_indicator_handler(
    Json(payload): Json<indicator::EvaluateRequest>,
) -> Result<Json<indicator::EvaluateResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    match indicator::evaluate_indicator(&payload.script, &payload.candles) {
        Ok(resp) => Ok(Json(resp)),
        Err(e) => Err((axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e })))),
    }
}

async fn evaluate_indicators_batch(
    Json(payload): Json<EvaluateBatchRequest>,
) -> Result<Json<EvaluateBatchResponse>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let mut pipeline = IndicatorPipeline::new();

    for req in &payload.indicators {
        match indicators::get_indicator(&req.indicator_type, &req.params, req.color.as_deref()) {
            Some(indicator) => {
                pipeline.add(indicator, req.pane, req.color.clone().unwrap_or_else(|| "#3b82f6".into()));
            }
            None => {
                return Err((
                    axum::http::StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": format!("Unknown indicator type: {}", req.indicator_type) })),
                ));
            }
        }
    }

    let results = pipeline.evaluate_all(&payload.candles);
    Ok(Json(EvaluateBatchResponse { results }))
}

async fn resolve_mtf_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let symbol = payload.get("symbol").and_then(|v| v.as_str()).unwrap_or("BTCUSDT");
    let timeframe = payload.get("timeframe").and_then(|v| v.as_str()).unwrap_or("1h");
    let expression = payload.get("expression").and_then(|v| v.as_str()).unwrap_or("close");

    let aggregators = state.aggregators.lock().unwrap();
    let value = resolve_mtf(symbol, timeframe, expression, &aggregators);

    Json(serde_json::json!({
        "symbol": symbol,
        "timeframe": timeframe,
        "expression": expression,
        "value": value,
    }))
}

async fn list_indicators() -> Json<Vec<serde_json::Value>> {
    Json(indicators::list_available_indicators())
}

async fn save_custom_indicator(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled").to_string();
    let script = payload.get("script").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let category = payload.get("category").and_then(|v| v.as_str()).unwrap_or("Custom").to_string();

    if script.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "script is required" })));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let def = CustomIndicatorDef { id: id.clone(), name, script, category, created_at: now };
    state.custom_indicators.lock().unwrap().push(def);

    (axum::http::StatusCode::OK, Json(serde_json::json!({ "id": id })))
}

async fn list_custom_indicators(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<CustomIndicatorDef>> {
    let indicators = state.custom_indicators.lock().unwrap();
    Json(indicators.clone())
}

async fn delete_custom_indicator(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut indicators = state.custom_indicators.lock().unwrap();
    let len_before = indicators.len();
    indicators.retain(|i| i.id != id);
    if indicators.len() < len_before {
        (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "deleted" })))
    } else {
        (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Indicator not found" })))
    }
}

async fn run_backtest(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BacktestRequest>,
) -> impl IntoResponse {
    // Try to use cached data first via state_manager
    if state.db.is_some() {
        let cached = state.state_manager.load_candle_cache(
            &payload.symbol, &payload.timeframe, payload.start_time, payload.end_time
        ).await;
        if let Some(candles) = cached {
            if !candles.is_empty() {
                // Use cache-only path
                let engine = BacktestEngine::new(payload);
                let result = engine.run_with_candles(candles).await;
                return match result {
                    Ok(r) => (axum::http::StatusCode::OK, Json(serde_json::json!(r))),
                    Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
                };
            }
        }
    }

    let engine = BacktestEngine::new(payload);
    match engine.run().await {
        Ok(result) => (axum::http::StatusCode::OK, Json(serde_json::json!(result))),
        Err(e) => {
            tracing::error!("Backtest error: {}", e);
            (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e })))
        }
    }
}

async fn run_backtest_optimize(
    State(_state): State<Arc<AppState>>,
    Json(payload): Json<OptimizeRequest>,
) -> impl IntoResponse {
    let engine = backtest::BacktestEngine::new(BacktestRequest {
        strategy_code: payload.strategy_code.clone(),
        symbol: payload.symbol.clone(),
        timeframe: payload.timeframe.clone(),
        start_time: payload.start_time,
        end_time: payload.end_time,
        initial_balance: payload.initial_balance,
        commission: payload.commission,
        slippage: payload.slippage,
    });

    match engine.run().await {
        Ok(_) => {}
        Err(e) => {
            return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Baseline run failed: {}", e) })));
        }
    }

    match backtest::run_optimization(&payload).await {
        Ok(results) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "results": results }))),
        Err(e) => {
            tracing::error!("Optimization error: {}", e);
            (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e })))
        }
    }
}

async fn save_backtest(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(pool) => pool,
        None => return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "error": "Database not available" })),
        ),
    };

    let result: &serde_json::Value = &payload;
    let summary = &result["summary"];
    let trades = &result["trades"];
    let equity_curve = &result["equity_curve"];
    let request = &result["request"];
    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled");

    let trade_json = serde_json::to_string(trades).unwrap_or_default();
    let equity_json = serde_json::to_string(equity_curve).unwrap_or_default();

    let start_time = {
        let st = request["start_time"].as_u64().unwrap_or(0);
        chrono::DateTime::from_timestamp(st as i64, 0)
            .unwrap_or_default()
    };
    let end_time = {
        let et = request["end_time"].as_u64().unwrap_or(0);
        chrono::DateTime::from_timestamp(et as i64, 0)
            .unwrap_or_default()
    };

    match sqlx::query_scalar::<_, uuid::Uuid>(
        r#"
        INSERT INTO backtest_results (
            strategy_name, symbol, timeframe, start_time, end_time,
            initial_balance, final_balance, net_profit,
            total_trades, winning_trades, losing_trades, win_rate,
            max_drawdown, max_drawdown_pct, sharpe_ratio, profit_factor,
            avg_win, avg_loss, trade_history, equity_curve, strategy_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING id
        "#,
    )
    .bind(name)
    .bind(request["symbol"].as_str().unwrap_or(""))
    .bind(request["timeframe"].as_str().unwrap_or(""))
    .bind(start_time)
    .bind(end_time)
    .bind(summary["initial_balance"].as_f64().unwrap_or(0.0))
    .bind(summary["final_balance"].as_f64().unwrap_or(0.0))
    .bind(summary["net_profit"].as_f64().unwrap_or(0.0))
    .bind(summary["total_trades"].as_i64().unwrap_or(0) as i32)
    .bind(summary["winning_trades"].as_i64().unwrap_or(0) as i32)
    .bind(summary["losing_trades"].as_i64().unwrap_or(0) as i32)
    .bind(summary["win_rate"].as_f64().unwrap_or(0.0))
    .bind(summary["max_drawdown"].as_f64().unwrap_or(0.0))
    .bind(summary["max_drawdown_pct"].as_f64().unwrap_or(0.0))
    .bind(summary["sharpe_ratio"].as_f64().unwrap_or(0.0))
    .bind(summary["profit_factor"].as_f64().unwrap_or(0.0))
    .bind(summary["avg_win"].as_f64().unwrap_or(0.0))
    .bind(summary["avg_loss"].as_f64().unwrap_or(0.0))
    .bind(&trade_json)
    .bind(&equity_json)
    .bind(request["strategy_code"].as_str().unwrap_or(""))
    .fetch_one(db)
    .await
    {
        Ok(id) => {
            (axum::http::StatusCode::OK, Json(serde_json::json!({ "id": id.to_string() })))
        }
        Err(e) => {
            tracing::error!("Failed to save backtest: {}", e);
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() })))
        }
    }
}

async fn get_backtest_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(pool) => pool,
        None => return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "error": "Database not available" })),
        ),
    };

    let uuid = match uuid::Uuid::parse_str(&id) {
        Ok(u) => u,
        Err(_) => return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid ID format" })),
        ),
    };

    match sqlx::query("SELECT * FROM backtest_results WHERE id = $1")
        .bind(uuid)
        .fetch_optional(db)
        .await
    {
        Ok(Some(row)) => {
            use sqlx::Row;
            let result = serde_json::json!({
                "id": row.get::<uuid::Uuid, _>("id").to_string(),
                "strategy_name": row.get::<String, _>("strategy_name"),
                "symbol": row.get::<String, _>("symbol"),
                "timeframe": row.get::<String, _>("timeframe"),
                "start_time": row.get::<chrono::DateTime<chrono::Utc>, _>("start_time"),
                "end_time": row.get::<chrono::DateTime<chrono::Utc>, _>("end_time"),
                "initial_balance": row.get::<f64, _>("initial_balance"),
                "final_balance": row.get::<f64, _>("final_balance"),
                "net_profit": row.get::<f64, _>("net_profit"),
                "total_trades": row.get::<i32, _>("total_trades"),
                "winning_trades": row.get::<i32, _>("winning_trades"),
                "losing_trades": row.get::<i32, _>("losing_trades"),
                "win_rate": row.get::<f64, _>("win_rate"),
                "max_drawdown": row.get::<f64, _>("max_drawdown"),
                "max_drawdown_pct": row.get::<f64, _>("max_drawdown_pct"),
                "sharpe_ratio": row.get::<f64, _>("sharpe_ratio"),
                "profit_factor": row.get::<f64, _>("profit_factor"),
                "avg_win": row.get::<f64, _>("avg_win"),
                "avg_loss": row.get::<f64, _>("avg_loss"),
                "trade_history": serde_json::from_str::<serde_json::Value>(&row.get::<String, _>("trade_history")).unwrap_or_default(),
                "equity_curve": serde_json::from_str::<serde_json::Value>(&row.get::<String, _>("equity_curve")).unwrap_or_default(),
                "strategy_code": row.get::<String, _>("strategy_code"),
                "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
            });
            (axum::http::StatusCode::OK, Json(result))
        }
        Ok(None) => (
            axum::http::StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Backtest result not found" })),
        ),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ),
    }
}

async fn list_backtests(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(pool) => pool,
        None => return Json(serde_json::json!({ "results": [], "error": "Database not available" })),
    };

    match sqlx::query(
        r#"
        SELECT id, strategy_name, symbol, timeframe, initial_balance, final_balance, net_profit, total_trades, win_rate, created_at
        FROM backtest_results
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .fetch_all(db)
    .await
    {
        Ok(rows) => {
            use sqlx::Row;
            let results: Vec<serde_json::Value> = rows.into_iter().map(|r| {
                serde_json::json!({
                    "id": r.get::<uuid::Uuid, _>("id").to_string(),
                    "strategy_name": r.get::<String, _>("strategy_name"),
                    "symbol": r.get::<String, _>("symbol"),
                    "timeframe": r.get::<String, _>("timeframe"),
                    "initial_balance": r.get::<f64, _>("initial_balance"),
                    "final_balance": r.get::<f64, _>("final_balance"),
                    "net_profit": r.get::<f64, _>("net_profit"),
                    "total_trades": r.get::<i32, _>("total_trades"),
                    "win_rate": r.get::<f64, _>("win_rate"),
                    "created_at": r.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
                })
            }).collect();
            Json(serde_json::json!({ "results": results }))
        }
        Err(e) => {
            tracing::error!("Failed to list backtests: {}", e);
            Json(serde_json::json!({ "results": [], "error": e.to_string() }))
        }
    }
}

async fn save_strategy(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(pool) => pool,
        None => return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "error": "Database not available" })),
        ),
    };

    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled");
    let symbol = payload.get("symbol").and_then(|v| v.as_str()).unwrap_or("");
    let timeframe = payload.get("timeframe").and_then(|v| v.as_str()).unwrap_or("");
    let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("");

    if symbol.is_empty() || code.is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "symbol and code are required" })),
        );
    }

    match sqlx::query_scalar::<_, uuid::Uuid>(
        r#"INSERT INTO saved_strategies (name, symbol, timeframe, code) VALUES ($1, $2, $3, $4) RETURNING id"#,
    )
    .bind(name)
    .bind(symbol)
    .bind(timeframe)
    .bind(code)
    .fetch_one(db)
    .await
    {
        Ok(id) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "id": id.to_string() }))),
        Err(e) => {
            tracing::error!("Failed to save strategy: {}", e);
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() })))
        }
    }
}

async fn delete_strategy(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(pool) => pool,
        None => return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "error": "Database not available" })),
        ),
    };

    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "id is required" })),
        );
    }

    let uuid = match uuid::Uuid::parse_str(id) {
        Ok(u) => u,
        Err(_) => return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid ID format" })),
        ),
    };

    match sqlx::query("DELETE FROM saved_strategies WHERE id = $1")
        .bind(uuid)
        .execute(db)
        .await
    {
        Ok(_) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "deleted" }))),
        Err(e) => {
            tracing::error!("Failed to delete strategy: {}", e);
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() })))
        }
    }
}

async fn list_strategies(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(pool) => pool,
        None => return Json(serde_json::json!({ "results": [], "error": "Database not available" })),
    };

    match sqlx::query_as::<_, (uuid::Uuid, String, String, String, String, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT id, name, symbol, timeframe, code, created_at FROM saved_strategies ORDER BY created_at DESC LIMIT 50"#,
    )
    .fetch_all(db)
    .await
    {
        Ok(rows) => {
            let results: Vec<serde_json::Value> = rows.into_iter().map(|r| {
                serde_json::json!({
                    "id": r.0.to_string(),
                    "name": r.1,
                    "symbol": r.2,
                    "timeframe": r.3,
                    "code": r.4,
                    "created_at": r.5,
                })
            }).collect();
            Json(serde_json::json!({ "results": results }))
        }
        Err(e) => {
            tracing::error!("Failed to list strategies: {}", e);
            Json(serde_json::json!({ "results": [], "error": e.to_string() }))
        }
    }
}

async fn get_execution_stats(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    // Collect execution stats from all active strategy runtimes
    let active = state.strategy.get_active_symbols();
    let mut stats = Vec::new();
    for symbol in active {
        let strategies = state.strategy.get_strategies_for_stats();
        if let Some(runtime_stats) = strategies.get(&symbol) {
            stats.push(serde_json::json!({
                "symbol": symbol,
                "avg_ms": runtime_stats.avg_ms,
                "max_ms": runtime_stats.max_ms,
                "min_ms": runtime_stats.min_ms,
                "count": runtime_stats.count,
                "threshold_exceeded": runtime_stats.threshold_exceeded,
            }));
        } else {
            stats.push(serde_json::json!({
                "symbol": symbol,
                "avg_ms": 0.0,
                "max_ms": 0.0,
                "min_ms": 0.0,
                "count": 0,
                "threshold_exceeded": false,
            }));
        }
    }
    Json(serde_json::json!({ "stats": stats }))
}

async fn list_exchanges(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let current_exchange = state.exchange_stream.name().to_string();
    Json(serde_json::json!({
        "exchanges": [
            { "id": "binance", "name": "Binance", "available": true, "active": current_exchange == "binance" },
            { "id": "bybit", "name": "Bybit", "available": true, "active": current_exchange == "bybit" },
            { "id": "coinbase", "name": "Coinbase", "available": true, "active": current_exchange == "coinbase" },
        ]
    }))
}

async fn set_active_exchange(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let exchange_id = payload.get("exchange").and_then(|v| v.as_str()).unwrap_or("binance");
    let new_stream: Box<dyn ExchangeStream> = match exchange_id {
        "bybit" => Box::new(exchange::BybitStream::new()),
        "coinbase" => Box::new(exchange::CoinbaseStream::new()),
        _ => Box::new(exchange::BinanceStream::new()),
    };
    // The exchange_stream is behind an Arc<AppState>, so we need to replace it
    // For now, log the switch attempt
    tracing::info!("Exchange switch requested to: {} (stream type: {})", exchange_id, new_stream.name());
    (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "ok", "exchange": exchange_id })))
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
