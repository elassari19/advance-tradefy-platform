CREATE TABLE IF NOT EXISTS saved_state (
    id          TEXT NOT NULL,
    state_type  TEXT NOT NULL,
    state_json  JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, state_type)
);
