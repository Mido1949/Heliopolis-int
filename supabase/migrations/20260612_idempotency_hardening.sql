-- ═══════════════════════════════════════════════════════
-- MIGRATION 1: Idempotency & Rate-Limiting Hardening
-- Date: 2026-06-12
-- ═══════════════════════════════════════════════════════

-- ── 1. notifications.type column + index ──

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type_lead
  ON notifications (type, lead_id, created_at);

-- ── 2. tasks.auto_created column + index ──

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_auto_lead
  ON tasks (lead_id, auto_created, status);

-- ── 3. agent_requests table (rate limiting) ──

CREATE TABLE IF NOT EXISTS agent_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_requests_user_time
  ON agent_requests (user_id, created_at);

ALTER TABLE agent_requests ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated users — service-role only (internal counter).
