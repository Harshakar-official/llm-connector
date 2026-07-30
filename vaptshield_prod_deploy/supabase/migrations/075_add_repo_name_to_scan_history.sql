-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Migration 075: Add repo_name to scan_history
-- ═══════════════════════════════════════════════════════════════
-- Enables scan_history to store the display-friendly repo name
-- for CI/CD scans, improving scan history listings and SSE streams.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE scan_history
  ADD COLUMN IF NOT EXISTS repo_name TEXT;

-- Add to existing CI/CD scan_history rows (backfill from cicd_configs)
UPDATE scan_history sh
SET repo_name = cc.repo_name
FROM cicd_configs cc
WHERE sh.scan_target = cc.repo_url
  AND sh.scan_type = 'cicd'
  AND sh.repo_name IS NULL;
