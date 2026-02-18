BEGIN;

DO $$
BEGIN
    IF to_regclass('public.ai_chat_messages') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ai_chat_messages RESTART IDENTITY CASCADE';
    END IF;
    IF to_regclass('public.ai_chat_threads') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ai_chat_threads RESTART IDENTITY CASCADE';
    END IF;
    IF to_regclass('public.coupon_library') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE coupon_library RESTART IDENTITY CASCADE';
    END IF;
    IF to_regclass('public.coupon_generation_runs') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE coupon_generation_runs RESTART IDENTITY CASCADE';
    END IF;
    IF to_regclass('public.payment_notices') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE payment_notices RESTART IDENTITY CASCADE';
    END IF;
    IF to_regclass('public.saved_predictions') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE saved_predictions RESTART IDENTITY CASCADE';
    END IF;
    IF to_regclass('public.credit_transactions') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE credit_transactions RESTART IDENTITY CASCADE';
    END IF;
    IF to_regclass('public.app_users') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE app_users RESTART IDENTITY CASCADE';
    END IF;
END
$$;

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_lower
    ON app_users (LOWER(email));

CREATE TABLE IF NOT EXISTS auth_email_challenges (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    payload_json JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempt_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_email_challenges_lookup
    ON auth_email_challenges (LOWER(email), purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_email_challenges_expires
    ON auth_email_challenges (purpose, expires_at DESC);

COMMIT;
