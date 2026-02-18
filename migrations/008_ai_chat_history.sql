CREATE TABLE IF NOT EXISTS ai_chat_threads (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    fixture_id BIGINT NOT NULL,
    home_team_name TEXT,
    away_team_name TEXT,
    match_label TEXT NOT NULL,
    last_message_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, fixture_id)
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    thread_id BIGINT NOT NULL REFERENCES ai_chat_threads(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content_markdown TEXT NOT NULL,
    meta_json JSONB,
    credit_charged INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_user_last_message
    ON ai_chat_threads (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_thread_created
    ON ai_chat_messages (thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_user_created
    ON ai_chat_messages (user_id, created_at DESC);
