BEGIN;

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_google_sub
    ON app_users (google_sub)
    WHERE google_sub IS NOT NULL;

COMMIT;
