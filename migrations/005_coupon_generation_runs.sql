CREATE TABLE IF NOT EXISTS coupon_generation_runs (
    id BIGSERIAL PRIMARY KEY,
    task_id TEXT UNIQUE,
    user_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    request_json JSONB NOT NULL,
    result_json JSONB,
    credit_charged INT NOT NULL DEFAULT 0,
    credit_refunded BOOLEAN NOT NULL DEFAULT FALSE,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_runs_user_created
    ON coupon_generation_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coupon_runs_task_id
    ON coupon_generation_runs (task_id);

CREATE INDEX IF NOT EXISTS idx_coupon_runs_expires_at
    ON coupon_generation_runs (expires_at);
