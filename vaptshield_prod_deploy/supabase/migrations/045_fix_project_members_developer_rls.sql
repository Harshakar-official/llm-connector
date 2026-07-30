-- ============================================================
-- VAPTShield Migration 045: Fix Project Member RLS for Developer Role
-- Allows PMs to manage Developers in projects
-- ============================================================

-- 1. Fix members_delete
DROP POLICY IF EXISTS "members_delete" ON project_members;
CREATE POLICY "members_delete" ON project_members
  FOR DELETE
  USING (
    (project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())) AND
    CASE
      WHEN (my_role() = 'admin') THEN true
      WHEN (my_role() = 'program_manager') THEN (
        (EXISTS (SELECT 1 FROM projects WHERE id = project_members.project_id AND created_by = auth.uid()) 
         OR check_project_membership(project_id, auth.uid())) 
        AND 
        ((SELECT role FROM profiles WHERE id = project_members.profile_id) IN ('security_engineer', 'guest', 'developer'))
      )
      ELSE false
    END
  );

-- 2. Fix members_insert
DROP POLICY IF EXISTS "members_insert" ON project_members;
CREATE POLICY "members_insert" ON project_members
  FOR INSERT
  WITH CHECK (
    (project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())) AND
    CASE
      WHEN (my_role() = 'admin') THEN true
      WHEN (my_role() = 'program_manager') THEN (
        (EXISTS (SELECT 1 FROM projects WHERE id = project_members.project_id AND created_by = auth.uid()) 
         OR check_project_membership(project_id, auth.uid())) 
        AND 
        (profile_id = auth.uid() OR (SELECT role FROM profiles WHERE id = profile_id) IN ('security_engineer', 'guest', 'developer'))
      )
      ELSE false
    END
  );

-- 3. Fix members_update
DROP POLICY IF EXISTS "members_update" ON project_members;
CREATE POLICY "members_update" ON project_members
  FOR UPDATE
  USING (
    (project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())) AND
    CASE
      WHEN (my_role() = 'admin') THEN true
      WHEN (my_role() = 'program_manager') THEN (
        (EXISTS (SELECT 1 FROM projects WHERE id = project_members.project_id AND created_by = auth.uid()) 
         OR check_project_membership(project_id, auth.uid())) 
        AND 
        (profile_id = auth.uid() OR (SELECT role FROM profiles WHERE id = profile_id) IN ('security_engineer', 'guest', 'developer'))
      )
      ELSE false
    END
  )
  WITH CHECK (
    (project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())) AND
    CASE
      WHEN (my_role() = 'admin') THEN true
      WHEN (my_role() = 'program_manager') THEN (
        (EXISTS (SELECT 1 FROM projects WHERE id = project_members.project_id AND created_by = auth.uid()) 
         OR check_project_membership(project_id, auth.uid())) 
        AND 
        (profile_id = auth.uid() OR (SELECT role FROM profiles WHERE id = profile_id) IN ('security_engineer', 'guest', 'developer'))
      )
      ELSE false
    END
  );
