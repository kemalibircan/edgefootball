CREATE TABLE IF NOT EXISTS coupon_library (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    risk_level TEXT,
    source_task_id TEXT,
    items_json JSONB NOT NULL,
    summary_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coupon_library_user_status_created
    ON coupon_library (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coupon_library_user_created
    ON coupon_library (user_id, created_at DESC);
