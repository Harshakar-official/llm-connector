-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Migration 069: CI/CD Scanner Tables & Enhancements
-- ═══════════════════════════════════════════════════════════════
-- Implements the backend schema for CI/CD GitHub integration.
-- Allows Vercel (Next.js) to store repository configurations
-- securely and orchestrate scanner workloads to the Docker node.
-- ═══════════════════════════════════════════════════════════════

-- 1. Extend scan_history for CI/CD tracking
ALTER TABLE scan_history
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS commit_hash TEXT;

-- Safely update scan_type constraints
ALTER TABLE scan_history DROP CONSTRAINT IF EXISTS scan_history_scan_type_check;
ALTER TABLE scan_history ADD CONSTRAINT scan_history_scan_type_check 
  CHECK (scan_type IN ('zap','kali','semgrep','trivy','gitleaks','manual','cicd'));

-- 2. Create CI/CD Configurations Table
CREATE TABLE IF NOT EXISTS cicd_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  repo_url TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_owner TEXT,
  branch TEXT DEFAULT 'main',
  webhook_secret TEXT NOT NULL,
  encrypted_pat TEXT, -- AES-256-GCM encrypted GitHub PAT (can be null for public repos)
  is_active BOOLEAN DEFAULT true,
  last_scan_at TIMESTAMPTZ,
  last_scan_status TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, project_id, repo_url) -- Prevent duplicate configs for same repo in same project
);

CREATE INDEX IF NOT EXISTS idx_cicd_configs_org ON cicd_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_cicd_configs_project ON cicd_configs(project_id);

-- 3. Row Level Security (Strict Org/Role Isolation)
ALTER TABLE cicd_configs ENABLE ROW LEVEL SECURITY;

-- Admins and Security Engineers can manage configs
CREATE POLICY "cicd_configs_select" ON cicd_configs FOR SELECT
  USING (org_id = my_org_id() AND NOT is_super_admin());

CREATE POLICY "cicd_configs_insert" ON cicd_configs FOR INSERT
  WITH CHECK (org_id = my_org_id() AND my_role() IN ('admin', 'security_engineer'));

CREATE POLICY "cicd_configs_update" ON cicd_configs FOR UPDATE
  USING (org_id = my_org_id() AND my_role() IN ('admin', 'security_engineer'));

CREATE POLICY "cicd_configs_delete" ON cicd_configs FOR DELETE
  USING (org_id = my_org_id() AND my_role() IN ('admin', 'security_engineer'));

-- 4. Triggers
CREATE TRIGGER trg_cicd_configs_updated BEFORE UPDATE ON cicd_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE cicd_configs;
