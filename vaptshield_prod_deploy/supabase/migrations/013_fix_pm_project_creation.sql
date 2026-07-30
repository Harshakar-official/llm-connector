-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — PM Project Creation Fix (Migration 013)
-- Goal: Allow project creators to see their own projects 
--       (Fixes RLS error when PM creates a project)
-- ═══════════════════════════════════════════════════════════════

-- Redefine Projects Select Policy to include creator access
-- This fixes the "chicken and egg" problem where a PM creates a project
-- but can't see it to finish the transaction because they aren't a member yet.
drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(id)
    or created_by = auth.uid() -- Z+ Security: Creator always has visibility
  )
);

-- Ensure projects_insert is solid
drop policy if exists "projects_insert" on projects;
create policy "projects_insert" on projects for insert
with check (
  org_id = my_org_id()
  and my_role() in ('admin', 'program_manager')
);

-- Audit log check: Ensure PMs can't bypass Org isolation
-- (Already handled by my_org_id() check in policies)
