-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Tracker RLS Hardening (Migration 035)
-- Goal: Fix potential recursion in tracker table and ensure 
--       membership-based access.
-- ═══════════════════════════════════════════════════════════════

-- 1. Redefine SELECT policy for tracker
DROP POLICY IF EXISTS "tracker_select" ON public.tracker;
CREATE POLICY "tracker_select" ON public.tracker FOR SELECT
USING (
  org_id = my_org_id() 
  AND (
    my_role() = 'admin' 
    OR is_member_of_project(project_id, auth.uid())
    OR is_project_creator(project_id, auth.uid())
  )
);

-- 2. Redefine INSERT policy for tracker
DROP POLICY IF EXISTS "tracker_insert" ON public.tracker;
CREATE POLICY "tracker_insert" ON public.tracker FOR INSERT
WITH CHECK (
  org_id = my_org_id() 
  AND (
    my_role() = ANY (ARRAY['admin', 'program_manager', 'security_engineer'])
    AND (
        my_role() = 'admin'
        OR is_member_of_project(project_id, auth.uid())
        OR is_project_creator(project_id, auth.uid())
    )
  )
);

-- 3. Redefine UPDATE policy for tracker
DROP POLICY IF EXISTS "tracker_update" ON public.tracker;
CREATE POLICY "tracker_update" ON public.tracker FOR UPDATE
USING (
  org_id = my_org_id() 
  AND (
    my_role() = ANY (ARRAY['admin', 'program_manager', 'security_engineer'])
    AND (
        my_role() = 'admin'
        OR is_member_of_project(project_id, auth.uid())
        OR is_project_creator(project_id, auth.uid())
    )
  )
);

-- 4. Redefine DELETE policy for tracker
DROP POLICY IF EXISTS "tracker_delete" ON public.tracker;
CREATE POLICY "tracker_delete" ON public.tracker FOR DELETE
USING (
  org_id = my_org_id() 
  AND (
    my_role() = ANY (ARRAY['admin', 'program_manager'])
    AND (
        my_role() = 'admin'
        OR is_member_of_project(project_id, auth.uid())
        OR is_project_creator(project_id, auth.uid())
    )
  )
);
