-- ═══════════════════════════════════════════════════════
-- MIGRATION 1: Idempotency & Rate-Limiting Hardening (feature 004)
-- Date: 2026-06-12
-- Live-schema note: production `notifications` is the multi-tenant shape
-- (title/body/type/is_read/reference_id/reference_type/org_id) — `type`
-- already exists there; the ADD COLUMN below is for fresh environments only.
-- ═══════════════════════════════════════════════════════

-- ── 1. notifications.type + dedup index (reference_id, NOT lead_id) ──

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_type_ref
  ON notifications (type, reference_id, created_at);

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
