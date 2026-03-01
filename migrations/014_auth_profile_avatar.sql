BEGIN;

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS avatar_key TEXT;

UPDATE app_users
SET avatar_key = 'open_peeps_01'
WHERE avatar_key IS NULL OR LENGTH(TRIM(avatar_key)) = 0;

ALTER TABLE app_users
    ALTER COLUMN avatar_key SET DEFAULT 'open_peeps_01';

ALTER TABLE app_users
    ALTER COLUMN avatar_key SET NOT NULL;

COMMIT;
