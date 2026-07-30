-- ============================================================
-- VAPTShield Migration 063: Harden Vulnerability RLS
-- Fixes the 'Empty Tracker' bug for Developers by ensuring
-- that any user can see findings explicitly assigned to them,
-- even if they aren't (yet) in the project_members table.
-- ============================================================

DROP POLICY IF EXISTS "vulns_select" ON public.vulnerabilities;

CREATE POLICY "vulns_select" ON public.vulnerabilities
FOR SELECT
TO authenticated
USING (
  (org_id = my_org_id()) 
  AND 
  (NOT is_super_admin()) 
  AND (
    -- 1. Admins see everything in the org
    (my_role() = 'admin'::text) 
    OR 
    -- 2. Project members see everything in their projects
    is_project_member(project_id) 
    OR 
    -- 3. Explicit Assignees see what they are assigned to (Crucial Fix)
    (assigned_to = auth.uid())
    OR
    -- 4. Project creators (handles PM-created projects)
    (EXISTS (
        SELECT 1 FROM projects 
        WHERE projects.id = vulnerabilities.project_id 
        AND projects.created_by = auth.uid()
    ))
  )
);
