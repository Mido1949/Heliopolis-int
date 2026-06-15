-- ═══════════════════════════════════════════════════════
-- FIX: add_score() never set score_log.action (NOT NULL) — every call failed.
-- score_on_boq() calls it unguarded, so saving a BOQ errored out:
--   "null value in column action of relation score_log violates not-null"
-- Date: 2026-06-15
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_score(
  p_user_id uuid,
  p_points integer,
  p_reason text,
  p_ref_id uuid DEFAULT NULL::uuid,
  p_ref_type text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  INSERT INTO public.score_log (user_id, points, action, reason, reference_id, reference_type)
  VALUES (p_user_id, p_points, COALESCE(p_ref_type, 'activity'), p_reason, p_ref_id, p_ref_type);

  UPDATE public.profiles
  SET score = COALESCE(score, 0) + p_points
  WHERE id = p_user_id;
END;
$func$;
