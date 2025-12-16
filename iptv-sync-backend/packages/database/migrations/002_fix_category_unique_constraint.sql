-- Migration: 002_fix_category_unique_constraint
-- Description: Update categories unique constraint to include type, allowing same category_id for different types
-- Date: 2025-12-13

-- Drop the old unique constraint
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_id_provider_id_category_id_key;

-- Add new unique constraint that includes type (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'categories_user_provider_category_type_unique'
    ) THEN
        ALTER TABLE categories ADD CONSTRAINT categories_user_provider_category_type_unique 
            UNIQUE (user_id, provider_id, category_id, type);
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_categories_provider_type ON categories(provider_id, type);
CREATE INDEX IF NOT EXISTS idx_categories_user_provider ON categories(user_id, provider_id);
