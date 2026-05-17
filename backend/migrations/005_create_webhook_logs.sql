CREATE TABLE IF NOT EXISTS webhook_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_config_id TEXT NOT NULL,
    event_type        TEXT NOT NULL,
    payload           JSONB NOT NULL DEFAULT '{}',
    response_status   INTEGER,
    response_body     TEXT,
    error             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
