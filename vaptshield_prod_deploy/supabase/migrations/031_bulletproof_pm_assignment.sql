-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Unified Project Membership RLS (Migration 031)
-- Goal: Bulletproof project member management for PMs.
--       Removes dependency on security definer functions where possible.
-- ═══════════════════════════════════════════════════════════════

-- 1. Redefine DELETE policy (Simpler, more robust)
drop policy if exists "members_delete" on public.project_members;
create policy "members_delete" on public.project_members for delete
using (
  -- 1. Org Boundary
  project_id in (select id from projects where org_id = my_org_id())
  and (
    -- 2. Admin can delete anyone in org
    my_role() = 'admin'
    or (
      -- 3. PM can delete if they are project creator OR a current project member
      my_role() = 'program_manager'
      and (
        exists (select 1 from projects where id = project_id and created_by = auth.uid())
        or exists (select 1 from public.project_members where project_id = project_members.project_id and profile_id = auth.uid())
      )
      and (
        -- 4. BUT PM can ONLY delete Security Engineers or Guests
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      )
    )
  )
);

-- 2. Redefine INSERT policy
drop policy if exists "members_insert" on public.project_members;
create policy "members_insert" on public.project_members for insert
with check (
  project_id in (select id from projects where org_id = my_org_id())
  and (
    my_role() = 'admin'
    or (
      my_role() = 'program_manager'
      and (
        exists (select 1 from projects where id = project_id and created_by = auth.uid())
        or exists (select 1 from public.project_members where project_id = project_members.project_id and profile_id = auth.uid())
      )
      and (
        -- PM can manage self or SE/Guest
        profile_id = auth.uid() 
        or (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      )
    )
  )
);

-- 3. Redefine UPDATE policy
drop policy if exists "members_update" on public.project_members;
create policy "members_update" on public.project_members for update
using (
  project_id in (select id from projects where org_id = my_org_id())
  and (
    my_role() = 'admin'
    or (
      my_role() = 'program_manager'
      and (
        exists (select 1 from projects where id = project_id and created_by = auth.uid())
        or exists (select 1 from public.project_members where project_id = project_members.project_id and profile_id = auth.uid())
      )
      and (
        -- PM can update self or SE/Guest
        profile_id = auth.uid() 
        or (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      )
    )
  )
)
with check (
  project_id in (select id from projects where org_id = my_org_id())
  and (
    my_role() = 'admin'
    or (
      my_role() = 'program_manager'
      and (
        -- RE-VERIFY membership in WITH CHECK to be absolutely sure
        exists (select 1 from projects where id = project_id and created_by = auth.uid())
        or exists (select 1 from public.project_members where project_id = project_members.project_id and profile_id = auth.uid())
      )
      and (
        profile_id = auth.uid() 
        or (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      )
    )
  )
);
