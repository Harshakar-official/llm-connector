-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Infinite Recursion Fix (Migration 032)
-- Goal: Fix "infinite recursion detected" by using SECURITY DEFINER
--       functions to break the RLS self-reference loop.
-- ═══════════════════════════════════════════════════════════════

-- 1. Create a helper function that BYPASSES RLS to check membership
-- This is the standard way to solve RLS recursion in Supabase/Postgres.
CREATE OR REPLACE FUNCTION public.is_member_of_project(p_project_id uuid, p_user_id uuid) 
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND profile_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Create a helper to check project creator (bypassing RLS)
CREATE OR REPLACE FUNCTION public.is_project_creator(p_project_id uuid, p_user_id uuid) 
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND created_by = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. Redefine SELECT policy (Avoid recursion)
DROP POLICY IF EXISTS "members_select" ON public.project_members;
CREATE POLICY "members_select" ON public.project_members FOR SELECT
USING (
  -- Org Boundary (Safe, projects table has its own RLS)
  project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())
);

-- 4. Redefine INSERT policy (Using helper functions to break loop)
DROP POLICY IF EXISTS "members_insert" ON public.project_members;
CREATE POLICY "members_insert" ON public.project_members FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())
  AND (
    my_role() = 'admin'
    OR (
      my_role() = 'program_manager'
      AND (
        is_project_creator(project_id, auth.uid()) 
        OR is_member_of_project(project_id, auth.uid())
      )
      AND (
        -- PM can manage self or SE/Guest
        profile_id = auth.uid() 
        OR (SELECT role FROM profiles WHERE id = profile_id) IN ('security_engineer', 'guest')
      )
    )
  )
);

-- 5. Redefine UPDATE policy
DROP POLICY IF EXISTS "members_update" ON public.project_members;
CREATE POLICY "members_update" ON public.project_members FOR UPDATE
USING (
  project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())
  AND (
    my_role() = 'admin'
    OR (
      my_role() = 'program_manager'
      AND (
        is_project_creator(project_id, auth.uid()) 
        OR is_member_of_project(project_id, auth.uid())
      )
      AND (
        profile_id = auth.uid() 
        OR (SELECT role FROM profiles WHERE id = profile_id) IN ('security_engineer', 'guest')
      )
    )
  )
)
WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())
  AND (
    my_role() = 'admin'
    OR (
      my_role() = 'program_manager'
      AND (
        is_project_creator(project_id, auth.uid()) 
        OR is_member_of_project(project_id, auth.uid())
      )
      AND (
        profile_id = auth.uid() 
        OR (SELECT role FROM profiles WHERE id = profile_id) IN ('security_engineer', 'guest')
      )
    )
  )
);

-- 6. Redefine DELETE policy
DROP POLICY IF EXISTS "members_delete" ON public.project_members;
CREATE POLICY "members_delete" ON public.project_members FOR DELETE
USING (
  project_id IN (SELECT id FROM projects WHERE org_id = my_org_id())
  AND (
    my_role() = 'admin'
    OR (
      my_role() = 'program_manager'
      AND (
        is_project_creator(project_id, auth.uid()) 
        OR is_member_of_project(project_id, auth.uid())
      )
      AND (
        -- PM can only delete SEs or Guests
        (SELECT role FROM profiles WHERE id = profile_id) IN ('security_engineer', 'guest')
      )
    )
  )
);
