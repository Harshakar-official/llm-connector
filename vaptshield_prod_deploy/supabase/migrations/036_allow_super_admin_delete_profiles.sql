-- Migration: Allow Super Admin to Delete Profiles
-- Description: Adds a DELETE policy to the profiles table for platform staff.

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE
USING (
  is_super_admin()
);
