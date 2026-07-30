-- ============================================================
-- VAPTShield Migration 041: Fix PM Permissions & Invitation Roles
-- 1. Add 'developer' to invitations check constraint
-- 2. Allow PMs to update profiles (for removal/role management)
-- ============================================================

-- 1. Update invitations role constraint
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check 
  CHECK (role IN ('admin', 'program_manager', 'security_engineer', 'guest', 'developer'));

-- 2. Update profiles RLS to allow Program Managers to manage members
-- Currently, PMs are blocked by RLS even if the server action allows it.
-- We grant UPDATE permission to PMs for users in their own org who are NOT admins/PMs.
DROP POLICY IF EXISTS "profiles_update_pm" ON profiles;
CREATE POLICY "profiles_update_pm" ON profiles
  FOR UPDATE
  USING (
    (my_role() = 'program_manager' AND org_id = my_org_id() AND role IN ('security_engineer', 'guest', 'developer'))
  )
  WITH CHECK (
    (my_role() = 'program_manager' AND org_id = my_org_id() AND role IN ('security_engineer', 'guest', 'developer'))
  );

-- 3. Verify profiles_role_check (ensuring developer is included)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'profiles' AND att.attname = 'role' AND con.contype = 'c';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'admin', 'program_manager', 'security_engineer', 'guest', 'developer'));
