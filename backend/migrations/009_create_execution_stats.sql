CREATE TABLE IF NOT EXISTS execution_stats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      TEXT NOT NULL,
    timeframe   TEXT NOT NULL DEFAULT '',
    avg_ms      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    max_ms      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    min_ms      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    count       INTEGER NOT NULL DEFAULT 0,
    threshold_exceeded BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
