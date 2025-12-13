-- Migration: 003_remove_duplicate_provider_id
-- Description: Remove redundant provider_id from providers table, it should only have id
-- Date: 2025-12-13

-- The providers table currently has both:
-- - id (UUID, primary key)
-- - provider_id (VARCHAR, part of unique constraint)
-- 
-- This is redundant. We should only use 'id' as the primary identifier.
-- However, we need to keep provider_id for now as it's used as a business identifier
-- from the client apps. The real fix should be to update the client apps to use
-- the UUID id instead.

-- For now, let's just fix the ON CONFLICT issue by ensuring the constraint matches
-- This migration documents the issue for future cleanup.

-- No changes needed to schema at this time.
-- The fix is in the application code to use the correct ON CONFLICT clause.
