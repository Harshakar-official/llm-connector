-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Testing Quota Override + pending_alerts fix (078)
-- ═══════════════════════════════════════════════════════════════
-- Sets max_docker_containers to 50 for all orgs so testing
-- is never blocked by quota limits.
-- Also adds vuln_id + approved_at columns for approve→link flow.
--
-- HOW TO REVERT:
--   UPDATE org_quotas SET max_docker_containers = NULL;
--   ALTER TABLE pending_alerts DROP COLUMN IF EXISTS vuln_id;
--   ALTER TABLE pending_alerts DROP COLUMN IF EXISTS approved_at;
-- ═══════════════════════════════════════════════════════════════

-- Override: set hard limit to 50 for all orgs
UPDATE org_quotas
SET max_docker_containers = 50;

-- Also ensure no stale sessions inflate the active counter
UPDATE org_quotas
SET active_docker_containers = (
  SELECT COUNT(*) FROM docker_sessions
  WHERE docker_sessions.org_id = org_quotas.org_id
    AND status IN ('starting', 'running', 'idle')
);

-- Add vuln_id and approved_at to pending_alerts for the approve→link flow
ALTER TABLE pending_alerts
ADD COLUMN IF NOT EXISTS vuln_id uuid REFERENCES vulnerabilities(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at timestamptz;
