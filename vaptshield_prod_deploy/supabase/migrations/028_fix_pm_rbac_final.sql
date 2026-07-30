-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — PM RBAC Hardening Final (Migration 028)
-- Goal: Fix PMs being unable to update their own project membership
--       and ensure they can manage SE/Guest roles as intended.
-- ═══════════════════════════════════════════════════════════════

-- 1. Fix UPDATE policy for PM self-management
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
          -- PM can update their own entry or those of SE/Guest
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
          profile_id = auth.uid() 
          or 
          (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
        )
      else false
    end
  )
);

-- 2. Ensure DELETE policy allows PM to manage lower roles
-- (Note: Server action protects PM/Admin roles from deletion by a PM)
drop policy if exists "members_delete" on public.project_members;
create policy "members_delete" on public.project_members for delete
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
          -- PM can only delete SEs or Guests
          (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
        )
      else false
    end
  )
);
