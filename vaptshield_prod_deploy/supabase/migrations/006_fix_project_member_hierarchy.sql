-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Z+ Security Hardening (Migration 006)
-- Fix: Enforce Role Hierarchy at Database Level for Project Members
-- ═══════════════════════════════════════════════════════════════

-- Drop existing policies to replace them with stronger ones
drop policy if exists "members_insert" on project_members;
drop policy if exists "members_delete" on project_members;

-- ─── REFINED INSERT POLICY ────────────────────────────────────
-- Admin: can insert anyone into their org projects
-- PM: can only insert SE or Guest into their org projects
create policy "members_insert" on project_members for insert
with check (
  (
    -- User must be Admin or PM of the same org
    my_role() in ('admin', 'program_manager')
    and project_id in (select id from projects where org_id = my_org_id())
  )
  and
  (
    -- IF the actor is PM, the target MUST NOT be an Admin
    case 
      when my_role() = 'program_manager' then 
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      else true -- Admins can assign any role
    end
  )
);

-- ─── REFINED DELETE POLICY ────────────────────────────────────
-- Admin: can delete anyone from project
-- PM: can only delete SE or Guest from project
create policy "members_delete" on project_members for delete
using (
  (
    -- User must be Admin or PM of the same org
    my_role() in ('admin', 'program_manager')
    and project_id in (select id from projects where org_id = my_org_id())
  )
  and
  (
    -- IF the actor is PM, they cannot remove someone who is an Admin
    case 
      when my_role() = 'program_manager' then 
        (select role from profiles where id = profile_id) in ('security_engineer', 'guest')
      else true -- Admins can remove anyone
    end
  )
);

-- Audit log for hierarchy violation attempts could be added here via trigger in future
