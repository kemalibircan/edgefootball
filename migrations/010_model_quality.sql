CREATE TABLE IF NOT EXISTS model_evaluations (
    id BIGSERIAL PRIMARY KEY,
    model_id TEXT NOT NULL,
    league_id BIGINT,
    window_from DATE,
    window_to DATE,
    samples INT NOT NULL DEFAULT 0,
    accuracy DOUBLE PRECISION,
    brier DOUBLE PRECISION,
    log_loss DOUBLE PRECISION,
    calibration_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_evaluations_model_created
    ON model_evaluations (model_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_evaluations_league_created
    ON model_evaluations (league_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_build_runs (
    run_id BIGSERIAL PRIMARY KEY,
    source_raw_count INT NOT NULL DEFAULT 0,
    features_written INT NOT NULL DEFAULT 0,
    stale_deleted INT NOT NULL DEFAULT 0,
    schema_version TEXT NOT NULL DEFAULT 'v2',
    status TEXT NOT NULL DEFAULT 'running',
    notes TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feature_build_runs_started
    ON feature_build_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS league_model_rollout (
    league_id BIGINT PRIMARY KEY,
    active_model_id TEXT,
    shadow_model_id TEXT,
    shadow_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percent INT NOT NULL DEFAULT 100,
    rollback_model_id TEXT,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
