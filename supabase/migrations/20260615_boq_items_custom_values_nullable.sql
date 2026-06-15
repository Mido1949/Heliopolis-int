-- ═══════════════════════════════════════════════════════
-- FIX: boq_items.custom_values NOT NULL broke batch inserts.
-- PostgREST bulk-insert takes the UNION of keys across rows and sends explicit
-- NULL for rows missing a key (e.g. the Y-Branch row), overriding the DEFAULT
-- and violating NOT NULL. Make it nullable; app reads handle null/{}.
-- Date: 2026-06-15
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.boq_items ALTER COLUMN custom_values DROP NOT NULL;
