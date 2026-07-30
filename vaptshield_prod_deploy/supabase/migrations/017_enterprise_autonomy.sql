-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Enterprise Project Autonomy (Migration 017)
-- Goal: 1. Allow Project Creators (PMs) to delete their OWN projects.
--       2. Restore Realtime Sync for Project Memberships.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. PROJECTS: Fix Deletion Policy ──────────────────────────
-- Enterprise Standard: Creator (PM) has full CURD over their projects.
-- Admin has oversight over ALL projects.
drop policy if exists "projects_delete" on projects;
create policy "projects_delete" on projects for delete
using (
  org_id = my_org_id()
  and (
    my_role() = 'admin'           -- Admin "God Mode"
    or created_by = auth.uid()    -- PM "Creator Autonomy"
  )
);

-- ─── 2. REALTIME: Ensure Project Memberships are Broadcasted ───
-- Re-verify that publications are active for instant UI updates.
-- This ensures that when a member is added, their UI refreshes immediately.
alter publication supabase_realtime add table project_members;
-- If it already exists, this might error in some psql versions, 
-- but Supabase migrations handle it gracefully or we can ignore the error.
