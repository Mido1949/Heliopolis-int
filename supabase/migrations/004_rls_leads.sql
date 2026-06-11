-- Migration 4: RLS — CS user isolation on leads
-- Constitution Principle II: CS user must be technically unable to query other users' leads at the DB level

DROP POLICY IF EXISTS "leads_select" ON leads;
DROP POLICY IF EXISTS "leads_access" ON leads;

CREATE POLICY "leads_access" ON leads
FOR ALL TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'Manager', 'Tech Team Leader', 'CS Team Leader')
  OR assigned_to_user = auth.uid()
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'Manager', 'Tech Team Leader', 'CS Team Leader')
  OR assigned_to_user = auth.uid()
);
