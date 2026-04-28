-- ═══════════════════════════════════════════════════════
-- MIGRATION: Team Leader Roles + User Isolation + Daily Report
-- Date: 2026-04-28
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── 1. Add CS Team Leader & Tech Team Leader to profiles role constraint ──

-- Drop old constraint first
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Normalize any role values that aren't in our target list
-- (maps unknown roles to 'Sales Engineer' as a safe default)
UPDATE profiles
SET role = 'Sales Engineer'
WHERE role NOT IN (
  'admin', 'Sales Engineer', 'Manager',
  'Telesales', 'Call Center', 'user',
  'CS Team Leader', 'Tech Team Leader'
);

-- Now add the constraint (all rows are clean)
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin',
    'Sales Engineer',
    'Manager',
    'Telesales',
    'Call Center',
    'user',
    'CS Team Leader',
    'Tech Team Leader'
  ));

-- ── 2. Assign team leaders by email ──
UPDATE profiles SET role = 'CS Team Leader'   WHERE email = 'mona@hc.com';
UPDATE profiles SET role = 'Tech Team Leader' WHERE email = 'ragaa@hc.com';

-- ── 3. Leads RLS: each user sees only their assigned leads ──
--    Admins, Managers, and Team Leaders see everything
DROP POLICY IF EXISTS "leads_select" ON leads;

CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  assigned_to = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'Manager', 'CS Team Leader', 'Tech Team Leader')
  )
);

-- ── 4. Daily Activity Report RPC ──
--    Returns per-user activity counts for a given date (defaults to today)
--    Columns: user_id, user_name, user_role,
--             leads_created, updates_done, calls_made, boqs_created
CREATE OR REPLACE FUNCTION get_daily_activity_report(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  user_id     UUID,
  user_name   TEXT,
  user_role   TEXT,
  leads_created  INTEGER,
  updates_done   INTEGER,
  calls_made     INTEGER,
  boqs_created   INTEGER
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.id                                                                          AS user_id,
    p.name                                                                        AS user_name,
    p.role                                                                        AS user_role,
    -- Leads created by this user today (via lead_activities type='creation')
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM lead_activities la
      WHERE la.user_id = p.id
        AND la.type = 'creation'
        AND la.created_at::DATE = p_date
    ), 0)                                                                         AS leads_created,
    -- Status changes / notes / edits today
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM lead_activities la
      WHERE la.user_id = p.id
        AND la.type IN ('status_change', 'note_added', 'edit')
        AND la.created_at::DATE = p_date
    ), 0)                                                                         AS updates_done,
    -- Calls logged today
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM call_logs cl
      WHERE cl.created_by = p.id
        AND cl.created_at::DATE = p_date
    ), 0)                                                                         AS calls_made,
    -- BOQs created today
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM boqs b
      WHERE b.created_by = p.id
        AND b.created_at::DATE = p_date
    ), 0)                                                                         AS boqs_created
  FROM profiles p
  WHERE p.role != 'admin'
  ORDER BY
    (
      COALESCE((SELECT COUNT(*) FROM lead_activities la WHERE la.user_id = p.id AND la.created_at::DATE = p_date), 0)
      + COALESCE((SELECT COUNT(*) FROM call_logs cl WHERE cl.created_by = p.id AND cl.created_at::DATE = p_date), 0)
      + COALESCE((SELECT COUNT(*) FROM boqs b WHERE b.created_by = p.id AND b.created_at::DATE = p_date), 0)
    ) DESC,
    p.name ASC;
$$;
