-- Daily Tasks: leads requiring attention based on follow-up dates or inactivity
-- Migration: 20260426_get_daily_tasks.sql

CREATE OR REPLACE FUNCTION public.get_daily_tasks(p_user_id UUID DEFAULT NULL)
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
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_tasks(UUID) TO authenticated;