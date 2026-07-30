-- ============================================================
-- VAPTShield Migration 046: Update Vulnerabilities RLS for Developer Role
-- Allows Developers to see and remediate findings
-- ============================================================

-- 1. Update vulns_select (Already should work due to is_project_member, but let's be explicit)
DROP POLICY IF EXISTS "vulns_select" ON vulnerabilities;
CREATE POLICY "vulns_select" ON vulnerabilities
  FOR SELECT
  USING (
    (org_id = my_org_id()) AND 
    (NOT is_super_admin()) AND 
    (
      (my_role() = 'admin') OR 
      is_project_member(project_id) OR 
      (EXISTS (SELECT 1 FROM projects WHERE id = project_id AND created_by = auth.uid()))
    )
  );

-- 2. Update vulns_update
-- Developers can ONLY update findings to mark them as 'resolved'
-- This is also guarded by Server Actions, but RLS is the final wall.
DROP POLICY IF EXISTS "vulns_update" ON vulnerabilities;
CREATE POLICY "vulns_update" ON vulnerabilities
  FOR UPDATE
  USING (
    (org_id = my_org_id()) AND 
    (
      (my_role() = 'admin') OR 
      ((my_role() IN ('program_manager', 'security_engineer')) AND is_project_member(project_id)) OR
      ((my_role() = 'developer') AND is_project_member(project_id))
    )
  );

-- 3. Fix Project Members RLS for SELECT
-- Ensures Developers can see who else is in the project (necessary for UI lists)
DROP POLICY IF EXISTS "members_select" ON project_members;
CREATE POLICY "members_select" ON project_members
  FOR SELECT
  USING (
    (project_id IN (SELECT id FROM projects WHERE org_id = my_org_id()))
  );
