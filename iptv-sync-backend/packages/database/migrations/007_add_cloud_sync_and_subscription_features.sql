-- Migration: 007_add_cloud_sync_and_subscription_features
-- Description: Add cloud sync and subscription feature toggles for TV users
-- Date: 2025-12-19

-- Add cloud sync and subscription enabled flags to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS cloud_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_enabled BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN users.cloud_enabled IS 'Whether user has enabled cloud sync for their TV device';
COMMENT ON COLUMN users.subscription_enabled IS 'Whether user has access to subtitle features';

-- Create index for faster lookup of cloud-enabled users
CREATE INDEX IF NOT EXISTS idx_users_cloud_enabled ON users(cloud_enabled) WHERE cloud_enabled = true;
