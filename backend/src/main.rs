mod models;
mod simulator;

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use models::{BinanceTicker, OrderRequest, SimulatorState, Tick, UpdatePositionRequest};
use simulator::SimulatorEngine;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

struct AppState {
    tx: broadcast::Sender<Tick>,
    simulator: SimulatorEngine,
    last_tick: Mutex<Option<Tick>>,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Set up broadcast channel
    let (tx, _rx) = broadcast::channel(100);
    let simulator = SimulatorEngine::new(10000.0); // Initial $10k balance
    
    let app_state = Arc::new(AppState { 
        tx: tx.clone(),
        simulator,
        last_tick: Mutex::new(None),
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
        match state.simulator.place_order(payload, tick.price, tick.time) {
            Ok(id) => (axum::http::StatusCode::OK, Json(serde_json::json!({ "id": id }))),
            Err(e) => (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e }))),
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
