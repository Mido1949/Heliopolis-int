-- ═══════════════════════════════════════════════════════
-- MIGRATION: Agent Command Center — agent_actions + agent_settings
-- Date: 2026-06-12
-- ═══════════════════════════════════════════════════════

-- ── 1. agent_actions (audit log) ──

CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'assign_lead', 'create_task', 'nudge', 'escalate', 'rebalance',
    'schedule_followup', 'queue_scrape', 'generate_report'
  )),
  origin TEXT NOT NULL CHECK (origin IN ('chat', 'autonomous')),
  target_lead_id UUID REFERENCES leads(id),
  target_user_id UUID REFERENCES profiles(id),
  task_id UUID,
  reasoning TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at TIMESTAMPTZ,
  undone_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_created ON agent_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_target ON agent_actions (action_type, target_lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_actions_task ON agent_actions (task_id);

ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, Manager, and Team Leaders see all
CREATE POLICY "agent_actions_select" ON agent_actions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'Manager', 'CS Team Leader', 'Tech Team Leader')
  )
);

-- INSERT/UPDATE: none for authenticated (service-role only via API routes)

-- ── 2. agent_settings (singleton config) ──

CREATE TABLE IF NOT EXISTS agent_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  autonomy_paused BOOLEAN NOT NULL DEFAULT false,
  stuck_threshold_days INT NOT NULL DEFAULT 3 CHECK (stuck_threshold_days >= 1 AND stuck_threshold_days <= 30),
  nudge_suppression_hours INT NOT NULL DEFAULT 24 CHECK (nudge_suppression_hours >= 1 AND nudge_suppression_hours <= 168),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

INSERT INTO agent_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE agent_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: admin and team leaders
CREATE POLICY "agent_settings_select" ON agent_settings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'Manager', 'CS Team Leader', 'Tech Team Leader')
  )
);

-- UPDATE: admin only
CREATE POLICY "agent_settings_update" ON agent_settings FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);
