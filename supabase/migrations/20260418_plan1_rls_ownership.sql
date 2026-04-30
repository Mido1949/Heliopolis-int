-- Migration: 20260418_plan1_rls_ownership
-- 1. RLS isolation on leads: staff see only their leads; admin/Manager see all
-- 2. Expand notifications.type constraint to include 'meta_lead' (used by Plan 2)

BEGIN;

-- ── LEADS: ENABLE RLS + SELECT POLICY ────────────────────────────────────

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop any existing select policies with common names
DROP POLICY IF EXISTS "leads_select" ON leads;
DROP POLICY IF EXISTS "leads_read" ON leads;
DROP POLICY IF EXISTS "Enable read access for all users" ON leads;

-- admin and Manager roles see all leads.
-- Staff see leads where they are assigned via either field:
--   assigned_to_user (new system) OR assigned_to (legacy system).
-- Both are checked to avoid data loss during transition.
CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role IN ('admin', 'Manager')
  )
  OR assigned_to_user = auth.uid()
  OR assigned_to = auth.uid()
);

-- ── NOTIFICATIONS: EXPAND TYPE CONSTRAINT ───────────────────────────────────

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'lead_assigned',
    'boq_status',
    'call_logged',
    'low_stock',
    'mention',
    'system',
    'meta_lead'
  ));

COMMIT;
