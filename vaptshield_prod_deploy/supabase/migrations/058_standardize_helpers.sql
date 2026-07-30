-- ============================================================
-- VAPTShield Migration 058: Helper Function Cleanup
-- Standardizing RLS helpers without dropping dependent policies
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_project(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND profile_id = p_user_id
  );
$$;
