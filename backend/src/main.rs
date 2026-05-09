mod models;

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use models::{BinanceTicker, Tick};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

struct AppState {
    tx: broadcast::Sender<Tick>,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Set up broadcast channel
    let (tx, _rx) = broadcast::channel(100);
    let app_state = Arc::new(AppState { tx: tx.clone() });

    // Spawn Binance stream task
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        start_binance_stream(tx_clone).await;
    });

    // Build our application
    let app = Router::new()
        .route("/", get(|| async { "Tradefy Backend is Live" }))
        .route("/health", get(|| async { "OK" }))
        .route("/ws/live", get(ws_handler))
        .with_state(app_state);

    // Run it
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn start_binance_stream(tx: broadcast::Sender<Tick>) {
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
                                let _ = tx.send(tick);
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
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
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
