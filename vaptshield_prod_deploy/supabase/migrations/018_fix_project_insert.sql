-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Project Creation Fix (Migration 018)
-- Goal: Fix RLS issue where PM/Admin cannot insert into projects 
--       due to org_id mismatch or missing checks.
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure projects_insert is correct and robust
-- The "check" must verify the user's role and their organization.
drop policy if exists "projects_insert" on projects;
create policy "projects_insert" on projects for insert
with check (
  -- Level 1: Must be part of the organization they are inserting into
  org_id = my_org_id()
  and
  -- Level 2: Role check (Admin and PM only)
  my_role() in ('admin', 'program_manager')
);

-- 2. Ensure creator access for selection is solid
drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects for select
using (
  org_id = my_org_id()
  and (
    my_role() = 'admin'
    or is_project_member(id)
    or created_by = auth.uid()
  )
);
