-- Add episode-related fields to watch_progress table
ALTER TABLE watch_progress ADD COLUMN IF NOT EXISTS series_id VARCHAR(255);
ALTER TABLE watch_progress ADD COLUMN IF NOT EXISTS season_number VARCHAR(50);
ALTER TABLE watch_progress ADD COLUMN IF NOT EXISTS episode_number VARCHAR(50);

-- Create index for faster series lookups
CREATE INDEX IF NOT EXISTS idx_watch_progress_series ON watch_progress(user_id, series_id) WHERE series_id IS NOT NULL;
