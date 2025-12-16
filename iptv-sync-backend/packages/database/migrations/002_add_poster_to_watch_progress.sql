-- Add content_poster column to watch_progress table
ALTER TABLE watch_progress ADD COLUMN IF NOT EXISTS content_poster TEXT;
