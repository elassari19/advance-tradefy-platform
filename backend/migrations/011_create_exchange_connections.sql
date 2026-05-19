CREATE TABLE IF NOT EXISTS exchange_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id     TEXT NOT NULL,
    connection_name TEXT NOT NULL DEFAULT '',
    api_key         TEXT NOT NULL DEFAULT '',
    secret_key      TEXT NOT NULL DEFAULT '',
    is_testnet      BOOLEAN NOT NULL DEFAULT false,
    status          TEXT NOT NULL DEFAULT 'unknown',
    last_tested_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
