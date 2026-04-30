-- Fix 1: Update get_daily_tasks to:
--   a) Accept nullable p_user_id (DEFAULT NULL)
--   b) Exclude leads that were updated within the last 24 hours
--      (so editing a lead removes it from the daily list)
-- Fix 2: Add performance indexes for daily tasks query and lead activities

-- ── Updated get_daily_tasks function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_daily_tasks(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  next_follow_up TIMESTAMPTZ,
  status TEXT,
  reason TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT ON (l.id)
    l.id,
    l.name,
    l.next_follow_up,
    l.status,
    CASE
      WHEN l.next_follow_up IS NOT NULL AND l.next_follow_up <= now() THEN 'overdue'
      ELSE 'no_activity'
    END AS reason
  FROM leads l
  WHERE (p_user_id IS NULL OR l.assigned_to_user = p_user_id)
    AND l.status NOT IN ('Won', 'Lost')
    -- Exclude leads touched (updated) within the last 24 hours
    AND (l.updated_at IS NULL OR l.updated_at < now() - INTERVAL '24 hours')
    AND (
      (l.next_follow_up IS NOT NULL AND l.next_follow_up <= now())
      OR (
        NOT EXISTS (
          SELECT 1 FROM lead_activities la
          WHERE la.lead_id = l.id
            AND la.created_at > now() - INTERVAL '24 hours'
        )
      )
    )
  ORDER BY l.id, l.next_follow_up ASC NULLS LAST
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_tasks(UUID) TO authenticated;

-- ── Performance indexes ─────────────────────────────────────────────────────

-- Speeds up the daily tasks query (leads by user + status + follow-up)
CREATE INDEX IF NOT EXISTS idx_leads_daily_tasks
  ON public.leads (assigned_to_user, status, next_follow_up, updated_at)
  WHERE status NOT IN ('Won', 'Lost');

-- Speeds up the NOT EXISTS subquery in get_daily_tasks
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created
  ON public.lead_activities (lead_id, created_at DESC);

-- Speeds up sidebar badge count query (tasks by assigned_to + status)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status
  ON public.tasks (assigned_to, status);
