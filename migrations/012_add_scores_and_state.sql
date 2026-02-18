-- Add score and state fields to fixture_board_cache for live score display

ALTER TABLE fixture_board_cache ADD COLUMN IF NOT EXISTS home_score INTEGER;
ALTER TABLE fixture_board_cache ADD COLUMN IF NOT EXISTS away_score INTEGER;
ALTER TABLE fixture_board_cache ADD COLUMN IF NOT EXISTS match_state TEXT;
ALTER TABLE fixture_board_cache ADD COLUMN IF NOT EXISTS match_minute INTEGER;
ALTER TABLE fixture_board_cache ADD COLUMN IF NOT EXISTS match_second INTEGER;
ALTER TABLE fixture_board_cache ADD COLUMN IF NOT EXISTS match_added_time INTEGER;

CREATE INDEX IF NOT EXISTS idx_fixture_board_cache_is_live 
    ON fixture_board_cache (is_live) 
    WHERE is_live = TRUE;
