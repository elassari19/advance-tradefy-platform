mod ai;
mod backtest;
mod candle_aggregator;
mod indicator;
mod indicators;
mod time_series;
mod models;
mod python_runtime;
mod simulator;
mod strategy;
mod webhooks;

use ai::AIClient;
use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path, Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use indicators::{EvaluateBatchRequest, EvaluateBatchResponse, IndicatorPipeline, resolve_mtf};
use backtest::BacktestEngine;
use candle_aggregator::CandleAggregator;
use futures_util::{SinkExt, StreamExt};
use models::{AIChatRequest, BacktestRequest, BinanceTicker, Candle, HistoryParams, OrderRequest, SimulatorState, Tick, UpdatePositionRequest, WebhookConfig, HistoricalCandle};
use simulator::SimulatorEngine;
use strategy::StrategyEngine;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, mpsc};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};



struct AppState {
    tx: broadcast::Sender<Tick>,
    candle_tx: broadcast::Sender<Candle>,
    simulator: Arc<SimulatorEngine>,
    strategy: StrategyEngine,
    last_tick: Mutex<Option<Tick>>,
    webhook_configs: Mutex<Vec<WebhookConfig>>,
    aggregators: Arc<Mutex<HashMap<(String, u32), CandleAggregator>>>,
    ai_client: AIClient,
    db: Option<sqlx::PgPool>,
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

    // Set up broadcast channels
    let (tx, _rx) = broadcast::channel(100);
    let (candle_tx, _candle_rx) = broadcast::channel(100);
    let simulator = Arc::new(SimulatorEngine::new(10000.0)); // Initial $10k balance
    let strategy = StrategyEngine::new(simulator.clone());
    
    // Initialize AI client
    let openrouter_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| "NOT_FOUND".to_string());
    let google_key = std::env::var("AI_API_KEY").unwrap_or_else(|_| "NOT_FOUND".to_string());
    
    tracing::info!("OpenRouter key: {}", if openrouter_key.len() > 20 { "SET ({} chars)".to_string() } else { openrouter_key.clone() });
    tracing::info!("Google key: {}", if google_key.len() > 20 { "SET ({} chars)".to_string() } else { google_key.clone() });
    let ai_client = AIClient::new(openrouter_key, google_key);
    
    // Initialize database pool
    let db = match sqlx::PgPool::connect(&std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://hicham:password@localhost:5432/tradefy".to_string())).await {
        Ok(pool) => {
            tracing::info!("Connected to PostgreSQL database");
            // Run migrations
            for migration in &["migrations/001_create_chat_sessions.sql", "migrations/002_create_chat_messages.sql", "migrations/003_create_backtest_results.sql"] {
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

    // Pre-create aggregator for default symbol/timeframe
    let mut aggregators_map = HashMap::new();
    aggregators_map.insert(
        ("BTCUSDT".to_string(), 5u32),
        CandleAggregator::new("BTCUSDT", 5),
    );
    let aggregators = Arc::new(Mutex::new(aggregators_map));
    
    let app_state = Arc::new(AppState { 
        tx: tx.clone(),
        candle_tx: candle_tx.clone(),
        simulator,
        strategy,
        last_tick: Mutex::new(None),
        webhook_configs: Mutex::new(Vec::new()),
        aggregators,
        ai_client,
        db,
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
        .route("/ws/candles", get(ws_candles_handler))
        .route("/api/order", post(place_order))
        .route("/api/position/update", post(update_position))
        .route("/api/position/close", post(close_position))
        .route("/api/state", get(get_simulator_state))
        .route("/api/strategy/deploy", post(deploy_strategy))
        .route("/api/strategy/remove", post(remove_strategy))
        .route("/api/strategy/active", get(get_active_strategies))
        .route("/api/webhooks", get(get_webhooks).post(update_webhooks))
        .route("/api/history", get(get_history))
        .route("/api/indicator/evaluate", post(evaluate_indicator_handler))
        .route("/api/indicators/evaluate-batch", post(evaluate_indicators_batch))
        .route("/api/indicators/list", get(list_indicators))
        .route("/api/indicators/mtf/resolve", post(resolve_mtf_handler))
        .route("/api/backtest/run", post(run_backtest))
        .route("/api/backtest/save", post(save_backtest))
        .route("/api/backtest/list", get(list_backtests))
        .route("/api/backtest/:id", get(get_backtest_by_id))
        .route("/api/ai/chat", post(ai_chat))
        .layer(cors)
        .with_state(app_state);

    // Run it
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("listening on {}", addr);

    let socket = tokio::net::TcpSocket::new_v4().unwrap();
    socket.set_reuseaddr(true).unwrap();
    socket.bind(addr).unwrap();
    let listener = socket.listen(1024).unwrap();
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

                                // Feed tick into candle aggregators (must be before on_candle)
                                let completed_candles = {
                                    let mut aggregators = state.aggregators.lock().unwrap();
                                    let mut all_completed = Vec::new();
                                    for (_, agg) in aggregators.iter_mut() {
                                        let completed = agg.process_tick(&tick);
                                        all_completed.extend(completed);
                                    }
                                    all_completed
                                };

                                // Process candle-based strategy execution
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
                                }

                                // Process tick-based strategy execution (backward compat)
                                state.strategy.on_tick(tick.clone(), webhook_configs);

                                // Broadcast completed candles to frontend
                                for candle in &completed_candles {
                                    let _ = state.candle_tx.send(candle.clone());
                                }
                                
                                // Broadcast tick to frontend
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

async fn ws_candles_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_candle_socket(socket, state))
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
    let symbol = payload.get("symbol").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let code = payload.get("code").and_then(|v| v.as_str()).unwrap_or("");
    if symbol.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "symbol is required" })));
    }
    match state.strategy.deploy(symbol, code.to_string()) {
        Ok(_) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "status": "success" }))),
        Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
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

async fn get_history(
    Query(params): Query<HistoryParams>,
) -> Result<Json<Vec<HistoricalCandle>>, (axum::http::StatusCode, Json<serde_json::Value>)> {
    let limit = params.limit.unwrap_or(1000).min(1000);
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

async fn run_backtest(
    _state: State<Arc<AppState>>,
    Json(payload): Json<BacktestRequest>,
) -> impl IntoResponse {
    let engine = BacktestEngine::new(payload);
    match engine.run().await {
        Ok(result) => (axum::http::StatusCode::OK, Json(serde_json::json!(result))),
        Err(e) => {
            tracing::error!("Backtest error: {}", e);
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
