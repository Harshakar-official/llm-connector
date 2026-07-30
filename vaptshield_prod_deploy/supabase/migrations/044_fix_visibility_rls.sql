-- ============================================================
-- VAPTShield Migration 044: Visibility RLS Hardening
-- Ensures updates don't fail when rows become 'invisible'
-- ============================================================

-- 1. Update SELECT policy to allow seeing "Guest" users if you are an Admin/PM
-- This ensures that when a user is moved to 'guest' (NULL org), the 
-- transaction can still "see" the row to confirm the check.
DROP POLICY IF EXISTS "profiles_select_org" ON profiles;
CREATE POLICY "profiles_select_org" ON profiles
  FOR SELECT
  USING (
    (org_id = my_org_id()) 
    OR 
    (my_role() IN ('admin', 'program_manager') AND role = 'guest' AND org_id IS NULL)
  );

-- 2. Ensure profiles_select is also permissive enough
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT
  USING (
    (org_id = my_org_id()) 
    OR 
    (id = auth.uid()) 
    OR 
    is_super_admin()
    OR
    (my_role() IN ('admin', 'program_manager') AND role = 'guest' AND org_id IS NULL)
  );
