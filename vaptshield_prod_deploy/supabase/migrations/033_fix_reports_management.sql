-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Reports Management Fix (Migration 033)
-- Goal: Fix report deletion blocking and ensure all project members 
--       (Admin, PM, SE) can manage project reports.
-- ═══════════════════════════════════════════════════════════════

-- 1. Redefine SELECT policy for reports
DROP POLICY IF EXISTS "reports_select" ON public.reports;
CREATE POLICY "reports_select" ON public.reports FOR SELECT
USING (
  org_id = my_org_id() 
  AND (
    my_role() = 'admin' 
    OR is_member_of_project(project_id, auth.uid())
    OR is_project_creator(project_id, auth.uid())
  )
);

-- 2. Redefine INSERT policy for reports
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports FOR INSERT
WITH CHECK (
  org_id = my_org_id() 
  AND (
    my_role() = 'admin' 
    OR is_member_of_project(project_id, auth.uid())
    OR is_project_creator(project_id, auth.uid())
  )
);

-- 3. Redefine UPDATE policy for reports
DROP POLICY IF EXISTS "reports_update" ON public.reports;
CREATE POLICY "reports_update" ON public.reports FOR UPDATE
USING (
  org_id = my_org_id() 
  AND (
    my_role() = 'admin' 
    OR is_member_of_project(project_id, auth.uid())
    OR is_project_creator(project_id, auth.uid())
  )
);

-- 4. Create DELETE policy for reports (CRITICAL FIX)
DROP POLICY IF EXISTS "reports_delete" ON public.reports;
CREATE POLICY "reports_delete" ON public.reports FOR DELETE
USING (
  org_id = my_org_id() 
  AND (
    my_role() = 'admin' 
    OR is_member_of_project(project_id, auth.uid())
    OR is_project_creator(project_id, auth.uid())
  )
);
