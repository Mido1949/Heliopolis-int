-- ═══════════════════════════════════════════════════════
-- MIGRATION: Scrape Targets — scrape_targets table
-- Date: 2026-06-12
-- ═══════════════════════════════════════════════════════

-- ── 1. scrape_targets (scraping queue) ──

CREATE TABLE IF NOT EXISTS scrape_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  requested_by UUID REFERENCES profiles(id),
  last_run_at TIMESTAMPTZ,
  results_count INT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_targets_status ON scrape_targets (status, created_at);

ALTER TABLE scrape_targets ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users
DROP POLICY IF EXISTS "scrape_targets_select" ON scrape_targets;
CREATE POLICY "scrape_targets_select" ON scrape_targets FOR SELECT USING (
  auth.uid() IS NOT NULL
);

-- INSERT: admin, Manager, and Team Leaders
DROP POLICY IF EXISTS "scrape_targets_insert" ON scrape_targets;
CREATE POLICY "scrape_targets_insert" ON scrape_targets FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'Manager', 'CS Team Leader', 'Tech Team Leader')
  )
);

-- UPDATE/DELETE: none for authenticated (service-role only via cron/API routes)
