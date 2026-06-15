-- ═══════════════════════════════════════════════════════
-- MIGRATION: allow 'send_email' as an agent_actions.action_type
-- Date: 2026-06-14
-- ═══════════════════════════════════════════════════════

ALTER TABLE agent_actions DROP CONSTRAINT IF EXISTS agent_actions_action_type_check;
ALTER TABLE agent_actions ADD CONSTRAINT agent_actions_action_type_check
  CHECK (action_type IN (
    'assign_lead', 'create_task', 'nudge', 'escalate', 'rebalance',
    'schedule_followup', 'queue_scrape', 'generate_report', 'send_email'
  ));
