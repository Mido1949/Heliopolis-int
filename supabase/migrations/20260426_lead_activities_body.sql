-- supabase/migrations/20260426_lead_activities_body.sql
-- Add body and duration_seconds to lead_activities; expand type constraint

ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE public.lead_activities
  DROP CONSTRAINT IF EXISTS lead_activities_type_check;

ALTER TABLE public.lead_activities
  ADD CONSTRAINT lead_activities_type_check
  CHECK (type IN ('creation', 'status_change', 'edit', 'call', 'note', 'assignment'));