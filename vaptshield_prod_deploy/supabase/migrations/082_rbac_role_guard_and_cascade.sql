-- ============================================================================
-- 082_rbac_role_guard_and_cascade.sql
-- ----------------------------------------------------------------------------
-- 1. Prevents admin from changing their own role (self-escalation guard)
-- 2. Allows super_admin to view audit logs
-- 3. Allows admin to delete users in their own org
-- 4. Adds proper cascade handling for user deletion
-- ============================================================================

-- ── 1. Guard: Admin cannot change own role ─────────────────────────────────
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (my_role() = 'admin' AND org_id = my_org_id())
  WITH CHECK (
    my_role() = 'admin'
    AND org_id = my_org_id()
    AND (
      id <> auth.uid()
      OR (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()))
    )
  );

-- ── 2. Allow super_admin to view audit logs ───────────────────────────────
DROP POLICY IF EXISTS "audit_select" ON audit_log;
CREATE POLICY "audit_select" ON audit_log FOR SELECT
  USING (
    (org_id = my_org_id() AND my_role() = 'admin')
    OR is_super_admin()
  );

-- ── 3. Allow admin to delete users in their org ───────────────────────────
DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  USING (
    is_super_admin()
    OR (my_role() = 'admin' AND org_id = my_org_id() AND id <> auth.uid())
  );

-- ── 4. Add ON DELETE SET NULL for profile references to prevent FK errors ─
-- When a user is deleted, unassign them from findings/projects instead of failing

ALTER TABLE vulnerabilities 
  DROP CONSTRAINT IF EXISTS vulnerabilities_found_by_fkey,
  ADD CONSTRAINT vulnerabilities_found_by_fkey 
    FOREIGN KEY (found_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE vulnerabilities 
  DROP CONSTRAINT IF EXISTS vulnerabilities_assigned_to_fkey,
  ADD CONSTRAINT vulnerabilities_assigned_to_fkey 
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE vulnerabilities 
  DROP CONSTRAINT IF EXISTS vulnerabilities_verified_by_fkey,
  ADD CONSTRAINT vulnerabilities_verified_by_fkey 
    FOREIGN KEY (verified_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE vulnerabilities 
  DROP CONSTRAINT IF EXISTS vulnerabilities_approved_by_fkey,
  ADD CONSTRAINT vulnerabilities_approved_by_fkey 
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE projects 
  DROP CONSTRAINT IF EXISTS projects_created_by_fkey,
  ADD CONSTRAINT projects_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE docker_sessions 
  DROP CONSTRAINT IF EXISTS docker_sessions_user_id_fkey,
  ADD CONSTRAINT docker_sessions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE invitations 
  DROP CONSTRAINT IF EXISTS invitations_invited_by_fkey,
  ADD CONSTRAINT invitations_invited_by_fkey 
    FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE SET NULL;
