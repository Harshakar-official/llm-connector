-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Fix Scan Findings FK (Migration 024)
-- Goal: Allow deleting vulnerabilities that were created from scans.
-- ═══════════════════════════════════════════════════════════════

alter table public.scan_findings
drop constraint if exists scan_findings_vuln_id_fkey,
add constraint scan_findings_vuln_id_fkey 
  foreign key (vuln_id) 
  references public.vulnerabilities(id) 
  on delete set null;
