-- supabase/migrations/20260426_leads_created_by.sql
-- Add created_by column to leads with backfill from assigned_to_user

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- Backfill: set created_by to assigned_to_user for existing leads
UPDATE leads
SET created_by = assigned_to_user
WHERE created_by IS NULL AND assigned_to_user IS NOT NULL;

-- Make column not nullable after backfill (optional if all leads have assignments)
-- ALTER TABLE leads ALTER COLUMN created_by SET NOT NULL;