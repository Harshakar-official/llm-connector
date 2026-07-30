-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Migration 070: scan_findings RLS Policy Fix
-- ═══════════════════════════════════════════════════════════════
-- Migration 001 added SELECT + UPDATE policies for scan_findings,
-- but INSERT and DELETE were missed. The findings DELETE API
-- (app/api/findings/[id]/route.ts) fails silently without a DELETE
-- policy. Workers use pg.Pool (bypass RLS), but frontend reads
-- via Supabase client are subject to RLS.
-- ═══════════════════════════════════════════════════════════════

-- INSERT: Allow admins, program_managers, and security_engineers
-- to insert findings via Supabase client (org-scoped)
CREATE POLICY "scan_findings_insert" ON scan_findings FOR INSERT
  WITH CHECK (
    org_id = my_org_id()
    AND my_role() IN ('admin', 'program_manager', 'security_engineer')
  );

-- DELETE: Allow admins, program_managers, and security_engineers
-- to delete findings within their own org
CREATE POLICY "scan_findings_delete" ON scan_findings FOR DELETE
  USING (
    org_id = my_org_id()
    AND my_role() IN ('admin', 'program_manager', 'security_engineer')
  );