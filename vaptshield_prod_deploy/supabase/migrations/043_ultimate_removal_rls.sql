-- ============================================================
-- VAPTShield Migration 043: Final RLS Fix for User Removal
-- accounts for is_active column and NULL transitions
-- ============================================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS "profiles_update_pm" ON profiles;

-- Create the ultimate removal-friendly policy
CREATE POLICY "profiles_update_pm" ON profiles
  FOR UPDATE
  USING (
    -- Check if PM is acting on someone in their org who is NOT an admin/PM
    (my_role() = 'program_manager' AND org_id = my_org_id() AND role IN ('security_engineer', 'guest', 'developer'))
  )
  WITH CHECK (
    -- Allow the PM to perform the update
    (my_role() = 'program_manager') AND (
        -- Option A: Stay in the org
        (org_id = my_org_id() AND role IN ('security_engineer', 'guest', 'developer'))
        OR
        -- Option B: Removal from org (This matches removeUserFromOrg exactly)
        (org_id IS NULL AND role = 'guest' AND is_active = false)
    )
  );

-- Update Admin policy to be equally flexible
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE
  USING (
    (my_role() = 'admin' AND org_id = my_org_id())
  )
  WITH CHECK (
    (my_role() = 'admin') AND (
        (org_id = my_org_id())
        OR
        (org_id IS NULL AND role = 'guest' AND is_active = false)
    )
  );
