-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Fix PM Self-Assignment (Migration 025)
-- Goal: Allow PMs to assign themselves to projects they create.
-- ═══════════════════════════════════════════════════════════════

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
          exists (select 1 from projects where id = project_id and created_by = auth.uid())
          or check_project_membership(project_id, auth.uid())
        )
        and 
        (
          -- PM can assign themselves OR others with lower roles
          profile_id = auth.uid() 
          or 
          (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
        )
      
      else false
    end
  )
);
