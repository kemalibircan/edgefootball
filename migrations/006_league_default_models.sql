CREATE TABLE IF NOT EXISTS league_default_models (
    league_id BIGINT PRIMARY KEY,
    model_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    rows_used INT,
    is_degraded BOOLEAN NOT NULL DEFAULT FALSE,
    last_trained_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_league_default_models_status
    ON league_default_models (status);

CREATE INDEX IF NOT EXISTS idx_league_default_models_updated
    ON league_default_models (updated_at DESC);
