BEGIN;

-- Add form_id to leads so Meta webhook can store the FB form identifier
ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_id TEXT;

-- Sales Targets table
CREATE TABLE IF NOT EXISTS sales_targets (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  target_type  TEXT CHECK (target_type IN ('leads', 'revenue')) NOT NULL,
  target_value NUMERIC NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage targets" ON sales_targets
  FOR ALL
  USING  (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

CREATE POLICY "Users see own targets" ON sales_targets
  FOR SELECT
  USING (auth.uid() = user_id);

COMMIT;
