-- ============================================================================
-- 084_zap_scan_tables_schema.sql
-- Bring out-of-band created tables (zap_tasks, pending_alerts, scan_queue)
-- into version control. These tables already exist in production — all
-- statements use IF NOT EXISTS so this migration is idempotent.
-- ============================================================================

-- ─── zap_tasks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zap_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  target_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  container_id TEXT,
  scan_config JSONB,
  error_message TEXT,
  started_by UUID REFERENCES profiles(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  progress INT DEFAULT 0,
  progress_detail JSONB
);

CREATE INDEX IF NOT EXISTS idx_zap_tasks_org_status
  ON zap_tasks (org_id, status);
CREATE INDEX IF NOT EXISTS idx_zap_tasks_org_created
  ON zap_tasks (org_id, created_at DESC);

-- ─── pending_alerts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES zap_tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  alert_name TEXT NOT NULL,
  severity TEXT NOT NULL
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational')),
  url TEXT,
  payload TEXT,
  description TEXT,
  raw_data JSONB,
  ai_normalized JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  vuln_id UUID,
  http_request JSONB,
  http_response JSONB,
  issue_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  endpoint TEXT,
  confidence TEXT,
  cweid TEXT,
  attack TEXT,
  param TEXT,
  riskcode TEXT,
  evidence TEXT,
  solution TEXT,
  reference TEXT,
  other TEXT,
  wascid TEXT,
  method TEXT,
  statuscode INT,
  parameters JSONB
);

CREATE INDEX IF NOT EXISTS idx_pending_alerts_task
  ON pending_alerts (task_id);
CREATE INDEX IF NOT EXISTS idx_pending_alerts_status
  ON pending_alerts (org_id, status);

-- ─── scan_queue ─────────────────────────────────────────────────────────────
-- Dead/unused table (no app code references it) but kept for schema completeness.
CREATE TABLE IF NOT EXISTS scan_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  user_id UUID,
  project_id UUID,
  scan_type TEXT NOT NULL
    CHECK (scan_type IN ('zap', 'kali', 'semgrep', 'trivy', 'gitleaks')),
  scan_config JSONB NOT NULL,
  status TEXT DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  queue_position INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for scan_queue (matches production: org-scoped select + insert)
ALTER TABLE scan_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY IF NOT EXISTS scan_queue_select ON scan_queue
    FOR SELECT USING (org_id = my_org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY IF NOT EXISTS scan_queue_insert ON scan_queue
    FOR INSERT WITH CHECK (
      org_id = my_org_id()
      AND my_role() = ANY (ARRAY['admin', 'security_engineer'])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
