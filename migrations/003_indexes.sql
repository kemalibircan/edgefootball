-- Optimize common filters and sorting for training and predictions

CREATE INDEX IF NOT EXISTS idx_features_event_date
  ON features (event_date);

CREATE INDEX IF NOT EXISTS idx_saved_predictions_fixture_date
  ON saved_predictions (fixture_date);

CREATE INDEX IF NOT EXISTS idx_saved_predictions_league_status
  ON saved_predictions (league_id, status);

CREATE INDEX IF NOT EXISTS idx_saved_predictions_model_id
  ON saved_predictions (model_id);

