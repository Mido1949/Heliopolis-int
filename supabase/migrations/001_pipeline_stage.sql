-- Migration 1: Add pipeline_stage fields to leads table
-- Constitution Principle II: Database Safety — additive only, existing columns preserved

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT
    CHECK (pipeline_stage IN (
      'NEW','CONTACTED','ASSIGNED_TECH','QUOTED',
      'FOLLOW_UP','WON','LOST_PRICE','GHOSTED','POSTPONED'
    )),
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stage_timestamps JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_last_contact_date ON leads(last_contact_date);

-- Backfill from old status column
UPDATE leads SET pipeline_stage = CASE status
  WHEN 'New'        THEN 'NEW'
  WHEN 'Interested' THEN 'CONTACTED'
  WHEN 'Quote Sent' THEN 'QUOTED'
  WHEN 'Won'        THEN 'WON'
  WHEN 'Lost'       THEN 'LOST_PRICE'
  ELSE 'NEW'
END
WHERE pipeline_stage IS NULL;
