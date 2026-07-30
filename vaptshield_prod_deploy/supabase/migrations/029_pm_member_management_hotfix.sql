-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — PM Member Management Hotfix (Migration 029)
-- Goal: Fix PMs unable to manage members for projects assigned by Admins.
--       The current RLS policies were too restrictive in the 'with check' clause.
-- ═══════════════════════════════════════════════════════════════

-- 1. Redefine check_project_membership to be security definer and robust
create or replace function public.check_project_membership(p_project_id uuid, p_user_id uuid) 
returns boolean as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and profile_id = p_user_id
  );
$$ language sql security definer stable;

-- 2. Fix INSERT policy
drop policy if exists "members_insert" on public.project_members;
create policy "members_insert" on public.project_members for insert
with check (
  project_id in (select id from projects where org_id = my_org_id())
  and
  (
    case 
      when my_role() = 'admin' then true
      
      when my_role() = 'program_manager' then 
        (
          -- Check if PM has access to the project (Creator or Member)
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid())
        )
        and 
        (
          -- Target role validation (PM can manage self or SE/Guest)
          profile_id = auth.uid() 
          or 
          (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
        )
      
      else false
    end
  )
);

-- 3. Fix UPDATE policy
drop policy if exists "members_update" on public.project_members;
create policy "members_update" on public.project_members for update
using (
  project_id in (select id from projects where org_id = my_org_id())
  and
  (
    case 
      when my_role() = 'admin' then true
      when my_role() = 'program_manager' then 
        (
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid())
        )
        and 
        (
          profile_id = auth.uid() 
          or 
          (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
        )
      else false
    end
  )
)
with check (
  project_id in (select id from projects where org_id = my_org_id())
  and
  (
    case 
      when my_role() = 'admin' then true
      when my_role() = 'program_manager' then 
        (
           -- MUST re-verify project access in with check for PM
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid())
        )
        and
        (
          profile_id = auth.uid() 
          or 
          (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
        )
      else false
    end
  )
);
