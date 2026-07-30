-- ============================================================
-- VAPTShield Migration 042: Fix RLS for User Removal & Protocol Logic
-- 1. Fix PM RLS policy to allow setting org_id to NULL during removal
-- ============================================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS "profiles_update_pm" ON profiles;

-- Create the refined policy
-- USING: Check if target user is eligible to be modified (current state)
-- WITH CHECK: Check if the new state is valid (allow removal to NULL org)
CREATE POLICY "profiles_update_pm" ON profiles
  FOR UPDATE
  USING (
    (my_role() = 'program_manager' AND org_id = my_org_id() AND role IN ('security_engineer', 'guest', 'developer'))
  )
  WITH CHECK (
    (my_role() = 'program_manager') AND (
        -- Either stay in the same org
        (org_id = my_org_id() AND role IN ('security_engineer', 'guest', 'developer'))
        OR
        -- Or be removed from the org (org_id becomes null, role becomes guest)
        (org_id IS NULL AND role = 'guest')
    )
  );

-- Also ensure Admin has similar flexibility if needed
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
        (org_id IS NULL AND role = 'guest')
    )
  );
