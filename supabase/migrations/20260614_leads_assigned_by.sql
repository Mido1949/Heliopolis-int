-- ═══════════════════════════════════════════════════════
-- MIGRATION: leads.assigned_by — track who assigned the current holder
-- Date: 2026-06-14
-- Enables the "return to sender" rule: when the current assignee bounces a
-- lead, it goes back to whoever assigned it to them.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id);
