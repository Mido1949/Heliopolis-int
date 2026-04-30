-- Update profiles role check constraint to include 'Call Center'
-- Migration: 20260416_update_profiles_role_constraint

BEGIN;

-- Drop the existing check constraint (handle various possible naming conventions)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check_constraint;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_constraint;

-- Add the new constraint with 'Call Center' allowed
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'Sales Engineer', 'Manager', 'Telesales', 'Call Center', 'user'));

COMMIT;