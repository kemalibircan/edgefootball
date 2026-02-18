CREATE TABLE IF NOT EXISTS fixture_board_cache (
    fixture_id BIGINT PRIMARY KEY,
    league_id BIGINT NOT NULL,
    league_name TEXT,
    event_date DATE NOT NULL,
    starting_at TIMESTAMPTZ,
    status TEXT,
    is_live BOOLEAN NOT NULL DEFAULT FALSE,
    home_team_id BIGINT,
    away_team_id BIGINT,
    home_team_name TEXT,
    away_team_name TEXT,
    home_team_logo TEXT,
    away_team_logo TEXT,
    market_match_result_json JSONB,
    market_first_half_json JSONB,
    market_handicap_json JSONB,
    market_over_under_25_json JSONB,
    market_btts_json JSONB,
    extra_market_count INT NOT NULL DEFAULT 0,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    source_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixture_board_refresh_runs (
    id BIGSERIAL PRIMARY KEY,
    status TEXT NOT NULL,
    requested_by BIGINT,
    trigger_type TEXT NOT NULL DEFAULT 'scheduled',
    date_from DATE,
    date_to DATE,
    league_ids_json JSONB,
    fixtures_upserted INT NOT NULL DEFAULT 0,
    fixtures_seen INT NOT NULL DEFAULT 0,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixture_board_date_league_start
    ON fixture_board_cache (event_date, league_id, starting_at);

CREATE INDEX IF NOT EXISTS idx_fixture_board_league_start
    ON fixture_board_cache (league_id, starting_at);

CREATE INDEX IF NOT EXISTS idx_fixture_board_refresh_runs_created
    ON fixture_board_refresh_runs (created_at DESC);
