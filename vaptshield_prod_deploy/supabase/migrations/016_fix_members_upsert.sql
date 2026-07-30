-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Project Members Update Fix (Migration 016)
-- Goal: Add missing UPDATE policy for project_members to support .upsert()
--       Fixes "USING expression" violation for Admins and PMs
-- ═══════════════════════════════════════════════════════════════

-- 1. Add UPDATE policy for project_members
-- This is critical for .upsert() operations when a member is already assigned.
drop policy if exists "members_update" on project_members;
create policy "members_update" on project_members for update
using (
  -- Level 1: Organization Isolation
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
        -- Role Hierarchy: PM cannot update Admin's membership details
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      
      -- OTHERS: Explicitly denied
      else false
    end
  )
)
with check (
  -- Ensure the new data also follows the same rules
  project_id in (select id from projects where org_id = my_org_id())
  and
  (
    case 
      when my_role() = 'admin' then true
      when my_role() = 'program_manager' then 
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      else false
    end
  )
);

-- Note: No changes needed to select/insert/delete as they are already hardened in Migration 015.
