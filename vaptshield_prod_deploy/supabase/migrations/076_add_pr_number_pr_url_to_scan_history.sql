-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Migration 076: Add pr_number and pr_url to scan_history
-- ═══════════════════════════════════════════════════════════════
-- The webhook route (app/api/cicd/webhook/route.ts) inserts
-- pr_number and pr_url columns into scan_history for PR-triggered
-- scans, but these columns were never created by a migration.
-- This caused every PR webhook to fail with a PostgreSQL error.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE scan_history
  ADD COLUMN IF NOT EXISTS pr_number INTEGER,
  ADD COLUMN IF NOT EXISTS pr_url TEXT;

-- Add index for efficient lookup of scans by PR number
CREATE INDEX IF NOT EXISTS idx_scan_history_pr_number
  ON scan_history(pr_number) WHERE pr_number IS NOT NULL;
