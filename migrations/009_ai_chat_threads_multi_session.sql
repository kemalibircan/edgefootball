ALTER TABLE ai_chat_threads
    DROP CONSTRAINT IF EXISTS ai_chat_threads_user_id_fixture_id_key;

DROP INDEX IF EXISTS idx_ai_chat_threads_user_fixture_unique;

CREATE INDEX IF NOT EXISTS idx_ai_chat_threads_user_fixture_last_message
    ON ai_chat_threads (user_id, fixture_id, last_message_at DESC, id DESC);
