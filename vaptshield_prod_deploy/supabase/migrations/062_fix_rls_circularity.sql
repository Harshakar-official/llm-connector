-- ============================================================
-- VAPTShield Migration 062: Resolve RLS Circular Dependency
-- Fixes the 'Empty Tracker' bug for Developers by allowing 
-- users to see their own project memberships without a 
-- recursive join to the projects table.
-- ============================================================

DROP POLICY IF EXISTS "members_select" ON public.project_members;

CREATE POLICY "members_select" ON public.project_members
FOR SELECT
TO authenticated
USING (
  -- 1. Users can always see their own memberships
  (profile_id = auth.uid()) 
  OR 
  -- 2. Privileged roles can see all memberships in the org
  -- Note: We use my_role() and my_org_id() which are stable helpers
  (
    (my_role() = ANY (ARRAY['admin'::text, 'program_manager'::text, 'security_engineer'::text]))
    AND
    (EXISTS (
        -- We check organization match using a direct ID comparison if possible,
        -- but since project_members doesn't have org_id, we use the projects table.
        -- To avoid recursion, we assume that if you are one of these roles, 
        -- you have the right to know who is on the team for projects in your org.
        -- This subquery is safe because it's non-recursive for these roles.
        SELECT 1 FROM projects WHERE id = project_id AND org_id = my_org_id()
    ))
  )
);

-- Ensure the 'is_project_member' function is robust and handles the ID match correctly
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean AS $$
BEGIN
   RETURN EXISTS (
     SELECT 1 FROM project_members
     WHERE project_id = p_project_id AND profile_id = auth.uid()
   );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
