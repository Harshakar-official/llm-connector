-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Project Creator & SE Report Fix (Migration 023)
-- Goal: 
-- 1. Allow project creators (PMs) to see resources in their projects 
--    even if not explicitly assigned as a member.
-- 2. Allow Security Engineers to generate premium reports.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. VULNERABILITIES: Allow project creators ────────────────
drop policy if exists "vulns_select" on vulnerabilities;
create policy "vulns_select" on vulnerabilities for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
    or exists (select 1 from projects where id = project_id and created_by = auth.uid())
  )
);

-- ─── 2. REPORTS: Allow project creators ────────────────────────
drop policy if exists "reports_select" on reports;
create policy "reports_select" on reports for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
    or exists (select 1 from projects where id = project_id and created_by = auth.uid())
  )
);

-- ─── 3. TRACKER: Allow project creators ────────────────────────
drop policy if exists "tracker_select" on tracker;
create policy "tracker_select" on tracker for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
    or exists (select 1 from projects where id = project_id and created_by = auth.uid())
  )
);

-- ─── 4. SCAN HISTORY: Allow project creators ───────────────────
drop policy if exists "scan_history_select" on scan_history;
create policy "scan_history_select" on scan_history for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
    or exists (select 1 from projects where id = project_id and created_by = auth.uid())
  )
);

-- ─── 5. REPORTS INSERT: Allow Security Engineer ────────────────
drop policy if exists "reports_insert" on reports;
create policy "reports_insert" on reports for insert
with check (
  org_id = my_org_id()
  and my_role() in ('admin', 'program_manager', 'security_engineer')
);

-- ─── 6. REPORTS UPDATE: Allow Security Engineer ────────────────
drop policy if exists "reports_update" on reports;
create policy "reports_update" on reports for update
using (
  org_id = my_org_id()
  and my_role() in ('admin', 'program_manager', 'security_engineer')
);
