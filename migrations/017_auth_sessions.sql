-- Auth session table for refresh-token rotation and server-side revocation

CREATE TABLE IF NOT EXISTS auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    client_platform TEXT NOT NULL DEFAULT 'web',
    user_agent TEXT,
    ip_address TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    rotated_from_id BIGINT REFERENCES auth_sessions(id),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
ON auth_sessions (user_id, revoked_at, expires_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_refresh_hash
ON auth_sessions (refresh_token_hash);
