-- Migration: 005_add_channel_analytics_and_category_favorites
-- Description: Add channel play tracking, category favorites, and auto-start settings
-- Date: 2025-12-15

-- Channel analytics table for tracking play counts and stats
CREATE TABLE IF NOT EXISTS channel_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
    channel_id VARCHAR(255) NOT NULL,
    channel_name VARCHAR(255) NOT NULL,
    channel_logo TEXT,
    category_id VARCHAR(255),
    category_name VARCHAR(255),
    
    -- Analytics data
    play_count INTEGER DEFAULT 0,
    total_watch_time BIGINT DEFAULT 0, -- in seconds
    last_watched_at TIMESTAMP WITH TIME ZONE,
    first_watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Channel metadata
    channel_cmd TEXT,
    channel_number INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (user_id, provider_id, channel_id)
);

-- Update favorites to support CATEGORY type
ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_content_type_check;
ALTER TABLE favorites ADD CONSTRAINT favorites_content_type_check 
    CHECK (content_type IN ('CHANNEL', 'MOVIE', 'SERIES', 'EPISODE', 'CATEGORY'));

-- Add metadata fields to favorites for better tracking
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMP WITH TIME ZONE;

-- User settings table for auto-start and preferences
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    -- Auto-start settings
    auto_start_enabled BOOLEAN DEFAULT false,
    auto_start_type VARCHAR(50) CHECK (auto_start_type IN ('CHANNEL', 'CATEGORY', 'MOST_PLAYED')),
    auto_start_channel_id VARCHAR(255),
    auto_start_category_id VARCHAR(255),
    
    -- Other preferences
    preferences JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_channel_analytics_user ON channel_analytics(user_id);
CREATE INDEX idx_channel_analytics_channel ON channel_analytics(channel_id);
CREATE INDEX idx_channel_analytics_play_count ON channel_analytics(play_count DESC);
CREATE INDEX idx_channel_analytics_last_watched ON channel_analytics(last_watched_at DESC);
CREATE INDEX idx_channel_analytics_user_provider ON channel_analytics(user_id, provider_id);

CREATE INDEX idx_favorites_metadata ON favorites USING GIN(metadata);
CREATE INDEX idx_favorites_play_count ON favorites(play_count DESC);
CREATE INDEX idx_favorites_type ON favorites(content_type);

CREATE INDEX idx_user_settings_user ON user_settings(user_id);
CREATE INDEX idx_user_settings_auto_start ON user_settings(auto_start_enabled, auto_start_type);

-- Apply updated_at triggers
CREATE TRIGGER update_channel_analytics_updated_at BEFORE UPDATE ON channel_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE channel_analytics IS 'Track channel play counts and watch time for analytics and recommendations';
COMMENT ON TABLE user_settings IS 'User preferences including auto-start configuration for dashboard';
COMMENT ON COLUMN favorites.metadata IS 'Additional metadata (logo, cmd, category info, etc.) stored as JSON';
COMMENT ON COLUMN favorites.play_count IS 'Number of times this favorite has been played';
COMMENT ON COLUMN channel_analytics.play_count IS 'Total number of times channel has been played';
COMMENT ON COLUMN channel_analytics.total_watch_time IS 'Total watch time in seconds';
