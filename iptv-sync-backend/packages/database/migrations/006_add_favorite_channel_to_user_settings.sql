-- Add favorite_channel_id column to user_settings table
-- This allows users to select one favorite channel to display on the home page

ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS favorite_channel_id VARCHAR(255);

COMMENT ON COLUMN user_settings.favorite_channel_id IS 'User selected favorite channel to display on home page';
