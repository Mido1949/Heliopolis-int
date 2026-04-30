-- Migration: 20260418_plan2_meta_lead_id
-- 1. Add meta_lead_id (TEXT UNIQUE) to leads for Facebook Lead Ads deduplication.
-- 2. Make assigned_to nullable so webhook-inserted leads can be unassigned initially.
--
-- Run manually in Supabase Dashboard → SQL Editor.
-- Verify: leads table has meta_lead_id column with UNIQUE index.

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS meta_lead_id TEXT UNIQUE;

ALTER TABLE leads
  ALTER COLUMN assigned_to DROP NOT NULL;

COMMIT;
