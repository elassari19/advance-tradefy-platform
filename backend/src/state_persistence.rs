use crate::models::{Candle, SimulatorState};
use crate::simulator::SimulatorEngine;
use std::sync::Arc;

pub struct StateManager {
    db: Option<sqlx::PgPool>,
    auto_save_interval_secs: u64,
}

impl StateManager {
    pub fn new(db: Option<sqlx::PgPool>) -> Self {
        Self {
            db,
            auto_save_interval_secs: 30,
        }
    }

    pub fn with_interval(mut self, secs: u64) -> Self {
        self.auto_save_interval_secs = secs;
        self
    }

    pub async fn save_state(&self, simulator: &SimulatorEngine) {
        let pool = match &self.db {
            Some(p) => p,
            None => return,
        };
        let state = simulator.get_state();
        let state_json = serde_json::to_string(&state).unwrap_or_default();

        let result = sqlx::query(
            r#"
            INSERT INTO saved_state (id, state_type, state_json, updated_at)
            VALUES ('default', 'simulator', $1::jsonb, NOW())
            ON CONFLICT (id, state_type)
            DO UPDATE SET state_json = $1::jsonb, updated_at = NOW()
            "#,
        )
        .bind(&state_json)
        .execute(pool)
        .await;

        match result {
            Ok(_) => tracing::debug!("Simulator state saved"),
            Err(e) => tracing::warn!("Failed to save simulator state: {}", e),
        }
    }

    pub async fn load_state(&self) -> Option<SimulatorState> {
        let pool = match &self.db {
            Some(p) => p,
            None => return None,
        };

        let result = sqlx::query_scalar::<_, String>(
            r#"SELECT state_json FROM saved_state WHERE id = 'default' AND state_type = 'simulator'"#,
        )
        .fetch_optional(pool)
        .await;

        match result {
            Ok(Some(json)) => serde_json::from_str(&json).ok(),
            _ => None,
        }
    }

    pub async fn save_candle_cache(&self, symbol: &str, timeframe: &str, candles: &[Candle]) {
        let pool = match &self.db {
            Some(p) => p,
            None => return,
        };

        for candle in candles {
            let result = sqlx::query(
                r#"
                INSERT INTO candle_cache (symbol, timeframe, open_time, open, high, low, close, volume)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (symbol, timeframe, open_time)
                DO UPDATE SET open = $4, high = $5, low = $6, close = $7, volume = $8
                "#,
            )
            .bind(symbol)
            .bind(timeframe)
            .bind(candle.time as i64)
            .bind(candle.open)
            .bind(candle.high)
            .bind(candle.low)
            .bind(candle.close)
            .bind(candle.volume)
            .execute(pool)
            .await;

            if let Err(e) = result {
                tracing::warn!("Failed to cache candle: {}", e);
            }
        }
    }

    pub async fn load_candle_cache(
        &self,
        symbol: &str,
        timeframe: &str,
        start_time: u64,
        end_time: u64,
    ) -> Option<Vec<Candle>> {
        let pool = match &self.db {
            Some(p) => p,
            None => return None,
        };

        let staleness_check = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT MAX(open_time) FROM candle_cache
            WHERE symbol = $1 AND timeframe = $2
            "#,
        )
        .bind(symbol)
        .bind(timeframe)
        .fetch_optional(pool)
        .await;

        if let Ok(Some(max_time)) = staleness_check {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            if now - max_time > 3600 {
                tracing::info!(
                    "Candle cache is stale ({} seconds old), will refetch",
                    now - max_time
                );
                return None;
            }
        }

        let result = sqlx::query_as::<_, (i64, f64, f64, f64, f64, f64)>(
            r#"
            SELECT open_time, open, high, low, close, volume
            FROM candle_cache
            WHERE symbol = $1 AND timeframe = $2
            AND open_time >= $3 AND open_time <= $4
            ORDER BY open_time ASC
            "#,
        )
        .bind(symbol)
        .bind(timeframe)
        .bind(start_time as i64)
        .bind(end_time as i64)
        .fetch_all(pool)
        .await;

        match result {
            Ok(rows) if !rows.is_empty() => {
                let candles: Vec<Candle> = rows
                    .into_iter()
                    .map(|(t, o, h, l, c, v)| Candle {
                        time: t as u64,
                        open: o,
                        high: h,
                        low: l,
                        close: c,
                        volume: v,
                        symbol: symbol.to_string(),
                        is_closed: true,
                    })
                    .collect();
                Some(candles)
            }
            _ => None,
        }
    }
}

pub async fn start_auto_save(
    state_manager: Arc<StateManager>,
    simulator: Arc<SimulatorEngine>,
) {
    let interval_secs = state_manager.auto_save_interval_secs;
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(interval_secs)).await;
        state_manager.save_state(&simulator).await;
    }
}
