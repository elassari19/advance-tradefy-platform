CREATE TABLE IF NOT EXISTS candle_cache (
    symbol      TEXT NOT NULL,
    timeframe   TEXT NOT NULL,
    open_time   BIGINT NOT NULL,
    open        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    high        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    low         DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    close       DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    volume      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (symbol, timeframe, open_time)
);

CREATE INDEX IF NOT EXISTS idx_candle_cache_lookup
    ON candle_cache (symbol, timeframe, open_time DESC);
