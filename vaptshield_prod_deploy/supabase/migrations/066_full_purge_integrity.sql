-- ============================================================
-- VAPTShield Migration 066: Full Purge Integrity (DB Level)
-- Ensures that when a project or finding is deleted, 
-- all associated child records are surgically purged.
-- ============================================================

-- 1. Fix scan_findings -> vulnerabilities (Should CASCADE, not set null)
ALTER TABLE public.scan_findings 
DROP CONSTRAINT IF EXISTS scan_findings_vuln_id_fkey,
ADD CONSTRAINT scan_findings_vuln_id_fkey 
FOREIGN KEY (vuln_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE;

-- 2. Fix scan_queue -> projects (Should CASCADE)
ALTER TABLE public.scan_queue 
DROP CONSTRAINT IF EXISTS scan_queue_project_id_fkey,
ADD CONSTRAINT scan_queue_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 3. Fix scan_history -> projects (Should CASCADE)
ALTER TABLE public.scan_history 
DROP CONSTRAINT IF EXISTS scan_history_project_id_fkey,
ADD CONSTRAINT scan_history_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 4. Fix scan_findings -> projects (Should CASCADE)
ALTER TABLE public.scan_findings 
DROP CONSTRAINT IF EXISTS scan_findings_project_id_fkey,
ADD CONSTRAINT scan_findings_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
