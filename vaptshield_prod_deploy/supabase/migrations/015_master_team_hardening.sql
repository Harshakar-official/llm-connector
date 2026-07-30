-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Master Team Management Hardening (Migration 015)
-- Goal: Fix Admin "God Mode" regression and harden PM management
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure the helper function is robust
create or replace function check_project_membership(p_project_id uuid, p_user_id uuid) 
returns boolean as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and profile_id = p_user_id
  );
$$ language sql security definer stable;

-- 2. Drop and Recreate member_insert policy (Z+ Hardened)
drop policy if exists "members_insert" on project_members;
create policy "members_insert" on project_members for insert
with check (
  -- Level 1: Organization Isolation (Mandatory for everyone)
  project_id in (select id from projects where org_id = my_org_id())
  and
  (
    -- Level 2: Role Based Logic
    case 
      -- ADMIN: Full control over their own organization projects
      when my_role() = 'admin' then true
      
      -- PROGRAM MANAGER: Limited to projects they are part of
      when my_role() = 'program_manager' then 
        (
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid())
        )
        and 
        -- Role Hierarchy: PM cannot assign Admins
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      
      -- OTHERS: Explicitly denied
      else false
    end
  )
);

-- 3. Drop and Recreate member_delete policy (Z+ Hardened)
drop policy if exists "members_delete" on project_members;
create policy "members_delete" on project_members for delete
using (
  -- Level 1: Organization Isolation
  project_id in (select id from projects where org_id = my_org_id())
  and
  (
    -- Level 2: Role Based Logic
    case 
      -- ADMIN: Full control
      when my_role() = 'admin' then true
      
      -- PROGRAM MANAGER: Limited
      when my_role() = 'program_manager' then 
        (
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid())
        )
        and 
        -- Role Hierarchy: PM cannot remove Admins
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      
      else false
    end
  )
);
