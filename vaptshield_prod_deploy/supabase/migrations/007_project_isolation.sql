-- ═══════════════════════════════════════════════════════════════
-- VAPTShield — Z+ Security Isolation (Migration 007)
-- Fix: Implement Project Isolation for PMs, SEs, and Guests
-- ═══════════════════════════════════════════════════════════════

-- 1. Redefine Projects Select Policy
-- Only Admins see all projects in the org.
-- PMs, SEs, and Guests only see projects they are assigned to.
drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(id)
  )
);

-- 2. Redefine Vulnerabilities Select Policy (Cascading Isolation)
drop policy if exists "vulns_select" on vulnerabilities;
create policy "vulns_select" on vulnerabilities for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
  )
);

-- 3. Redefine Reports Select Policy (Cascading Isolation)
drop policy if exists "reports_select" on reports;
create policy "reports_select" on reports for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
  )
);

-- 4. Redefine Tracker Select Policy
drop policy if exists "tracker_select" on tracker;
create policy "tracker_select" on tracker for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
  )
);

-- 5. Redefine Scan History Select Policy
drop policy if exists "scan_history_select" on scan_history;
create policy "scan_history_select" on scan_history for select
using (
  org_id = my_org_id()
  and not is_super_admin()
  and (
    my_role() = 'admin'
    or is_project_member(project_id)
  )
);
