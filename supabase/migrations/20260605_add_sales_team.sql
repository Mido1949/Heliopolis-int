-- Add 'sales' to the allowed values for assigned_to_team
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_to_team_check;
ALTER TABLE leads ADD CONSTRAINT leads_assigned_to_team_check
  CHECK (assigned_to_team IN ('tech', 'cs', 'sales'));
