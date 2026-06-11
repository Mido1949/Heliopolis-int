-- Migration 2: Create price_list table
-- Read by all authenticated users; write by admin/Tech Team Leader only

CREATE TABLE IF NOT EXISTS price_list (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model        TEXT NOT NULL UNIQUE,
  capacity_kw  NUMERIC NOT NULL,
  description  TEXT,
  price_usd    NUMERIC NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_by   UUID REFERENCES profiles(id)
);

ALTER TABLE price_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_list_read" ON price_list;
CREATE POLICY "price_list_read" ON price_list
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "price_list_write" ON price_list;
CREATE POLICY "price_list_write" ON price_list
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid())
    IN ('admin', 'Tech Team Leader')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid())
    IN ('admin', 'Tech Team Leader')
  );
