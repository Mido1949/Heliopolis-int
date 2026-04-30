-- Migration: 20260418_crm_team_assignment
-- Columns added manually to Supabase; this file documents the change.

-- Add crm_team to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS crm_team TEXT CHECK (crm_team IN ('tech', 'cs'));

-- Add assignment columns to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS assigned_to_team TEXT CHECK (assigned_to_team IN ('tech', 'cs')),
  ADD COLUMN IF NOT EXISTS assigned_to_user UUID REFERENCES profiles(id);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_profiles_crm_team ON profiles(crm_team);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON leads(assigned_to_user);
