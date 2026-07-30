-- ============================================================
-- VAPTShield Migration 064: Expand Vulnerability Update Policy
-- Allows 'developer' role to perform updates on vulnerabilities
-- assigned to them. The 'tr_developer_update_guard' trigger
-- will still enforce field-level restrictions (no metadata edits).
-- ============================================================

DROP POLICY IF EXISTS "vulns_update_privileged" ON public.vulnerabilities;

CREATE POLICY "vulns_update_privileged" ON public.vulnerabilities
FOR UPDATE
TO authenticated
USING (
  (org_id = my_org_id()) 
  AND (
    (my_role() = 'admin'::text) 
    OR 
    -- PM and SE can update findings in their assigned projects
    ((my_role() = ANY (ARRAY['program_manager'::text, 'security_engineer'::text])) AND is_project_member(project_id))
    OR
    -- Developers can update findings explicitly assigned to them
    ((my_role() = 'developer'::text) AND (assigned_to = auth.uid()))
  )
);
