-- Migration: 004_add_favorites_and_watch_history
-- Description: Add favorites and watch history tables for enhanced user experience
-- Date: 2025-12-15

-- Favorites table
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('CHANNEL', 'MOVIE', 'SERIES', 'EPISODE')),
    content_id VARCHAR(255) NOT NULL,
    content_name VARCHAR(255) NOT NULL,
    content_poster TEXT,
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, content_type, content_id)
);

-- Watch History table
CREATE TABLE watch_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('CHANNEL', 'MOVIE', 'SERIES', 'EPISODE')),
    content_id VARCHAR(255) NOT NULL,
    content_name VARCHAR(255) NOT NULL,
    content_poster TEXT,
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    
    -- For series episodes
    series_id VARCHAR(255),
    series_name VARCHAR(255),
    season_number INTEGER,
    episode_number INTEGER,
    
    -- Watch details
    duration BIGINT,
    watched_duration BIGINT,
    completed BOOLEAN DEFAULT false,
    watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add parental_pin to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'parental_pin'
    ) THEN
        ALTER TABLE users ADD COLUMN parental_pin VARCHAR(255);
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_content ON favorites(content_type, content_id);
CREATE INDEX idx_favorites_created ON favorites(created_at);

CREATE INDEX idx_watch_history_user ON watch_history(user_id);
CREATE INDEX idx_watch_history_content ON watch_history(content_type, content_id);
CREATE INDEX idx_watch_history_watched ON watch_history(watched_at);
CREATE INDEX idx_watch_history_series ON watch_history(series_id) WHERE series_id IS NOT NULL;

-- Apply updated_at trigger to watch_history
CREATE TRIGGER update_watch_history_updated_at BEFORE UPDATE ON watch_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE favorites IS 'User favorites for movies, series, and channels';
COMMENT ON TABLE watch_history IS 'Complete watch history for all content types';
COMMENT ON COLUMN users.parental_pin IS 'Encrypted PIN for parental controls (censored categories)';
