-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Migration 085: Fix CI/CD Database Schema Gaps
-- ═══════════════════════════════════════════════════════════════
-- Fixes for D1, D2, D3, D4
-- ═══════════════════════════════════════════════════════════════

-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── D1. processed_webhooks — No Auto-Cleanup ───
-- Unschedule any existing duplicate jobs just in case
SELECT cron.unschedule('cleanup-processed-webhooks');

-- Schedule daily cleanup of processed webhooks older than 7 days
SELECT cron.schedule(
    'cleanup-processed-webhooks',
    '0 0 * * *',
    $$ DELETE FROM public.processed_webhooks WHERE created_at < NOW() - INTERVAL '7 days' $$
);

-- ─── D2. scan_history — No TTL for CI/CD Records ───
-- Clean up old CI/CD records. Keep 30 days for 'free' tier, 90 days for others.
SELECT cron.unschedule('cleanup-cicd-scan-history');

SELECT cron.schedule(
    'cleanup-cicd-scan-history',
    '0 1 * * *',
    $$
    DELETE FROM public.scan_history sh
    USING public.org_quotas oq
    WHERE sh.org_id = oq.org_id
      AND sh.scan_type = 'cicd'
      AND (
        (oq.plan_tier = 'free' AND sh.created_at < NOW() - INTERVAL '30 days')
        OR
        (oq.plan_tier != 'free' AND sh.created_at < NOW() - INTERVAL '90 days')
      );
    $$
);

-- ─── D3. cicd_configs.last_scan_status — No Index ───
CREATE INDEX IF NOT EXISTS idx_cicd_configs_last_scan_status ON cicd_configs(last_scan_status);

-- ─── D4. cicd_configs UNIQUE Constraint Doesn't Cover Branch ───
-- Drop the old constraint
ALTER TABLE cicd_configs DROP CONSTRAINT IF EXISTS cicd_configs_org_id_project_id_repo_url_key;

-- Drop the old index if it was created by the constraint
DROP INDEX IF EXISTS cicd_configs_org_id_project_id_repo_url_key;

-- Create the new unique index covering branch (using COALESCE to handle nulls safely)
CREATE UNIQUE INDEX IF NOT EXISTS cicd_configs_org_project_repo_branch_key 
ON cicd_configs(org_id, project_id, repo_url, COALESCE(branch, 'main'));
