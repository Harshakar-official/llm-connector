-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — PM Team Management Fix (Migration 014 - REVISED)
-- Goal: Ensure PMs can manage members for projects they are assigned to
--       Fixes RLS error when PM assigns SE to a project created by Admin
-- ═══════════════════════════════════════════════════════════════

-- 1. Create a SECURITY DEFINER helper to check project membership
-- This bypasses RLS during the check to avoid circular dependency
create or replace function check_project_membership(p_project_id uuid, p_user_id uuid) 
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and profile_id = p_user_id
  );
$$ language sql security definer stable;

-- 2. Drop and Recreate member_insert policy
drop policy if exists "members_insert" on project_members;
create policy "members_insert" on project_members for insert
with check (
  (
    -- Org & Role Check
    my_role() in ('admin', 'program_manager')
    and project_id in (select id from projects where org_id = my_org_id())
  )
  and
  (
    -- Project Ownership/Assignment Check for PMs
    case 
      when my_role() = 'program_manager' then 
        (
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid()) -- Use security definer helper
        )
      else true
    end
  )
  and
  (
    -- Role Hierarchy Guard (PMs cannot assign Admins)
    case 
      when my_role() = 'program_manager' then 
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      else true
    end
  )
);

-- 3. Drop and Recreate member_delete policy
drop policy if exists "members_delete" on project_members;
create policy "members_delete" on project_members for delete
using (
  (
    -- Org & Role Check
    my_role() in ('admin', 'program_manager')
    and project_id in (select id from projects where org_id = my_org_id())
  )
  and
  (
    -- Project Ownership/Assignment Check for PMs
    case 
      when my_role() = 'program_manager' then 
        (
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid()) -- Use security definer helper
        )
      else true
    end
  )
  and
  (
    -- Role Hierarchy Guard (PMs cannot remove Admins)
    case 
      when my_role() = 'program_manager' then 
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      else true
    end
  )
);
