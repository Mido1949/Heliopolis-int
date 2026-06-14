-- ═══════════════════════════════════════════════════════
-- MIGRATION: Widen notifications.type CHECK to include
-- all types used by Helio command-center features.
-- Date: 2026-06-14
-- (Additive: only relaxes the allowed-values check; no data change.)
-- ═══════════════════════════════════════════════════════

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    -- existing
    'lead_assigned', 'boq_status', 'call_logged', 'low_stock', 'mention', 'system', 'meta_lead',
    -- Helio command center
    'stuck_lead', 'lead_intake', 'assignment', 'nudge', 'escalation',
    'personal_report', 'company_report_sent', 'agent_digest', 'scrape_summary', 'general'
  ])
);
