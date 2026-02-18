CREATE SEQUENCE IF NOT EXISTS saved_predictions_id_seq;

CREATE TABLE IF NOT EXISTS saved_predictions (
    id BIGINT PRIMARY KEY DEFAULT nextval('saved_predictions_id_seq'),
    fixture_id BIGINT NOT NULL,
    league_id BIGINT,
    fixture_starting_at TIMESTAMPTZ,
    fixture_date DATE,
    home_team_name TEXT,
    away_team_name TEXT,
    match_label TEXT,
    model_id TEXT,
    model_name TEXT,
    prediction_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prediction_date DATE NOT NULL,
    note TEXT,
    simulation_snapshot JSONB NOT NULL,
    ai_snapshot JSONB,
    predicted_home_win DOUBLE PRECISION,
    predicted_draw DOUBLE PRECISION,
    predicted_away_win DOUBLE PRECISION,
    predicted_lambda_home DOUBLE PRECISION,
    predicted_lambda_away DOUBLE PRECISION,
    prediction_outcome TEXT,
    actual_home_goals INT,
    actual_away_goals INT,
    actual_outcome TEXT,
    is_correct BOOLEAN,
    status TEXT NOT NULL DEFAULT 'pending',
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER SEQUENCE saved_predictions_id_seq
    OWNED BY saved_predictions.id;

CREATE INDEX IF NOT EXISTS idx_saved_predictions_prediction_date
    ON saved_predictions (prediction_date DESC, prediction_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_predictions_fixture_id
    ON saved_predictions (fixture_id, prediction_created_at DESC);
