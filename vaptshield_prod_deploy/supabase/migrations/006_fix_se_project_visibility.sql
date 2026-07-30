-- Migration: Fix Security Engineer Project Visibility
-- Description: Restricts Security Engineers to only see projects they are explicitly assigned to.
-- This aligns with the "Least Privilege" principle and CLAUDE.md Section 4.

drop policy if exists "projects_select" on projects;

create policy "projects_select" on projects for select
  using (
    org_id = my_org_id()
    and not is_super_admin()
    and (
      my_role() in ('admin','program_manager')
      or (my_role() in ('security_engineer', 'guest') and is_project_member(id))
    )
  );
