-- Migration 3: Create boq_rooms table (load calculator)
-- Generated columns auto-compute area, heat_factor, required_kw

CREATE TABLE IF NOT EXISTS boq_rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_id        UUID NOT NULL REFERENCES boq(id) ON DELETE CASCADE,
  room_name     TEXT NOT NULL,
  length        NUMERIC NOT NULL,
  width         NUMERIC NOT NULL,
  area          NUMERIC GENERATED ALWAYS AS (length * width) STORED,
  heat_factor   NUMERIC GENERATED ALWAYS AS (length * width * 0.3) STORED,
  required_kw   NUMERIC GENERATED ALWAYS AS (length * width * 0.3) STORED,
  qty           INTEGER DEFAULT 1,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boq_rooms_boq_id ON boq_rooms(boq_id);

ALTER TABLE boq_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boq_rooms_access" ON boq_rooms;
CREATE POLICY "boq_rooms_access" ON boq_rooms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
