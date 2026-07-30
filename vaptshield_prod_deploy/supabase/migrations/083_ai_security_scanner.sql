-- ============================================================================
-- 083_ai_security_scanner.sql
-- AI Security Scanner — scan tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  target_api_key TEXT,
  target_type TEXT NOT NULL DEFAULT 'llm_api'
    CHECK (target_type IN ('llm_api', 'agent_api', 'mcp_server')),
  scan_mode TEXT NOT NULL DEFAULT 'full'
    CHECK (scan_mode IN ('llm_only', 'agent_only', 'full')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  total_probes INT DEFAULT 0,
  probes_completed INT DEFAULT 0,
  vulnerabilities_found INT DEFAULT 0,
  results JSONB,
  summary JSONB,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_security_scans_org
  ON ai_security_scans(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_security_scans_status
  ON ai_security_scans(status);
CREATE INDEX IF NOT EXISTS idx_ai_security_scans_project
  ON ai_security_scans(project_id);

ALTER TABLE ai_security_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_security_scans_select" ON ai_security_scans FOR SELECT
  USING (org_id = my_org_id() AND NOT is_super_admin());

CREATE POLICY "ai_security_scans_insert" ON ai_security_scans FOR INSERT
  WITH CHECK (org_id = my_org_id() AND my_role() IN ('admin', 'security_engineer'));

CREATE POLICY "ai_security_scans_update" ON ai_security_scans FOR UPDATE
  USING (org_id = my_org_id() AND my_role() IN ('admin', 'security_engineer'));

CREATE POLICY "ai_security_scans_delete" ON ai_security_scans FOR DELETE
  USING (org_id = my_org_id() AND my_role() IN ('admin', 'security_engineer'));
