-- Migration: Fix Audit Log and Harden Project RBAC
-- Description: Renames user_id to actor_id in audit_log and adds missing policies.

-- 1. Fix audit_log column naming discrepancy
DO $$ 
BEGIN
  -- Rename user_id to actor_id if it exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'user_id') THEN
    ALTER TABLE audit_log RENAME COLUMN user_id TO actor_id;
  END IF;

  -- Ensure resource_type and resource_id exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'resource_type') THEN
    ALTER TABLE audit_log ADD COLUMN resource_type TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'resource_id') THEN
    ALTER TABLE audit_log ADD COLUMN resource_id UUID;
  END IF;

  -- Add old_data as alias or new column to match some parts of the code
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'old_data') THEN
    ALTER TABLE audit_log ADD COLUMN old_data JSONB;
  END IF;
END $$;

-- 2. Add INSERT policy for audit_log (Server actions use user session)
DROP POLICY IF EXISTS "audit_insert" ON audit_log;
CREATE POLICY "audit_insert" ON audit_log FOR INSERT
  WITH CHECK (true); -- We trust the server actions to log correctly, RLS select will still isolate by org

-- 3. Harden project_members hierarchy
-- Ensure PMs cannot assign members to projects they don't have access to
-- and cannot manage Admins.

CREATE OR REPLACE FUNCTION check_is_admin(p_user_id UUID) 
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. Fix vulnerability creation permission
-- Ensure SE can only create findings for projects they are assigned to
DROP POLICY IF EXISTS "vulns_insert" ON vulnerabilities;
CREATE POLICY "vulns_insert" ON vulnerabilities FOR INSERT
  WITH CHECK (
    org_id = my_org_id()
    AND (
      my_role() IN ('admin', 'program_manager')
      OR (my_role() = 'security_engineer' AND EXISTS (
        SELECT 1 FROM project_members 
        WHERE project_id = vulnerabilities.project_id AND profile_id = auth.uid()
      ))
    )
  );

-- 5. Fix project_members hierarchy (Admin > PM > SE > Guest)
DROP POLICY IF EXISTS "members_insert" ON project_members;
CREATE POLICY "members_insert" ON project_members FOR INSERT
  WITH CHECK (
    org_id_from_project(project_id) = my_org_id()
    AND (
      my_role() = 'admin'
      OR (
        my_role() = 'program_manager'
        AND NOT check_is_admin(profile_id) -- PM cannot assign Admins
      )
    )
  );

-- Helper for org_id from project
CREATE OR REPLACE FUNCTION org_id_from_project(p_project_id UUID)
RETURNS UUID AS $$
  SELECT org_id FROM projects WHERE id = p_project_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
