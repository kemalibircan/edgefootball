CREATE TABLE IF NOT EXISTS raw_fixtures (
    fixture_id BIGINT PRIMARY KEY,
    payload JSONB NOT NULL,
    ingested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS features (
    fixture_id BIGINT PRIMARY KEY,
    home_team_id BIGINT NOT NULL,
    away_team_id BIGINT NOT NULL,
    feature_vector JSONB NOT NULL,
    label_home_goals INT,
    label_away_goals INT,
    event_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_registry (
    name TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    path TEXT NOT NULL,
    metrics JSONB,
    trained_at TIMESTAMPTZ DEFAULT NOW()
);
