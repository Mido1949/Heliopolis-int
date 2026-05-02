-- Random CS Team assignment (mirror of assign_to_tech_team)

CREATE OR REPLACE FUNCTION assign_to_cs_team(
  p_lead_id            UUID,
  p_assigning_user_id  UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cs_user_id   UUID;
  v_cs_user_name TEXT;
BEGIN
  SELECT id, name INTO v_cs_user_id, v_cs_user_name
  FROM profiles
  WHERE crm_team = 'cs'
  ORDER BY RANDOM()
  LIMIT 1;

  IF v_cs_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No CS team members available');
  END IF;

  UPDATE leads
  SET assigned_to_user = v_cs_user_id,
      assigned_to_team = 'cs',
      updated_at        = now()
  WHERE id = p_lead_id;

  INSERT INTO lead_activities (lead_id, user_id, type, body)
  VALUES (p_lead_id, p_assigning_user_id, 'assignment',
          'تم التحويل للفريق التجاري: ' || v_cs_user_name);

  INSERT INTO notifications (user_id, title, type, reference_id, reference_type)
  VALUES (v_cs_user_id,
          'تم تعيين ليد جديد من الفريق التقني',
          'lead_assigned', p_lead_id, 'lead');

  RETURN json_build_object(
    'success',          true,
    'assigned_to_name', v_cs_user_name,
    'assigned_to_id',   v_cs_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_to_cs_team(UUID, UUID) TO authenticated;
