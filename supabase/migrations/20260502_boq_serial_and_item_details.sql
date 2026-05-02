-- BOQ Serial Number Sequence (global, cross-user, starts at 1001)
CREATE SEQUENCE IF NOT EXISTS boq_serial_seq START WITH 1001 INCREMENT BY 1;

-- Add serial column to boqs
ALTER TABLE public.boqs
  ADD COLUMN IF NOT EXISTS boq_serial INTEGER;

-- Atomic function to get next BOQ serial
CREATE OR REPLACE FUNCTION get_next_boq_serial()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN nextval('boq_serial_seq');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_boq_serial() TO authenticated;

-- Add item detail fields to boq_items (matching commercial offer columns)
ALTER TABLE public.boq_items
  ADD COLUMN IF NOT EXISTS location   TEXT,
  ADD COLUMN IF NOT EXISTS floor      TEXT,
  ADD COLUMN IF NOT EXISTS area       DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS unit_type  TEXT,
  ADD COLUMN IF NOT EXISTS capacity_kw DECIMAL(6,2);
