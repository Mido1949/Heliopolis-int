-- ═══════════════════════════════════════════════════════
-- MIGRATION: BOQ custom (user-named) columns
-- Date: 2026-06-15
-- boqs.custom_columns: [{ "key": "...", "label": "..." }]
-- boq_items.custom_values: { "<key>": "<value>" }
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.boqs ADD COLUMN IF NOT EXISTS custom_columns jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.boq_items ADD COLUMN IF NOT EXISTS custom_values jsonb NOT NULL DEFAULT '{}'::jsonb;
