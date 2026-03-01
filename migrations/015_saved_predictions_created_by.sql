-- Add created_by column to saved_predictions table
-- This links predictions to the user who created them

ALTER TABLE saved_predictions 
ADD COLUMN IF NOT EXISTS created_by BIGINT;

-- Create index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_saved_predictions_user_date
ON saved_predictions (created_by, prediction_date DESC, prediction_created_at DESC);

-- Create index for status-based queries (for scheduler)
CREATE INDEX IF NOT EXISTS idx_saved_predictions_status
ON saved_predictions (status, fixture_date);
