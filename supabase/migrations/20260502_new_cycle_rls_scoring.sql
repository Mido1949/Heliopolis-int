-- ════════════════════════════════════════════════════════════════
-- MIGRATION: New assignment cycle + RLS hardening + scoring system
-- Run in: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1. LEADS RLS
--    Team Leaders see ALL leads and can edit.
--    Only Admin/Manager can delete.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select"  ON leads;
DROP POLICY IF EXISTS "leads_update"  ON leads;
DROP POLICY IF EXISTS "leads_delete"  ON leads;
DROP POLICY IF EXISTS "leads_insert"  ON leads;

CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager','CS Team Leader','Tech Team Leader'))
  OR assigned_to_user = auth.uid()
  OR assigned_to       = auth.uid()
);

CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "leads_update" ON leads FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager','CS Team Leader','Tech Team Leader'))
  OR assigned_to_user = auth.uid()
  OR assigned_to       = auth.uid()
);

CREATE POLICY "leads_delete" ON leads FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager'))
);

-- ────────────────────────────────────────────────────────────────
-- 2. BOQs RLS
--    Team Leaders see ALL boqs and can edit.
--    Regular staff see only their own.
--    Only Admin/Manager can delete.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE boqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boqs_select" ON boqs;
DROP POLICY IF EXISTS "boqs_insert" ON boqs;
DROP POLICY IF EXISTS "boqs_update" ON boqs;
DROP POLICY IF EXISTS "boqs_delete" ON boqs;

CREATE POLICY "boqs_select" ON boqs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager','CS Team Leader','Tech Team Leader'))
  OR created_by = auth.uid()
);

CREATE POLICY "boqs_insert" ON boqs FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "boqs_update" ON boqs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager','CS Team Leader','Tech Team Leader'))
  OR created_by = auth.uid()
);

CREATE POLICY "boqs_delete" ON boqs FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager'))
);

-- ────────────────────────────────────────────────────────────────
-- 3. lead_activities: APPEND-ONLY
--    No UPDATE or DELETE policies = enforced at DB level.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view lead activities"    ON lead_activities;
DROP POLICY IF EXISTS "Users can insert their own activities" ON lead_activities;
DROP POLICY IF EXISTS "activities_select"                    ON lead_activities;
DROP POLICY IF EXISTS "activities_insert"                    ON lead_activities;

CREATE POLICY "activities_select" ON lead_activities FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager','CS Team Leader','Tech Team Leader'))
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM leads
    WHERE id = lead_activities.lead_id
      AND (assigned_to_user = auth.uid() OR assigned_to = auth.uid())
  )
);

CREATE POLICY "activities_insert" ON lead_activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policies intentionally → append-only

-- ────────────────────────────────────────────────────────────────
-- 4. Random Tech Team assignment RPC
--    Called by CS Team: picks a random crm_team='tech' member,
--    updates the lead, logs the activity, sends notification.
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_to_tech_team(
  p_lead_id            UUID,
  p_assigning_user_id  UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tech_user_id   UUID;
  v_tech_user_name TEXT;
BEGIN
  SELECT id, name INTO v_tech_user_id, v_tech_user_name
  FROM profiles
  WHERE crm_team = 'tech'
  ORDER BY RANDOM()
  LIMIT 1;

  IF v_tech_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No tech team members available');
  END IF;

  UPDATE leads
  SET assigned_to_user = v_tech_user_id,
      assigned_to_team = 'tech',
      updated_at        = now()
  WHERE id = p_lead_id;

  INSERT INTO lead_activities (lead_id, user_id, type, body)
  VALUES (p_lead_id, p_assigning_user_id, 'assignment',
          'تم التحويل للفريق التقني: ' || v_tech_user_name);

  INSERT INTO notifications (user_id, title, type, reference_id, reference_type)
  VALUES (v_tech_user_id,
          'تم تعيين ليد جديد من الفريق التجاري',
          'lead_assigned', p_lead_id, 'lead');

  RETURN json_build_object(
    'success',          true,
    'assigned_to_name', v_tech_user_name,
    'assigned_to_id',   v_tech_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_to_tech_team(UUID, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- 5. Scoring System
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.score_log (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  points         INTEGER     NOT NULL,
  reason         TEXT,
  reference_id   UUID,
  reference_type TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE score_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "score_log_select" ON score_log;
DROP POLICY IF EXISTS "score_log_insert" ON score_log;

CREATE POLICY "score_log_select" ON score_log FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','Manager'))
);
CREATE POLICY "score_log_insert" ON score_log FOR INSERT WITH CHECK (true);

-- Core scoring helper
CREATE OR REPLACE FUNCTION add_score(
  p_user_id  UUID,
  p_points   INTEGER,
  p_reason   TEXT,
  p_ref_id   UUID  DEFAULT NULL,
  p_ref_type TEXT  DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO score_log (user_id, points, reason, reference_id, reference_type)
  VALUES (p_user_id, p_points, p_reason, p_ref_id, p_ref_type);

  UPDATE profiles
  SET score = COALESCE(score, 0) + p_points
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_score(UUID, INTEGER, TEXT, UUID, TEXT) TO authenticated;

-- Trigger: score on every lead_activities INSERT
CREATE OR REPLACE FUNCTION score_on_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_pts INTEGER; v_rsn TEXT;
BEGIN
  CASE NEW.type
    WHEN 'creation'      THEN v_pts := 5;  v_rsn := 'إضافة ليد جديد';
    WHEN 'call'          THEN v_pts := 3;  v_rsn := 'تسجيل مكالمة';
    WHEN 'status_change' THEN v_pts := 4;  v_rsn := 'تحديث حالة الليد';
    WHEN 'note'          THEN v_pts := 2;  v_rsn := 'ملاحظة / مقايسة';
    WHEN 'assignment'    THEN v_pts := 1;  v_rsn := 'تعيين ليد';
    ELSE                      v_pts := 1;  v_rsn := 'نشاط';
  END CASE;
  PERFORM add_score(NEW.user_id, v_pts, v_rsn, NEW.lead_id, 'lead');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_score_on_activity ON lead_activities;
CREATE TRIGGER tr_score_on_activity
  AFTER INSERT ON lead_activities
  FOR EACH ROW EXECUTE FUNCTION score_on_activity();

-- Trigger: +10 on new BOQ
CREATE OR REPLACE FUNCTION score_on_boq()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    PERFORM add_score(NEW.created_by, 10, 'إنشاء مقايسة جديدة', NEW.id, 'boq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_score_on_boq ON boqs;
CREATE TRIGGER tr_score_on_boq
  AFTER INSERT ON boqs
  FOR EACH ROW EXECUTE FUNCTION score_on_boq();

COMMIT;
